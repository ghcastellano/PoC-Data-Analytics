# Deploy Guide

## Option A: Railway (Recommended — Fastest)

### 1. Create Railway account
Go to https://railway.app and sign in with GitHub.

### 2. Deploy PostgreSQL
- Click "New Project" → "Provision PostgreSQL"
- Copy the `DATABASE_URL` from the Variables tab

### 3. Seed the database
```bash
DATABASE_URL="your-railway-postgres-url" python data/seed_database.py
```

### 4. Deploy Backend
- In the same project, click "New" → "GitHub Repo" → select your repo
- Set root directory: `/backend`
- Add environment variables:
  - `OPENAI_API_KEY` = your key
  - `DATABASE_URL` = the PostgreSQL URL from step 2
- Set start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`

### 5. Deploy Frontend
- Click "New" → "GitHub Repo" → same repo
- Set root directory: `/frontend`
- Add environment variable:
  - `VITE_API_URL` = your backend URL (e.g., https://your-backend.up.railway.app)
- Set build command: `npm install && npm run build`
- Set start command: `npx serve dist -s -l $PORT`

### 6. Share the URL
The frontend URL is your demo link.

---

## Option B: Render

### 1. PostgreSQL
- Create a free PostgreSQL database on https://render.com
- Copy the external connection URL

### 2. Backend (Web Service)
- New → Web Service → Connect repo
- Root directory: `backend`
- Build command: `pip install -r requirements.txt`
- Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
- Add env vars: `OPENAI_API_KEY`, `DATABASE_URL`

### 3. Frontend (Static Site)
- New → Static Site → Connect repo
- Root directory: `frontend`
- Build command: `npm install && npm run build`
- Publish directory: `dist`
- Add env var: `VITE_API_URL` = backend URL

---

## Option C: Local with Docker Compose

```yaml
# docker-compose.yml (create in project root)
version: '3.8'
services:
  db:
    image: postgres:15
    environment:
      POSTGRES_USER: copilot
      POSTGRES_PASSWORD: copilot123
      POSTGRES_DB: copilot_lakehouse
    ports: ["5432:5432"]

  backend:
    build: ./backend
    ports: ["8000:8000"]
    environment:
      DATABASE_URL: postgresql://copilot:copilot123@db:5432/copilot_lakehouse
      OPENAI_API_KEY: ${OPENAI_API_KEY}
    depends_on: [db]

  frontend:
    build: ./frontend
    ports: ["5173:5173"]
    environment:
      VITE_API_URL: http://localhost:8000
```

```bash
docker-compose up -d
python data/seed_database.py
# Open http://localhost:5173
```
