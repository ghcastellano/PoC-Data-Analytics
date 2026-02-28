"""
Autonomous Analytics Copilot — Multi-Agent Backend
FastAPI + GPT-4o (SQL Agent · Analysis Agent · Narrative Agent) + PostgreSQL
"""
import os
import json
import time
import traceback
import hashlib
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional
from pathlib import Path

import yaml
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import psycopg2
import psycopg2.extras
from openai import OpenAI

from dotenv import load_dotenv
# Load .env from backend dir or project root
load_dotenv(Path(__file__).parent / ".env")
load_dotenv()  # also try project root

# ─── App setup ───

app = FastAPI(title="Analytics Copilot API", version="3.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://copilot:copilot123@localhost:5432/copilot_lakehouse")

# ─── In-memory stores ───

audit_log: list[dict] = []
successful_queries: dict[str, dict] = {}  # hash → {question, sql} for few-shot
shared_reports: dict[str, dict] = {}  # share_id → response data
conversations: dict[str, list[dict]] = {}  # conversation_id → [{question, answer, sql}]

# ─── Semantic Layer ───

SEMANTIC_LAYER_PATH = Path(__file__).parent / "semantic_layer.yaml"

def load_semantic_layer() -> dict:
    if SEMANTIC_LAYER_PATH.exists():
        with open(SEMANTIC_LAYER_PATH) as f:
            return yaml.safe_load(f)
    return {}

def build_semantic_context() -> str:
    sl = load_semantic_layer()
    if not sl:
        return ""
    parts = ["\n--- SEMANTIC LAYER (Business Context) ---\n"]
    # Metrics
    if sl.get("metrics"):
        parts.append("METRICS:")
        for key, m in sl["metrics"].items():
            desc = f"  - {m.get('display_name', key)}: {m.get('description', '')}"
            if m.get("formula"):
                desc += f" [formula: {m['formula']}]"
            if m.get("column"):
                desc += f" [column: {m['column']} in {m.get('table', '?')}]"
            if m.get("aggregation"):
                desc += f" [agg: {m['aggregation']}]"
            parts.append(desc)
    # KPI Targets
    if sl.get("kpi_targets"):
        parts.append("\nKPI TARGETS:")
        for key, t in sl["kpi_targets"].items():
            direction = t.get("direction", "")
            parts.append(f"  - {key}: target={t.get('target')}, warning={t.get('warning_threshold')}, critical={t.get('critical_threshold')} ({direction})")
    # Aliases
    if sl.get("aliases"):
        parts.append("\nALIASES (resolve these in user questions):")
        for alias, resolved in sl["aliases"].items():
            parts.append(f"  \"{alias}\" → {resolved}")
    # Example queries for few-shot
    if sl.get("example_queries"):
        parts.append("\nEXAMPLE QUERIES:")
        for ex in sl["example_queries"][:5]:
            parts.append(f"  Q: {ex['question']}")
            parts.append(f"  SQL: {ex['sql']}")
    return "\n".join(parts)


# ─── Schema Context ───

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
- IMPORTANT: When asked about CURRENT or PRESENT values (e.g., "how many active projects do we have", "what is our headcount"), filter for the LATEST period only: WHERE mm.period = (SELECT MAX(period) FROM monthly_metrics). Do NOT sum across all months for point-in-time metrics like headcount, active_projects, nps_score, utilization_pct.
- Metrics like revenue, pipeline, new_deals are cumulative and CAN be summed across periods when asking about totals.
- When asked about trends, ORDER BY period ASC
- Round monetary values to 2 decimal places
- For aggregations across time, GROUP BY period and relevant dimensions
- Always include ORDER BY for deterministic results
- Limit results to 100 rows max
- Return ONLY the SQL query, no explanation, no markdown formatting, no backticks
- NEVER respond with conversational text or a SELECT that returns a literal string message (e.g. SELECT 'not supported' AS message).
- If the user asks something unrelated, off-topic, a greeting, or something you cannot map to a data query, ALWAYS fall back to this useful summary query:
  SELECT bu.name AS business_unit, ROUND(SUM(mm.revenue)::numeric,2) AS total_revenue, ROUND(AVG(mm.utilization_pct)::numeric,1) AS avg_utilization, ROUND(AVG(mm.nps_score)::numeric,1) AS avg_nps FROM monthly_metrics mm JOIN business_units bu ON mm.business_unit_id=bu.id WHERE mm.period >= '2025-01-01' GROUP BY bu.name ORDER BY total_revenue DESC
- Your output must ALWAYS be a valid SQL query that returns real data from the database tables. Never return a SELECT with only literal/hardcoded values.
"""

# ─── Agent Prompts ───

SQL_AGENT_SYSTEM = SCHEMA_CONTEXT + build_semantic_context() + """

ADDITIONAL FEW-SHOT EXAMPLES FROM SUCCESSFUL QUERIES:
{few_shot}
"""

ANALYSIS_AGENT_SYSTEM = """You are an expert data analyst agent. Given SQL query results (as JSON), analyze them and produce structured insights.

Return JSON with:
{
  "trends": ["list of observed trends"],
  "outliers": ["any outlier data points"],
  "comparisons": ["notable comparisons between dimensions"],
  "statistics": {
    "total": <if applicable>,
    "average": <if applicable>,
    "min": <min value>,
    "max": <max value>,
    "change_pct": <period-over-period change if temporal>
  },
  "risk_flags": ["any concerning patterns"]
}

Be precise with numbers. Reference specific data points. Keep each insight to one sentence."""

NARRATIVE_AGENT_SYSTEM = """You are an executive narrative agent for a consulting firm's analytics platform. Given analysis insights and original data, produce a polished business response.

Return JSON with:
{
  "answer": "2-3 sentence executive summary answering the question directly",
  "insight": "One key actionable insight",
  "narrative": "A 3-4 sentence executive narrative with business context and recommendations",
  "recommendation": "One specific action recommendation",
  "follow_ups": ["3 suggested follow-up questions"],
  "confidence": "high|medium|low",
  "chart_type": "line|bar|pie|table|number",
  "chart_config": {
    "x_key": "column for x-axis",
    "y_key": "column(s) for y-axis",
    "title": "Chart title"
  }
}

Confidence levels:
- high: query returned clear, complete data
- medium: data exists but may be partial
- low: limited data or ambiguous question

Chart type selection:
- line: for trends over time (period on x-axis)
- bar: for comparisons across categories
- pie: for composition/distribution (max 6 slices)
- table: for detailed multi-column data
- number: for single KPI values

Use executive tone. Be concise. Reference specific numbers. Make recommendations actionable."""


# ─── Models ───

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
    narrative: str = ""
    recommendation: str = ""
    analysis: dict = {}
    agent_trace: list = []
    trust_score: float = 0.0
    conversation_id: str = ""


# ─── Database helpers ───

def get_db():
    return psycopg2.connect(DATABASE_URL)


def execute_sql(sql: str) -> tuple[list[dict], list[str]]:
    conn = get_db()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(sql)
        rows = cur.fetchall()
        columns = [desc[0] for desc in cur.description] if cur.description else []
        clean_rows = []
        for row in rows:
            clean = {}
            for k, v in dict(row).items():
                if isinstance(v, Decimal):
                    clean[k] = float(v)
                elif isinstance(v, datetime):
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


def compute_trust_score(lineage: list, confidence: str, rows: int) -> float:
    """Compute a trust score (0-100) from data quality, confidence, and result size."""
    if not lineage:
        quality_avg = 0.85
    else:
        scores = [l["quality_score"] for l in lineage if l.get("quality_score")]
        quality_avg = sum(scores) / len(scores) if scores else 0.85
    conf_map = {"high": 1.0, "medium": 0.7, "low": 0.4}
    conf_score = conf_map.get(confidence, 0.7)
    completeness = min(1.0, rows / 5) if rows > 0 else 0.3
    return round((quality_avg * 0.5 + conf_score * 0.3 + completeness * 0.2) * 100, 1)


# ─── Conversation Memory ───

def build_conversation_context(conversation_id: str) -> str:
    """Build context from previous conversation turns."""
    if not conversation_id or conversation_id not in conversations:
        return ""
    history = conversations[conversation_id]
    if not history:
        return ""
    parts = ["\n--- CONVERSATION CONTEXT (previous questions in this session) ---"]
    for i, turn in enumerate(history[-5:], 1):  # last 5 turns max
        parts.append(f"  Turn {i}: \"{turn['question']}\"")
        if turn.get("sql_summary"):
            parts.append(f"    → Queried: {turn['sql_summary']}")
        if turn.get("answer_summary"):
            parts.append(f"    → Answer: {turn['answer_summary'][:150]}")
    parts.append("\nUse this context to resolve pronouns and references. For example:")
    parts.append("  - 'and by service line?' → means break down the SAME metric as previous question, but by service_line")
    parts.append("  - 'what about Insurance?' → means apply the SAME analysis but filtered to Insurance BU")
    parts.append("  - 'show the trend' → means show the SAME metric over time")
    parts.append("  - 'compare that' → means compare the SAME metric across dimensions")
    return "\n".join(parts)


# ─── Agent Functions ───

def get_few_shot_examples() -> str:
    if not successful_queries:
        return "(none yet)"
    examples = list(successful_queries.values())[-5:]
    return "\n".join(f"Q: {e['question']}\nSQL: {e['sql']}" for e in examples)


def agent_sql(question: str, conversation_id: str = None) -> tuple[str, list[dict]]:
    """SQL Agent: Generate SQL with up to 3 retry attempts + conversation context."""
    trace = []
    few_shot = get_few_shot_examples()
    conv_context = build_conversation_context(conversation_id)
    system_prompt = SQL_AGENT_SYSTEM.replace("{few_shot}", few_shot) + conv_context
    known_tables = ['business_units', 'service_lines', 'monthly_metrics', 'projects', 'data_lineage']

    for attempt in range(1, 4):
        step_start = time.time()
        trace.append({"agent": "sql", "attempt": attempt, "status": "generating"})
        try:
            response = client.chat.completions.create(
                model="gpt-4o",
                temperature=0,
                max_tokens=600,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": question if attempt == 1 else f"Previous SQL failed: {trace[-2].get('error', 'unknown')}. Original question: {question}. Fix the SQL."},
                ],
            )
            sql = response.choices[0].message.content.strip()
            sql = sql.replace("```sql", "").replace("```", "").strip()

            # Validate SQL
            sql_upper = sql.upper().lstrip()
            if not sql_upper.startswith(("SELECT", "WITH")):
                sql = "SELECT bu.name AS business_unit, ROUND(SUM(mm.revenue)::numeric, 2) AS total_revenue FROM monthly_metrics mm JOIN business_units bu ON mm.business_unit_id = bu.id WHERE mm.period >= '2025-10-01' GROUP BY bu.name ORDER BY total_revenue DESC"

            # Try execution
            data, columns = execute_sql(sql)

            # Detect non-data responses (e.g. SELECT 'message' AS message)
            is_message_response = False
            if len(data) == 1 and len(columns) <= 2:
                values = list(data[0].values())
                if any(isinstance(v, str) and len(v) > 30 and any(kw in v.lower() for kw in ["not supported", "cannot", "sorry", "please provide", "not related", "unable"]) for v in values):
                    is_message_response = True

            if is_message_response:
                fallback_sql = "SELECT bu.name AS business_unit, ROUND(SUM(mm.revenue)::numeric,2) AS total_revenue, ROUND(AVG(mm.utilization_pct)::numeric,1) AS avg_utilization, ROUND(AVG(mm.nps_score)::numeric,1) AS avg_nps FROM monthly_metrics mm JOIN business_units bu ON mm.business_unit_id=bu.id WHERE mm.period >= '2025-01-01' GROUP BY bu.name ORDER BY total_revenue DESC"
                data, columns = execute_sql(fallback_sql)
                sql = fallback_sql

            duration = int((time.time() - step_start) * 1000)

            # Build reasoning
            tables_used = [t for t in known_tables if t in sql.lower()]
            context_note = " Used conversation context to resolve references." if conv_context else ""
            trace[-1].update({
                "status": "success",
                "sql": sql,
                "rows": len(data),
                "duration_ms": duration,
                "tables_used": tables_used,
                "reasoning": (
                    f"Parsed natural language query and generated PostgreSQL "
                    f"joining {len(tables_used)} table(s) ({', '.join(tables_used)}). "
                    f"Query executed successfully on attempt {attempt}, returning {len(data)} rows.{context_note}"
                ),
            })

            # Cache successful query
            q_hash = hashlib.md5(question.lower().encode()).hexdigest()[:8]
            successful_queries[q_hash] = {"question": question, "sql": sql}

            return sql, trace
        except Exception as e:
            duration = int((time.time() - step_start) * 1000)
            trace[-1].update({"status": "error", "error": str(e)[:200], "duration_ms": duration})
            if attempt == 3:
                raise

    raise RuntimeError("SQL agent exhausted all retries")


def agent_analysis(question: str, data: list, columns: list) -> tuple[dict, list[dict]]:
    """Analysis Agent: Statistical analysis, trend/outlier detection."""
    step_start = time.time()
    trace = [{"agent": "analysis", "status": "analyzing"}]
    sample = data[:30] if len(data) > 30 else data

    try:
        response = client.chat.completions.create(
            model="gpt-4o",
            temperature=0.2,
            max_tokens=600,
            messages=[
                {"role": "system", "content": ANALYSIS_AGENT_SYSTEM},
                {"role": "user", "content": json.dumps({
                    "question": question,
                    "columns": columns,
                    "row_count": len(data),
                    "data": sample,
                })},
            ],
        )
        raw = response.choices[0].message.content.strip()
        raw = raw.replace("```json", "").replace("```", "").strip()
        analysis = json.loads(raw)
        duration = int((time.time() - step_start) * 1000)

        trace[0].update({
            "status": "success",
            "duration_ms": duration,
            "findings": {
                "trends_count": len(analysis.get("trends", [])),
                "outliers_count": len(analysis.get("outliers", [])),
                "risk_flags_count": len(analysis.get("risk_flags", [])),
                "trends": analysis.get("trends", [])[:3],
                "outliers": analysis.get("outliers", [])[:3],
                "risk_flags": analysis.get("risk_flags", []),
            },
            "reasoning": (
                f"Analyzed {len(data)} data points across {len(columns)} dimensions. "
                f"Identified {len(analysis.get('trends', []))} trend(s), "
                f"{len(analysis.get('outliers', []))} outlier(s), and "
                f"{len(analysis.get('risk_flags', []))} risk flag(s)."
            ),
        })
        return analysis, trace
    except (json.JSONDecodeError, Exception) as e:
        duration = int((time.time() - step_start) * 1000)
        trace[0].update({"status": "partial", "error": str(e)[:100], "duration_ms": duration,
                         "reasoning": "Analysis completed with partial results."})
        return {"trends": [], "outliers": [], "comparisons": [], "statistics": {}, "risk_flags": []}, trace


def agent_narrative(question: str, data: list, columns: list, analysis: dict) -> tuple[dict, list[dict]]:
    """Narrative Agent: Executive narrative with recommendations."""
    step_start = time.time()
    trace = [{"agent": "narrative", "status": "generating"}]
    sample = data[:20] if len(data) > 20 else data

    try:
        response = client.chat.completions.create(
            model="gpt-4o",
            temperature=0.3,
            max_tokens=700,
            messages=[
                {"role": "system", "content": NARRATIVE_AGENT_SYSTEM},
                {"role": "user", "content": json.dumps({
                    "question": question,
                    "columns": columns,
                    "row_count": len(data),
                    "sample_data": sample,
                    "analysis": analysis,
                })},
            ],
        )
        raw = response.choices[0].message.content.strip()
        raw = raw.replace("```json", "").replace("```", "").strip()
        result = json.loads(raw)
        duration = int((time.time() - step_start) * 1000)

        trace[0].update({
            "status": "success",
            "duration_ms": duration,
            "chart_selected": result.get("chart_type", "table"),
            "confidence": result.get("confidence", "medium"),
            "reasoning": (
                f"Synthesized executive narrative with {result.get('confidence', 'medium')} confidence. "
                f"Selected '{result.get('chart_type', 'table')}' visualization. "
                f"Generated {len(result.get('follow_ups', []))} follow-up suggestions."
            ),
        })
        return result, trace
    except (json.JSONDecodeError, Exception) as e:
        duration = int((time.time() - step_start) * 1000)
        trace[0].update({"status": "partial", "error": str(e)[:100], "duration_ms": duration,
                         "reasoning": "Narrative generated with fallback template."})
        return {
            "answer": "Analysis complete. See chart for details.",
            "insight": "",
            "narrative": "",
            "recommendation": "",
            "follow_ups": [],
            "confidence": "medium",
            "chart_type": "table",
            "chart_config": {},
        }, trace


# ─── Endpoints ───

@app.get("/health")
def health():
    return {"status": "OK", "version": "3.0.0", "agents": ["sql", "analysis", "narrative"], "timestamp": datetime.now().isoformat()}


@app.get("/api/schema")
def schema():
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


@app.get("/api/suggestions")
def suggestions():
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


# ─── SSE Streaming Endpoint ───

def sse_event(event_type: str, data: dict) -> str:
    """Format a Server-Sent Event."""
    return f"event: {event_type}\ndata: {json.dumps(data, default=str)}\n\n"


def streaming_pipeline(question: str, conversation_id: str):
    """Generator that yields SSE events as each agent completes."""
    start = time.time()
    all_trace = []
    conv_id = conversation_id or str(uuid.uuid4())[:12]

    # Ensure conversation exists
    if conv_id not in conversations:
        conversations[conv_id] = []

    try:
        # ── Agent 1: SQL ──
        yield sse_event("agent_start", {
            "agent": "sql", "label": "SQL Agent",
            "description": "Parsing natural language and generating PostgreSQL query...",
            "step": 1, "total_steps": 3,
        })

        sql, sql_trace = agent_sql(question, conv_id)
        all_trace.extend(sql_trace)
        last_sql_step = next((t for t in reversed(sql_trace) if t.get("status") == "success"), sql_trace[-1])

        yield sse_event("agent_complete", {
            "agent": "sql", "step": 1,
            "duration_ms": last_sql_step.get("duration_ms", 0),
            "reasoning": last_sql_step.get("reasoning", ""),
            "rows": last_sql_step.get("rows", 0),
            "tables_used": last_sql_step.get("tables_used", []),
            "sql_preview": sql[:120] + "..." if len(sql) > 120 else sql,
        })

        # Execute final SQL
        data, columns = execute_sql(sql)

        # ── Agent 2: Analysis ──
        yield sse_event("agent_start", {
            "agent": "analysis", "label": "Analysis Agent",
            "description": f"Analyzing {len(data)} data points across {len(columns)} dimensions...",
            "step": 2, "total_steps": 3,
        })

        analysis, analysis_trace = agent_analysis(question, data, columns)
        all_trace.extend(analysis_trace)

        yield sse_event("agent_complete", {
            "agent": "analysis", "step": 2,
            "duration_ms": analysis_trace[0].get("duration_ms", 0),
            "reasoning": analysis_trace[0].get("reasoning", ""),
            "findings": analysis_trace[0].get("findings", {}),
        })

        # ── Agent 3: Narrative ──
        yield sse_event("agent_start", {
            "agent": "narrative", "label": "Narrative Agent",
            "description": "Composing executive narrative with actionable recommendations...",
            "step": 3, "total_steps": 3,
        })

        narrative_result, narrative_trace = agent_narrative(question, data, columns, analysis)
        all_trace.extend(narrative_trace)

        yield sse_event("agent_complete", {
            "agent": "narrative", "step": 3,
            "duration_ms": narrative_trace[0].get("duration_ms", 0),
            "reasoning": narrative_trace[0].get("reasoning", ""),
            "confidence": narrative_result.get("confidence", "medium"),
            "chart_type": narrative_result.get("chart_type", "table"),
        })

        # ── Final Result ──
        lineage_data = get_lineage(sql)
        confidence = narrative_result.get("confidence", "medium")
        trust = compute_trust_score(lineage_data, confidence, len(data))
        elapsed = int((time.time() - start) * 1000)

        # Update conversation memory
        tables_in_sql = [t for t in ['business_units', 'service_lines', 'monthly_metrics', 'projects'] if t in sql.lower()]
        conversations[conv_id].append({
            "question": question,
            "sql_summary": f"Queried {', '.join(tables_in_sql)} → {len(data)} rows",
            "answer_summary": narrative_result.get("answer", "")[:200],
        })
        # Keep last 10 turns
        if len(conversations[conv_id]) > 10:
            conversations[conv_id] = conversations[conv_id][-10:]

        # Audit log
        audit_log.append({
            "timestamp": datetime.now().isoformat(),
            "question": question,
            "sql": sql,
            "rows": len(data),
            "confidence": confidence,
            "trust_score": trust,
            "execution_time_ms": elapsed,
            "agents": [t.get("agent") for t in all_trace],
            "agent_breakdown": [
                {
                    "agent": t.get("agent"),
                    "status": t.get("status"),
                    "duration_ms": t.get("duration_ms", 0),
                    "reasoning": t.get("reasoning", ""),
                }
                for t in all_trace
                if t.get("status") in ("success", "partial")
            ],
            "analysis_summary": {
                "trends": analysis.get("trends", [])[:3],
                "risk_flags": analysis.get("risk_flags", []),
                "outliers": analysis.get("outliers", [])[:2],
            },
        })

        # Final payload
        final = {
            "answer": narrative_result.get("answer", ""),
            "insight": narrative_result.get("insight", ""),
            "follow_up": narrative_result.get("follow_ups", [""])[0] if narrative_result.get("follow_ups") else "",
            "follow_ups": narrative_result.get("follow_ups", []),
            "confidence": confidence,
            "chart_type": narrative_result.get("chart_type", "table"),
            "chart_config": narrative_result.get("chart_config", {}),
            "data": data[:100],
            "sql": sql,
            "execution_time_ms": elapsed,
            "rows_returned": len(data),
            "lineage": lineage_data,
            "timestamp": datetime.now().isoformat(),
            "narrative": narrative_result.get("narrative", ""),
            "recommendation": narrative_result.get("recommendation", ""),
            "analysis": analysis,
            "agent_trace": all_trace,
            "trust_score": trust,
            "conversation_id": conv_id,
        }

        yield sse_event("result", final)

    except Exception as e:
        traceback.print_exc()
        yield sse_event("error", {"detail": f"Agent pipeline error: {str(e)[:300]}"})


@app.post("/api/ask/stream")
def ask_stream(req: QuestionRequest):
    """SSE streaming endpoint — real-time agent activity."""
    return StreamingResponse(
        streaming_pipeline(req.question, req.conversation_id or ""),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/api/ask", response_model=CopilotResponse)
def ask(req: QuestionRequest):
    """Multi-agent pipeline: SQL Agent → Analysis Agent → Narrative Agent (non-streaming fallback)."""
    start = time.time()
    all_trace = []
    conv_id = req.conversation_id or str(uuid.uuid4())[:12]

    if conv_id not in conversations:
        conversations[conv_id] = []

    try:
        sql, sql_trace = agent_sql(req.question, conv_id)
        all_trace.extend(sql_trace)

        data, columns = execute_sql(sql)

        analysis, analysis_trace = agent_analysis(req.question, data, columns)
        all_trace.extend(analysis_trace)

        narrative_result, narrative_trace = agent_narrative(req.question, data, columns, analysis)
        all_trace.extend(narrative_trace)

        lineage_data = get_lineage(sql)
        confidence = narrative_result.get("confidence", "medium")
        trust = compute_trust_score(lineage_data, confidence, len(data))
        elapsed = int((time.time() - start) * 1000)

        # Update conversation memory
        tables_in_sql = [t for t in ['business_units', 'service_lines', 'monthly_metrics', 'projects'] if t in sql.lower()]
        conversations[conv_id].append({
            "question": req.question,
            "sql_summary": f"Queried {', '.join(tables_in_sql)} → {len(data)} rows",
            "answer_summary": narrative_result.get("answer", "")[:200],
        })
        if len(conversations[conv_id]) > 10:
            conversations[conv_id] = conversations[conv_id][-10:]

        audit_log.append({
            "timestamp": datetime.now().isoformat(),
            "question": req.question,
            "sql": sql,
            "rows": len(data),
            "confidence": confidence,
            "trust_score": trust,
            "execution_time_ms": elapsed,
            "agents": [t.get("agent") for t in all_trace],
            "agent_breakdown": [
                {
                    "agent": t.get("agent"),
                    "status": t.get("status"),
                    "duration_ms": t.get("duration_ms", 0),
                    "reasoning": t.get("reasoning", ""),
                }
                for t in all_trace
                if t.get("status") in ("success", "partial")
            ],
            "analysis_summary": {
                "trends": analysis.get("trends", [])[:3],
                "risk_flags": analysis.get("risk_flags", []),
                "outliers": analysis.get("outliers", [])[:2],
            },
        })

        return CopilotResponse(
            answer=narrative_result.get("answer", ""),
            insight=narrative_result.get("insight", ""),
            follow_up=narrative_result.get("follow_ups", [""])[0] if narrative_result.get("follow_ups") else "",
            follow_ups=narrative_result.get("follow_ups", []),
            confidence=confidence,
            chart_type=narrative_result.get("chart_type", "table"),
            chart_config=narrative_result.get("chart_config", {}),
            data=data[:100],
            sql=sql,
            execution_time_ms=elapsed,
            rows_returned=len(data),
            lineage=lineage_data,
            timestamp=datetime.now().isoformat(),
            narrative=narrative_result.get("narrative", ""),
            recommendation=narrative_result.get("recommendation", ""),
            analysis=analysis,
            agent_trace=all_trace,
            trust_score=trust,
            conversation_id=conv_id,
        )

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Agent pipeline error: {str(e)}")


# ─── Dashboard Endpoints ───

@app.get("/api/dashboard/kpis")
def dashboard_kpis(bu: Optional[str] = None):
    """Return KPI cards with sparkline data for the executive dashboard."""
    conn = get_db()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        bu_filter = ""
        params = []
        if bu:
            bu_filter = "AND bu.name = %s"
            params = [bu]

        # Get last 6 months of data for sparklines
        sql = f"""
        SELECT
            mm.period,
            ROUND(SUM(mm.revenue)::numeric, 2) AS revenue,
            ROUND(SUM(mm.pipeline)::numeric, 2) AS pipeline,
            ROUND(AVG(mm.margin_pct)::numeric, 2) AS margin_pct,
            ROUND(AVG(mm.utilization_pct)::numeric, 2) AS utilization_pct,
            ROUND(AVG(mm.nps_score)::numeric, 2) AS nps_score,
            SUM(mm.headcount) AS headcount,
            SUM(mm.active_projects) AS active_projects,
            ROUND(AVG(mm.churn_rate)::numeric, 2) AS churn_rate
        FROM monthly_metrics mm
        JOIN business_units bu ON mm.business_unit_id = bu.id
        WHERE mm.period >= '2025-07-01'
        {bu_filter}
        GROUP BY mm.period
        ORDER BY mm.period ASC
        """
        cur.execute(sql, params)
        rows = cur.fetchall()

        # Clean data
        sparkline_data = []
        for r in rows:
            clean = {}
            for k, v in dict(r).items():
                if isinstance(v, Decimal):
                    clean[k] = float(v)
                elif hasattr(v, 'isoformat'):
                    clean[k] = v.isoformat()
                else:
                    clean[k] = v
            sparkline_data.append(clean)

        # Build KPI cards
        sl = load_semantic_layer()
        targets = sl.get("kpi_targets", {})
        latest = sparkline_data[-1] if sparkline_data else {}
        prev = sparkline_data[-2] if len(sparkline_data) >= 2 else {}

        def build_kpi(key, display_name, value, target_key=None, fmt="number"):
            target_cfg = targets.get(target_key or key, {})
            target_val = target_cfg.get("target")
            warning = target_cfg.get("warning_threshold")
            critical = target_cfg.get("critical_threshold")
            direction = target_cfg.get("direction", "higher_is_better")

            # Status
            status = "on_track"
            if target_val and value is not None:
                if direction == "higher_is_better":
                    if value < (critical or 0):
                        status = "critical"
                    elif value < (warning or 0):
                        status = "warning"
                else:
                    if value > (critical or 999999):
                        status = "critical"
                    elif value > (warning or 999999):
                        status = "warning"

            # Change
            prev_val = prev.get(key)
            change = None
            if prev_val and value and prev_val != 0:
                change = round(((value - prev_val) / prev_val) * 100, 1)

            return {
                "key": key,
                "display_name": display_name,
                "value": value,
                "format": fmt,
                "target": target_val,
                "status": status,
                "change_pct": change,
                "sparkline": [d.get(key) for d in sparkline_data if d.get(key) is not None],
            }

        kpis = [
            build_kpi("revenue", "Revenue", latest.get("revenue"), fmt="currency"),
            build_kpi("pipeline", "Pipeline", latest.get("pipeline"), fmt="currency"),
            build_kpi("margin_pct", "Gross Margin", latest.get("margin_pct"), "margin_pct", fmt="percentage"),
            build_kpi("utilization_pct", "Utilization", latest.get("utilization_pct"), "utilization", fmt="percentage"),
            build_kpi("nps_score", "NPS Score", latest.get("nps_score"), "nps_score", fmt="score"),
            build_kpi("churn_rate", "Churn Rate", latest.get("churn_rate"), "churn_rate", fmt="percentage"),
        ]

        return {"kpis": kpis, "period": latest.get("period", ""), "business_unit": bu or "All"}
    finally:
        conn.close()


@app.get("/api/dashboard/insights")
def dashboard_insights(bu: Optional[str] = None):
    """AI-generated insights for the executive dashboard."""
    try:
        kpi_data = dashboard_kpis(bu)
        kpis_summary = json.dumps(kpi_data["kpis"], default=str)

        response = client.chat.completions.create(
            model="gpt-4o",
            temperature=0.3,
            max_tokens=400,
            messages=[
                {"role": "system", "content": "You are an executive analytics advisor. Given KPI data, generate 3 concise, actionable business insights. Return JSON: {\"insights\": [{\"title\": \"...\", \"description\": \"...\", \"severity\": \"info|warning|critical|positive\", \"metric\": \"related_metric_key\"}]}"},
                {"role": "user", "content": f"KPIs for {kpi_data['business_unit']}: {kpis_summary}"},
            ],
        )
        raw = response.choices[0].message.content.strip().replace("```json", "").replace("```", "").strip()
        return json.loads(raw)
    except Exception:
        return {"insights": [{"title": "Insights loading", "description": "AI insights will appear here as data refreshes.", "severity": "info", "metric": ""}]}


@app.get("/api/dashboard/business-units")
def dashboard_business_units():
    """List business units for filter dropdown."""
    conn = get_db()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT id, name, code FROM business_units ORDER BY name")
        return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


# ─── Anomaly Detection Endpoint ───

@app.get("/api/dashboard/anomalies")
def dashboard_anomalies(bu: Optional[str] = None):
    """AI-powered anomaly detection across all KPIs — compares latest period vs historical."""
    conn = get_db()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        bu_filter = ""
        params = []
        if bu:
            bu_filter = "AND bu.name = %s"
            params = [bu]

        # Get last 6 months for trend analysis
        sql = f"""
        SELECT
            mm.period,
            bu.name AS business_unit,
            ROUND(SUM(mm.revenue)::numeric, 2) AS revenue,
            ROUND(SUM(mm.pipeline)::numeric, 2) AS pipeline,
            ROUND(AVG(mm.margin_pct)::numeric, 2) AS margin_pct,
            ROUND(AVG(mm.utilization_pct)::numeric, 2) AS utilization_pct,
            ROUND(AVG(mm.nps_score)::numeric, 2) AS nps_score,
            ROUND(AVG(mm.churn_rate)::numeric, 2) AS churn_rate,
            SUM(mm.active_projects) AS active_projects,
            SUM(mm.new_deals) AS new_deals
        FROM monthly_metrics mm
        JOIN business_units bu ON mm.business_unit_id = bu.id
        WHERE mm.period >= '2025-07-01'
        {bu_filter}
        GROUP BY mm.period, bu.name
        ORDER BY mm.period ASC, bu.name
        """
        cur.execute(sql, params)
        rows = cur.fetchall()

        data_for_analysis = []
        for r in rows:
            clean = {}
            for k, v in dict(r).items():
                if isinstance(v, Decimal):
                    clean[k] = float(v)
                elif hasattr(v, 'isoformat'):
                    clean[k] = v.isoformat()
                else:
                    clean[k] = v
            data_for_analysis.append(clean)

        if not data_for_analysis:
            return {"anomalies": [], "scan_timestamp": datetime.now().isoformat()}

        # Use GPT-4o to detect anomalies
        response = client.chat.completions.create(
            model="gpt-4o",
            temperature=0.1,
            max_tokens=600,
            messages=[
                {"role": "system", "content": """You are an anomaly detection agent for a consulting firm's executive dashboard.
Analyze the time-series KPI data and detect anomalies: sudden drops, unusual spikes, concerning trends, threshold breaches, or divergent patterns between business units.

Return JSON with:
{
  "anomalies": [
    {
      "severity": "critical|warning|info",
      "metric": "the metric name (e.g. revenue, margin_pct, nps_score)",
      "business_unit": "affected BU or 'All'",
      "title": "Short anomaly title (max 60 chars)",
      "description": "What happened and why it matters (1-2 sentences)",
      "value": "the anomalous value",
      "expected": "what was expected based on trend",
      "change_pct": <percentage change as number>,
      "suggested_query": "A natural language question the user can ask the Copilot to investigate this anomaly"
    }
  ]
}

Return 2-4 anomalies max. Focus on the most impactful findings. Be precise with numbers."""},
                {"role": "user", "content": json.dumps({"kpi_data": data_for_analysis})},
            ],
        )
        raw = response.choices[0].message.content.strip().replace("```json", "").replace("```", "").strip()
        result = json.loads(raw)
        result["scan_timestamp"] = datetime.now().isoformat()
        result["data_points_analyzed"] = len(data_for_analysis)
        return result
    except Exception as e:
        traceback.print_exc()
        return {"anomalies": [], "scan_timestamp": datetime.now().isoformat(), "error": str(e)[:100]}
    finally:
        conn.close()


# ─── Governance Endpoints ───

@app.get("/api/governance/quality")
def governance_quality():
    """Data quality dashboard with freshness and quality scores."""
    conn = get_db()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT * FROM data_lineage ORDER BY table_name")
        rows = cur.fetchall()

        tables = []
        for r in rows:
            last_refresh = r["last_refresh"]
            freshness = "fresh"
            if last_refresh:
                age_hours = (datetime.now() - last_refresh).total_seconds() / 3600
                if age_hours > 48:
                    freshness = "stale"
                elif age_hours > 24:
                    freshness = "aging"

            tables.append({
                "table_name": r["table_name"],
                "source_system": r["source_system"],
                "refresh_frequency": r["refresh_frequency"],
                "last_refresh": last_refresh.isoformat() if last_refresh else None,
                "quality_score": float(r["data_quality_score"]) if r["data_quality_score"] else None,
                "owner": r["owner"],
                "freshness": freshness,
            })

        overall_quality = sum(t["quality_score"] for t in tables if t["quality_score"]) / len(tables) if tables else 0

        return {
            "tables": tables,
            "overall_quality": round(overall_quality, 3),
            "total_tables": len(tables),
        }
    finally:
        conn.close()


@app.get("/api/governance/audit")
def governance_audit(limit: int = 50):
    """Return recent query audit log."""
    return audit_log[-limit:][::-1]


@app.get("/api/governance/agent-stats")
def governance_agent_stats():
    """Aggregate agent performance statistics."""
    if not audit_log:
        return {
            "total_queries": 0,
            "avg_response_ms": 0,
            "success_rate": 100,
            "agent_avg_ms": {"sql": 0, "analysis": 0, "narrative": 0},
            "queries_by_confidence": {"high": 0, "medium": 0, "low": 0},
            "avg_trust_score": 0,
        }

    total = len(audit_log)
    avg_ms = sum(e.get("execution_time_ms", 0) for e in audit_log) // total

    agent_times: dict[str, list] = {"sql": [], "analysis": [], "narrative": []}
    for entry in audit_log:
        for ab in entry.get("agent_breakdown", []):
            name = ab.get("agent", "")
            if name in agent_times:
                agent_times[name].append(ab.get("duration_ms", 0))

    agent_avg = {k: (int(sum(v) / len(v)) if v else 0) for k, v in agent_times.items()}

    conf_dist = {"high": 0, "medium": 0, "low": 0}
    for entry in audit_log:
        c = entry.get("confidence", "medium")
        conf_dist[c] = conf_dist.get(c, 0) + 1

    successful = sum(1 for e in audit_log if e.get("trust_score", 0) > 50)

    return {
        "total_queries": total,
        "avg_response_ms": avg_ms,
        "success_rate": round((successful / total) * 100, 1) if total else 100,
        "agent_avg_ms": agent_avg,
        "queries_by_confidence": conf_dist,
        "avg_trust_score": round(sum(e.get("trust_score", 0) for e in audit_log) / total, 1),
    }


@app.get("/api/governance/lineage-graph")
def governance_lineage_graph():
    """Return lineage as a graph structure for visualization."""
    conn = get_db()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT * FROM data_lineage")
        rows = cur.fetchall()

        nodes = []
        edges = []
        for r in rows:
            source_id = f"src_{r['source_system'].replace(' ', '_').lower()}"
            table_id = f"tbl_{r['table_name']}"

            # Source node
            if not any(n["id"] == source_id for n in nodes):
                nodes.append({"id": source_id, "label": r["source_system"], "type": "source"})

            # Table node
            nodes.append({
                "id": table_id,
                "label": r["table_name"],
                "type": "table",
                "quality": float(r["data_quality_score"]) if r["data_quality_score"] else None,
                "refresh": r["refresh_frequency"],
            })

            # Edge
            edges.append({"from": source_id, "to": table_id})

        # Add dashboard as consumer
        nodes.append({"id": "dashboard", "label": "Analytics Copilot", "type": "consumer"})
        for r in rows:
            edges.append({"from": f"tbl_{r['table_name']}", "to": "dashboard"})

        return {"nodes": nodes, "edges": edges}
    finally:
        conn.close()


@app.get("/api/semantic-layer")
def semantic_layer():
    """Return the semantic layer configuration."""
    return load_semantic_layer()


# ─── Share Endpoints ───

class ShareRequest(BaseModel):
    question: str
    response: dict


@app.post("/api/share")
def create_share(req: ShareRequest):
    """Create a shareable link for a copilot response."""
    share_id = hashlib.md5(f"{req.question}{time.time()}".encode()).hexdigest()[:10]
    shared_reports[share_id] = {
        "question": req.question,
        "response": req.response,
        "created_at": datetime.now().isoformat(),
    }
    return {"share_id": share_id}


@app.get("/api/share/{share_id}")
def get_share(share_id: str):
    """Retrieve a shared report."""
    report = shared_reports.get(share_id)
    if not report:
        raise HTTPException(status_code=404, detail="Shared report not found")
    return report
