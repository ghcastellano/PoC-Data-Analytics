"""
Seed script for the Copilot Lakehouse database.
Generates 2 years of realistic business data for 3 BUs.
"""
import os
import random
import psycopg2
from datetime import date, timedelta

DB_URL = os.getenv("DATABASE_URL", "postgresql://copilot:copilot123@localhost:5432/copilot_lakehouse")

SCHEMA = """
DROP TABLE IF EXISTS monthly_metrics CASCADE;
DROP TABLE IF EXISTS projects CASCADE;
DROP TABLE IF EXISTS service_lines CASCADE;
DROP TABLE IF EXISTS business_units CASCADE;
DROP TABLE IF EXISTS data_lineage CASCADE;

CREATE TABLE business_units (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(10) NOT NULL,
    region VARCHAR(50) NOT NULL
);

CREATE TABLE service_lines (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(20) NOT NULL
);

CREATE TABLE monthly_metrics (
    id SERIAL PRIMARY KEY,
    business_unit_id INT REFERENCES business_units(id),
    service_line_id INT REFERENCES service_lines(id),
    period DATE NOT NULL,
    revenue DECIMAL(12,2),
    pipeline DECIMAL(12,2),
    margin_pct DECIMAL(5,2),
    headcount INT,
    utilization_pct DECIMAL(5,2),
    nps_score DECIMAL(4,1),
    active_projects INT,
    new_deals INT,
    churn_rate DECIMAL(5,2),
    avg_deal_size DECIMAL(12,2)
);

CREATE TABLE projects (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    business_unit_id INT REFERENCES business_units(id),
    service_line_id INT REFERENCES service_lines(id),
    status VARCHAR(20) NOT NULL,
    start_date DATE,
    end_date DATE,
    value DECIMAL(12,2),
    client_name VARCHAR(100)
);

CREATE TABLE data_lineage (
    id SERIAL PRIMARY KEY,
    table_name VARCHAR(100),
    source_system VARCHAR(100),
    refresh_frequency VARCHAR(50),
    last_refresh TIMESTAMP DEFAULT NOW(),
    data_quality_score DECIMAL(4,2),
    owner VARCHAR(100)
);

CREATE INDEX idx_metrics_period ON monthly_metrics(period);
CREATE INDEX idx_metrics_bu ON monthly_metrics(business_unit_id);
CREATE INDEX idx_metrics_sl ON monthly_metrics(service_line_id);
"""

BUS = [
    ("Banking & Financial Services", "BFS", "IBIOL"),
    ("Insurance", "INS", "IBIOL"),
    ("Telco & Media", "TELCO", "IBIOL"),
]

SERVICE_LINES = [
    ("Data & Analytics", "DA"),
    ("Cloud & Infrastructure", "CLOUD"),
    ("Application Development", "APPDEV"),
    ("AI & Intelligent Solutions", "AI"),
    ("Cybersecurity", "SEC"),
]

CLIENTS = {
    "BFS": ["Santander", "BBVA", "CaixaBank", "Itaú", "Bradesco", "BTG Pactual", "Banco do Brasil"],
    "INS": ["Mapfre", "Allianz", "Zurich", "SulAmérica", "Porto Seguro", "Liberty"],
    "TELCO": ["Telefónica", "Claro", "TIM", "Vodafone", "Orange", "América Móvil"],
}

PROJECT_NAMES = [
    "Data Lake Modernization", "Customer 360 Platform", "Fraud Detection Engine",
    "Risk Analytics Dashboard", "Claims Processing Automation", "Network Optimization AI",
    "Revenue Assurance System", "Credit Scoring Model", "Churn Prediction Engine",
    "Real-Time Pricing Engine", "Document Intelligence Platform", "Regulatory Reporting Automation",
    "Customer Service Chatbot", "Supply Chain Analytics", "ESG Reporting Framework",
    "Anti-Money Laundering Agent", "Digital Twin - Branch Network", "Predictive Maintenance",
]

LINEAGE = [
    ("monthly_metrics", "SAP ERP + Salesforce CRM", "Daily", 0.96, "Data Engineering"),
    ("projects", "Jira + SAP PS", "Hourly", 0.94, "PMO"),
    ("business_units", "SAP HR Master", "Weekly", 0.99, "HR Operations"),
    ("service_lines", "Internal Config", "Monthly", 1.00, "D&A Leadership"),
]


def seed():
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()

    # Create schema
    cur.execute(SCHEMA)
    conn.commit()

    # Insert BUs
    for name, code, region in BUS:
        cur.execute("INSERT INTO business_units (name, code, region) VALUES (%s, %s, %s)", (name, code, region))

    # Insert service lines
    for name, code in SERVICE_LINES:
        cur.execute("INSERT INTO service_lines (name, code) VALUES (%s, %s)", (name, code))

    conn.commit()

    # Base metrics per BU (monthly)
    bases = {
        1: {"revenue": 2800000, "pipeline": 4500000, "margin": 28, "hc": 180, "util": 82, "nps": 42, "projects": 24, "deals": 5, "churn": 3.2, "deal_size": 450000},
        2: {"revenue": 1900000, "pipeline": 3200000, "margin": 31, "hc": 120, "util": 79, "nps": 45, "projects": 18, "deals": 4, "churn": 2.8, "deal_size": 380000},
        3: {"revenue": 2200000, "pipeline": 3800000, "margin": 25, "hc": 150, "util": 84, "nps": 38, "projects": 20, "deals": 4, "churn": 4.1, "deal_size": 520000},
    }

    # Generate 24 months (Jan 2024 - Dec 2025)
    start = date(2024, 1, 1)
    for month_offset in range(24):
        period = date(start.year + (start.month + month_offset - 1) // 12,
                      (start.month + month_offset - 1) % 12 + 1, 1)

        for bu_id in range(1, 4):
            b = bases[bu_id]
            # Growth trend + seasonality + noise
            growth = 1 + (month_offset * 0.008)  # ~10% annual growth
            seasonal = 1 + 0.05 * (1 if period.month in [3, 6, 9, 12] else -0.02)

            for sl_id in range(1, 6):
                # Service line weight
                sl_weight = {1: 0.30, 2: 0.25, 3: 0.20, 4: 0.15, 5: 0.10}[sl_id]
                noise = random.uniform(0.92, 1.08)

                revenue = b["revenue"] * sl_weight * growth * seasonal * noise
                pipeline = b["pipeline"] * sl_weight * growth * noise * random.uniform(0.9, 1.15)
                margin = b["margin"] + random.uniform(-3, 3) + (month_offset * 0.1)
                hc = int(b["hc"] * sl_weight * growth * random.uniform(0.95, 1.05))
                util = b["util"] + random.uniform(-5, 5)
                nps = b["nps"] + random.uniform(-4, 4) + (month_offset * 0.15)
                projects = max(1, int(b["projects"] * sl_weight * growth * random.uniform(0.85, 1.15)))
                deals = max(0, int(b["deals"] * sl_weight * random.uniform(0.5, 2.0)))
                churn = max(0.5, b["churn"] + random.uniform(-1.5, 1.5))
                deal_size = b["deal_size"] * sl_weight * random.uniform(0.8, 1.3)

                cur.execute("""
                    INSERT INTO monthly_metrics
                    (business_unit_id, service_line_id, period, revenue, pipeline,
                     margin_pct, headcount, utilization_pct, nps_score, active_projects,
                     new_deals, churn_rate, avg_deal_size)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """, (bu_id, sl_id, period, round(revenue, 2), round(pipeline, 2),
                      round(min(margin, 45), 2), max(hc, 3), round(min(util, 98), 2),
                      round(min(nps, 75), 1), projects, deals,
                      round(min(churn, 8), 2), round(deal_size, 2)))

    # Insert projects
    statuses = ["Active", "Active", "Active", "Completed", "Completed", "Pipeline"]
    for bu_id in range(1, 4):
        bu_code = BUS[bu_id - 1][1]
        for i in range(random.randint(12, 20)):
            sl_id = random.randint(1, 5)
            status = random.choice(statuses)
            s_date = date(2024, random.randint(1, 12), random.randint(1, 28))
            e_date = s_date + timedelta(days=random.randint(60, 365))
            value = random.randint(150000, 2500000)
            client = random.choice(CLIENTS[bu_code])
            name = f"{random.choice(PROJECT_NAMES)} - {client}"

            cur.execute("""
                INSERT INTO projects (name, business_unit_id, service_line_id, status, start_date, end_date, value, client_name)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """, (name, bu_id, sl_id, status, s_date, e_date, value, client))

    # Insert lineage
    for table, source, freq, quality, owner in LINEAGE:
        cur.execute("""
            INSERT INTO data_lineage (table_name, source_system, refresh_frequency, data_quality_score, owner)
            VALUES (%s, %s, %s, %s, %s)
        """, (table, source, freq, quality, owner))

    conn.commit()
    cur.close()
    conn.close()
    print("✅ Database seeded successfully!")
    print(f"   - 3 Business Units")
    print(f"   - 5 Service Lines")
    print(f"   - 24 months × 3 BUs × 5 SLs = 360 metric rows")
    print(f"   - ~50 projects")
    print(f"   - 4 lineage records")


if __name__ == "__main__":
    seed()
