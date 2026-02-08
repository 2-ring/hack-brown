# DropCal

Turn messy text, images, audio, PDFs, and emails into calendar events. Drop it in, get events out.

**Production:** [dropcal.ai](https://dropcal.ai) | API at api.dropcal.ai

## Stack

Three-app monorepo:

- `backend/` — Flask API, multi-agent LangChain pipeline, Supabase PostgreSQL
- `frontend/` — React + Vite + TypeScript
- `mobile/` — Expo / React Native

Calendar integrations: Google, Microsoft Outlook, Apple (CalDAV).

## Development

Backend (port 5000):

```
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python app.py
```

Frontend (port 5173):

```
cd frontend
npm install
npm run dev
```

## Deploy

Backend to Elastic Beanstalk:

```
cd backend && eb deploy dropcal-prod
```

Frontend to S3:

```
cd frontend && npm run build && aws s3 sync dist/ s3://dropcal-frontend --delete
```

Database migrations:

```
supabase db push
supabase migration new <name>
```

## Tests

```
cd backend && pytest tests/
cd frontend && npx tsc --noEmit
```
