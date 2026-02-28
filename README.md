# Autonomous Analytics Copilot — PoC

An AI-powered analytics copilot that lets users ask business questions in natural language and get instant answers with charts, SQL transparency, and data lineage. Built to demonstrate NTT DATA's Autonomous Intelligence offering.

## What It Demonstrates

| Pillar | How |
|--------|-----|
| **Agentic AI** | GPT-4o agent interprets questions, generates SQL, self-corrects on errors |
| **AI-Native Data Platform** | Simulated Lakehouse with semantic layer and governed data |
| **Responsible AI** | Every answer shows data source, confidence, lineage, and generated SQL |
| **Analytics Copilots** | Natural language → instant insights with charts |

## Architecture

```
┌─────────────────────────────────────────────┐
│  Frontend (React + Tailwind)                │
│  Chat interface + Charts + SQL panel        │
├─────────────────────────────────────────────┤
│  Backend (FastAPI + Python)                 │
│  Agent: GPT-4o → SQL → Execute → Visualize  │
├─────────────────────────────────────────────┤
│  PostgreSQL (Simulated Lakehouse)           │
│  3 BUs × 6 metrics × 24 months             │
└─────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites
- Python 3.11+
- Node.js 18+
- PostgreSQL 15+ (or Docker)
- OpenAI API key

### 1. Database Setup

```bash
# Option A: Docker (recommended)
docker run -d --name copilot-db \
  -e POSTGRES_USER=copilot \
  -e POSTGRES_PASSWORD=copilot123 \
  -e POSTGRES_DB=copilot_lakehouse \
  -p 5432:5432 \
  postgres:15

# Option B: Existing PostgreSQL
createdb copilot_lakehouse
```

### 2. Seed Data

```bash
cd data
pip install psycopg2-binary faker
python seed_database.py
```

### 3. Backend

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your OpenAI key and DB credentials
uvicorn main:app --reload --port 8000
```

### 4. Frontend

```bash
cd frontend
npm install
cp .env.example .env
# Edit .env if backend is not on localhost:8000
npm run dev
```

Open http://localhost:5173

## Example Questions

- "What was our total revenue last quarter?"
- "Compare banking vs insurance margin trends"
- "Which business unit has the highest utilization rate?"
- "Show me the revenue trend for telco over the last 12 months"
- "What is our average NPS by business unit?"
- "Which service line generates the most pipeline?"

## Deploy to Production

See `DEPLOY.md` for Railway/Render deployment instructions.

## Tech Stack

- **Frontend**: React 18, Vite, Tailwind CSS, Recharts, Framer Motion
- **Backend**: FastAPI, OpenAI GPT-4o, SQLAlchemy, Psycopg2
- **Database**: PostgreSQL 15
- **Deploy**: Railway / Render
