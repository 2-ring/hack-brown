# DropCal

Converts messy text, images, audio, PDFs, and emails into calendar events via a multi-agent AI pipeline. Three-app monorepo: `backend/` (Flask/Python), `frontend/` (React/Vite/TypeScript), `mobile/` (Expo/React Native).

Production: dropcal.ai (frontend) / api.dropcal.ai (backend)

## Architecture

### Agent Pipeline

The core is a 5-agent LangChain pipeline. Each agent inherits from `BaseAgent` (`backend/core/base_agent.py`), uses `.with_structured_output(PydanticModel)` for typed returns, and loads prompts from a `prompts/` directory relative to its own file.

```
Input → Agent 1 (Identification) → Agent 2 (Extraction) → Agent 3 (Formatting)
                                         ↕ parallel per event
        Agent 4 (Modification) ← user edits
        Agent 5 (Preferences)  ← learned patterns
```

| Agent | File | Input → Output | Job |
|-------|------|---------------|-----|
| 1 - Identification | `extraction/agents/identification.py` | raw text/image → `IdentificationResult` | Find all events in input |
| 2 - Extraction | `extraction/agents/facts.py` | per-event raw_text → `ExtractedFacts` | Normalize dates/times/fields |
| 3 - Formatting | `extraction/agents/formatting.py` | `ExtractedFacts` → `CalendarEvent` | Format for calendar API |
| 4 - Modification | `modification/agent.py` | user edit request → modified event | Handle user corrections |
| 5 - Preferences | `preferences/agent.py` | event + patterns → personalized event | Apply learned preferences |

All Pydantic models live in `backend/extraction/models.py`. Agents 2+3 run in parallel per event using threads with a `db_lock` (because `Session.add_event` does read-modify-write).

### LLM Provider Config

`backend/config/text.py` controls which LLM each agent uses. Switch between presets by changing the `CONFIG` line:
- `TextModelConfig.all_grok()` — current default, uses $2.5k xAI credits
- `TextModelConfig.all_claude()` — production quality (claude-sonnet-4-5)
- `TextModelConfig.hybrid_optimized()` — Claude for complex tasks, Grok for simple

Each agent can use a different provider. `create_text_model(component)` returns the right LangChain LLM.

### Processing Flow

1. Frontend creates a session (`POST /api/sessions`) → backend returns session ID
2. `SessionProcessor` runs the pipeline asynchronously (title generation in parallel background thread)
3. Frontend polls `GET /api/sessions/:id` until status is `processed` or `error`
4. Uses standard formatting for guests or users with <10 events, personalized formatting otherwise

### Factory Patterns

- **Input processors** (`backend/processors/factory.py`): `InputProcessorFactory` routes to `AudioProcessor`, `ImageProcessor`, `PDFProcessor`, `TextFileProcessor`. All inherit `BaseInputProcessor` with `process()` and `supports_file()`.
- **Calendar providers** (`backend/calendars/factory.py`): Routes to `google/`, `microsoft/`, `apple/` subdirectories. Each has `auth`, `fetch`, `create` modules. Auto-routes to user's `primary_calendar_provider`.

## Database

Supabase PostgreSQL. Singleton client via `get_supabase()` in `database/supabase_client.py`.

Three tables: `users`, `sessions`, `events`. Models in `backend/database/models.py` use static methods for CRUD (not an ORM).

Key patterns:
- OAuth tokens are **encrypted with Fernet** (`utils/encryption.py`). Never store tokens in plaintext.
- Session statuses: `pending` → `processing` → `processed` | `error`
- Guest sessions use `secrets.token_hex(32)` access tokens, separate endpoints (`/api/sessions/guest`)
- Events support soft delete (`deleted_at`), draft status, correction history, and 384-dim vector embeddings (pgvector)
- Conflicts checked via `get_conflicting_events` Supabase RPC function

## Auth

- Supabase Auth handles JWT tokens. Backend validates with `@require_auth` decorator (`auth/middleware.py`) which sets `request.user_id`.
- Frontend: `AuthContext` (React Context) manages state, `useAuth()` hook for components.
- Google OAuth for auth + calendar scopes. Microsoft MSAL for Outlook. Apple CalDAV with app-specific passwords.

## Key Commands

```bash
# Backend
cd backend && python app.py                    # Dev server (port 5000)
cd backend && gunicorn wsgi:app -b 0.0.0.0:8000  # Production
cd backend && pytest tests/                    # Run tests

# Frontend
cd frontend && npm run dev                     # Vite dev server (port 5173)
cd frontend && npm run build                   # Production build
cd frontend && npx tsc --noEmit                # Type check

# Deploy (CI/CD does this on push to main)
cd backend && eb deploy dropcal-prod           # Backend → Elastic Beanstalk
cd frontend && aws s3 sync dist/ s3://dropcal-frontend --delete  # Frontend → S3

# Database
supabase db push                               # Apply migrations
supabase migration new <name>                  # Create migration
```

## Conventions

- **Python**: PascalCase classes, snake_case functions, Pydantic models for all structured LLM output. Agents use `ChatPromptTemplate` → `chain.invoke()`. Flask blueprints for route groups.
- **TypeScript**: PascalCase components, camelCase functions/hooks. API client in `frontend/src/api/backend-client.ts`. Types in `frontend/src/api/types.ts`.
- **New agents**: Inherit `BaseAgent`, implement `execute()`, add Pydantic model to `extraction/models.py`, put prompt in `prompts/` dir next to agent.
- **New calendar providers**: Add `auth.py`, `fetch.py`, `create.py` in `backend/calendars/<provider>/`, register in `factory.py`.
- **New input processors**: Inherit `BaseInputProcessor`, register in `app.py` via `input_processor_factory.register_processor()`.

## Analytics & LLM Observability (PostHog)

PostHog tracks LLM costs, latency, token usage, and product analytics. Project ID: 308768. Dashboard: https://us.posthog.com/project/308768

**How it works:** `config/posthog.py` initializes a PostHog client at startup. Before each agent pipeline run, `set_tracking_context(distinct_id, trace_id)` sets the user/trace for the current thread. Every `chain.invoke()` call passes `config=get_invoke_config()` which attaches a PostHog LangChain `CallbackHandler` that automatically captures model, tokens, cost, and latency.

**Backend (LLM observability):**
- `backend/config/posthog.py` — client init, thread-local tracking context, `get_invoke_config()` helper
- Callbacks attached in: `identification.py`, `facts.py`, `modification/agent.py`, `preferences/agent.py`, `pattern_discovery_service.py`

**Frontend (product analytics):**
- `frontend/src/main.tsx` — PostHog init + `PostHogProvider` wrapper. Autocapture, pageviews, and pageleave enabled.
- `frontend/src/auth/AuthContext.tsx` — `posthog.identify()` on sign-in/session restore, `posthog.reset()` on sign-out. Links frontend events to backend LLM costs by shared user ID.

**Env vars:**
- Backend: `POSTHOG_API_KEY`, `POSTHOG_HOST`, `POSTHOG_PERSONAL_API_KEY`, `POSTHOG_PROJECT_ID`
- Frontend: `VITE_POSTHOG_KEY`, `VITE_POSTHOG_HOST`

**PostHog API:** Use the personal API key for querying analytics programmatically:
```bash
curl -H "Authorization: Bearer $POSTHOG_PERSONAL_API_KEY" \
  "https://us.posthog.com/api/projects/$POSTHOG_PROJECT_ID/insights/"
```

## Gotchas

- `app.py` initializes ALL agents and services at module import time — heavy startup, but needed for Gunicorn preloading.
- Rate limiting uses Redis in production (`REDIS_URL`), falls back to in-memory in dev.
- Max file upload: 25MB (`app.config['MAX_CONTENT_LENGTH']`).
- Backend `sys.path` manipulation at top of `app.py` — imports assume `backend/` is the working directory.
- CORS allows `localhost:3000`, `localhost:5173`, `dropcal.ai`, `www.dropcal.ai` only.

## Rules

- Only create markdown files for genuinely useful information. No completion reports, summaries, or self-evident docs.
- AWS CLI (`aws`) and Supabase CLI (`supabase`) are installed and authenticated. Use them directly.
- PostHog personal API key (`POSTHOG_PERSONAL_API_KEY`) is set in `backend/.env`. Use it to query the PostHog API directly (events, insights, dashboards, feature flags, experiments) as needed.
- Don't modify `utils/encryption.py` or token encryption logic without explicit request.
- When adding new endpoints, follow the blueprint pattern (see `auth/routes.py`, `calendars/routes.py`, `sessions/routes.py`).
