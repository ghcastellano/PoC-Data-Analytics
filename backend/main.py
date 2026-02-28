"""
Autonomous Analytics Copilot — Backend
FastAPI + GPT-4o Agent + PostgreSQL
"""
import os
import json
import time
import traceback
from datetime import datetime
from decimal import Decimal
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import psycopg2
import psycopg2.extras
from openai import OpenAI

from dotenv import load_dotenv
load_dotenv()

app = FastAPI(title="Analytics Copilot API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://copilot:copilot123@localhost:5432/copilot_lakehouse")

# ─── Schema context for GPT-4o ───

SCHEMA_CONTEXT = """
You are an analytics SQL agent for a consulting company's internal data. You generate PostgreSQL queries.

DATABASE SCHEMA:

TABLE business_units (id, name, code, region)
- Rows: Banking & Financial Services (BFS), Insurance (INS), Telco & Media (TELCO)
- All region = 'IBIOL'

TABLE service_lines (id, name, code)
- Rows: Data & Analytics (DA), Cloud & Infrastructure (CLOUD), Application Development (APPDEV), AI & Intelligent Solutions (AI), Cybersecurity (SEC)

TABLE monthly_metrics (id, business_unit_id FK, service_line_id FK, period DATE, revenue DECIMAL, pipeline DECIMAL, margin_pct DECIMAL, headcount INT, utilization_pct DECIMAL, nps_score DECIMAL, active_projects INT, new_deals INT, churn_rate DECIMAL, avg_deal_size DECIMAL)
- period is first day of month (e.g., 2024-01-01, 2024-02-01)
- Data available: January 2024 through December 2025
- revenue and pipeline are in USD
- margin_pct, utilization_pct, churn_rate are percentages (e.g., 28.5 means 28.5%)
- nps_score ranges from ~30 to ~75

TABLE projects (id, name, business_unit_id FK, service_line_id FK, status VARCHAR, start_date DATE, end_date DATE, value DECIMAL, client_name VARCHAR)
- status: 'Active', 'Completed', 'Pipeline'

TABLE data_lineage (id, table_name, source_system, refresh_frequency, last_refresh TIMESTAMP, data_quality_score DECIMAL, owner)

RULES:
- Always JOIN with business_units and/or service_lines to show readable names instead of IDs
- Use period for time filtering. "Last quarter" means Q4 2025 (Oct-Dec). "This year" means 2025.
- When asked about trends, ORDER BY period ASC
- Round monetary values to 2 decimal places
- For aggregations across time, GROUP BY period and relevant dimensions
- Always include ORDER BY for deterministic results
- Limit results to 100 rows max
- Return ONLY the SQL query, no explanation, no markdown formatting, no backticks
- NEVER respond with conversational text. If the user says something like "hello" or "hi", generate a SQL query that shows a summary (e.g., total revenue by business unit for the latest period)
- Your output must ALWAYS start with SELECT, WITH, or another valid SQL keyword
"""

ANSWER_SYSTEM = """
You are an analytics copilot presenting query results to a business leader. Be concise, insightful, and professional.

Given the user's question and the SQL results, provide:
1. A direct answer to the question (1-2 sentences)
2. Key insight or trend worth noting (1 sentence)
3. Three suggested follow-up questions they might want to ask

Format your response as JSON:
{
  "answer": "Direct answer here",
  "insight": "Key insight here",
  "follow_up": "Main suggested follow-up question",
  "follow_ups": ["Drill deeper question", "Compare/contrast question", "Different angle question"],
  "confidence": "high|medium|low",
  "chart_type": "line|bar|pie|table|number",
  "chart_config": {
    "x_key": "column name for x-axis",
    "y_key": "column name for y-axis or array of column names",
    "title": "Chart title"
  }
}

For follow_ups, always provide exactly 3 related questions that naturally follow from the current results. Make them diverse: one drilling deeper, one comparing, one exploring a different angle.

Confidence levels:
- high: query returned clear, complete data
- medium: data exists but may be partial or aggregated
- low: limited data, high aggregation, or ambiguous question

Chart type selection:
- line: for trends over time (period on x-axis)
- bar: for comparisons across categories
- pie: for composition/distribution (max 6 slices)
- table: for detailed multi-column data
- number: for single KPI values
"""


class QuestionRequest(BaseModel):
    question: str
    conversation_id: Optional[str] = None


class CopilotResponse(BaseModel):
    answer: str
    insight: str
    follow_up: str
    follow_ups: list = []
    confidence: str
    chart_type: str
    chart_config: dict
    data: list
    sql: str
    execution_time_ms: int
    rows_returned: int
    lineage: list
    timestamp: str


def get_db():
    return psycopg2.connect(DATABASE_URL)


def execute_sql(sql: str) -> tuple[list[dict], list[str]]:
    conn = get_db()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(sql)
        rows = cur.fetchall()
        columns = [desc[0] for desc in cur.description] if cur.description else []
        # Convert Decimal to float for JSON serialization
        clean_rows = []
        for row in rows:
            clean = {}
            for k, v in dict(row).items():
                if isinstance(v, Decimal):
                    clean[k] = float(v)
                elif isinstance(v, (datetime,)):
                    clean[k] = v.isoformat()
                elif hasattr(v, 'isoformat'):
                    clean[k] = v.isoformat()
                else:
                    clean[k] = v
            clean_rows.append(clean)
        return clean_rows, columns
    finally:
        conn.close()


def get_lineage(sql: str) -> list[dict]:
    """Extract lineage info for tables referenced in the query."""
    conn = get_db()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT * FROM data_lineage")
        all_lineage = [dict(r) for r in cur.fetchall()]
        referenced = []
        sql_lower = sql.lower()
        for l in all_lineage:
            if l["table_name"].lower() in sql_lower:
                referenced.append({
                    "table": l["table_name"],
                    "source": l["source_system"],
                    "refresh": l["refresh_frequency"],
                    "last_refresh": l["last_refresh"].isoformat() if l["last_refresh"] else None,
                    "quality_score": float(l["data_quality_score"]) if l["data_quality_score"] else None,
                    "owner": l["owner"],
                })
        return referenced
    finally:
        conn.close()


def generate_sql(question: str) -> str:
    """Use GPT-4o to generate SQL from natural language."""
    response = client.chat.completions.create(
        model="gpt-4o",
        temperature=0,
        max_tokens=500,
        messages=[
            {"role": "system", "content": SCHEMA_CONTEXT},
            {"role": "user", "content": question},
        ],
    )
    sql = response.choices[0].message.content.strip()
    # Clean up any markdown formatting
    sql = sql.replace("```sql", "").replace("```", "").strip()
    # Validate that the response looks like SQL
    sql_upper = sql.upper().lstrip()
    valid_starts = ("SELECT", "WITH", "INSERT", "UPDATE", "DELETE", "EXPLAIN")
    if not sql_upper.startswith(valid_starts):
        # GPT returned conversational text instead of SQL — use a fallback query
        sql = """SELECT bu.name AS business_unit, ROUND(SUM(mm.revenue)::numeric, 2) AS total_revenue,
                 ROUND(AVG(mm.margin_pct)::numeric, 2) AS avg_margin
                 FROM monthly_metrics mm
                 JOIN business_units bu ON mm.business_unit_id = bu.id
                 WHERE mm.period >= '2025-10-01'
                 GROUP BY bu.name ORDER BY total_revenue DESC"""
    return sql


def generate_answer(question: str, sql: str, data: list, columns: list) -> dict:
    """Use GPT-4o to interpret results and generate answer."""
    # Truncate data for context window
    sample = data[:30] if len(data) > 30 else data

    response = client.chat.completions.create(
        model="gpt-4o",
        temperature=0.3,
        max_tokens=500,
        messages=[
            {"role": "system", "content": ANSWER_SYSTEM},
            {"role": "user", "content": json.dumps({
                "question": question,
                "sql": sql,
                "columns": columns,
                "row_count": len(data),
                "sample_data": sample,
            })},
        ],
    )

    raw = response.choices[0].message.content.strip()
    # Parse JSON from response
    raw = raw.replace("```json", "").replace("```", "").strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {
            "answer": raw,
            "insight": "",
            "follow_up": "",
            "confidence": "medium",
            "chart_type": "table",
            "chart_config": {},
        }


@app.get("/health")
def health():
    return {"status": "OK", "timestamp": datetime.now().isoformat()}


@app.get("/api/schema")
def schema():
    """Return the database schema for transparency."""
    return {
        "tables": [
            {"name": "business_units", "columns": ["id", "name", "code", "region"]},
            {"name": "service_lines", "columns": ["id", "name", "code"]},
            {"name": "monthly_metrics", "columns": ["id", "business_unit_id", "service_line_id", "period", "revenue", "pipeline", "margin_pct", "headcount", "utilization_pct", "nps_score", "active_projects", "new_deals", "churn_rate", "avg_deal_size"]},
            {"name": "projects", "columns": ["id", "name", "business_unit_id", "service_line_id", "status", "start_date", "end_date", "value", "client_name"]},
            {"name": "data_lineage", "columns": ["id", "table_name", "source_system", "refresh_frequency", "last_refresh", "data_quality_score", "owner"]},
        ]
    }


@app.get("/api/lineage")
def lineage():
    """Return full data lineage."""
    conn = get_db()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT * FROM data_lineage")
        rows = cur.fetchall()
        return [
            {
                "table": r["table_name"],
                "source": r["source_system"],
                "refresh": r["refresh_frequency"],
                "last_refresh": r["last_refresh"].isoformat() if r["last_refresh"] else None,
                "quality_score": float(r["data_quality_score"]) if r["data_quality_score"] else None,
                "owner": r["owner"],
            }
            for r in rows
        ]
    finally:
        conn.close()


@app.post("/api/ask", response_model=CopilotResponse)
def ask(req: QuestionRequest):
    """Main endpoint: natural language question → answer with chart."""
    start = time.time()

    try:
        # Step 1: Generate SQL
        sql = generate_sql(req.question)

        # Step 2: Execute SQL
        try:
            data, columns = execute_sql(sql)
        except Exception as db_err:
            # Step 2b: Self-correction — retry with error context
            retry_prompt = f"The previous SQL failed with error: {str(db_err)}. Original question: {req.question}. Please fix the SQL."
            sql = generate_sql(retry_prompt)
            data, columns = execute_sql(sql)

        # Step 3: Generate answer
        answer_data = generate_answer(req.question, sql, data, columns)

        # Step 4: Get lineage
        lineage_data = get_lineage(sql)

        elapsed = int((time.time() - start) * 1000)

        return CopilotResponse(
            answer=answer_data.get("answer", ""),
            insight=answer_data.get("insight", ""),
            follow_up=answer_data.get("follow_up", ""),
            follow_ups=answer_data.get("follow_ups", []),
            confidence=answer_data.get("confidence", "medium"),
            chart_type=answer_data.get("chart_type", "table"),
            chart_config=answer_data.get("chart_config", {}),
            data=data[:100],
            sql=sql,
            execution_time_ms=elapsed,
            rows_returned=len(data),
            lineage=lineage_data,
            timestamp=datetime.now().isoformat(),
        )

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Agent error: {str(e)}")


@app.get("/api/suggestions")
def suggestions():
    """Return suggested questions for new users."""
    return [
        "What was our total revenue by business unit last quarter?",
        "Show me the revenue trend for Banking over the last 12 months",
        "Compare margin percentages across all business units",
        "Which service line has the highest utilization rate?",
        "What is the average NPS score by business unit in 2025?",
        "How many active projects do we have per business unit?",
        "Show pipeline vs revenue ratio by business unit",
        "What is the churn rate trend for Telco?",
    ]
