# Parallel Agent Tasks for DropCal Integration

Reference: [INTEGRATION_PLAN.md](INTEGRATION_PLAN.md)

---

## Agent 1: Backend Database & API Layer

**Goal:** Create the complete backend database layer with Supabase integration and API endpoints.

**Scope:**
- Create `backend/database/` folder structure
- Implement `supabase_client.py` (singleton client)
- Implement `models.py` (User and Session classes with all CRUD operations)
- Create `backend/storage/` folder
- Implement `file_handler.py` (file upload/download/delete to Supabase Storage)
- Update `backend/app.py` with new routes:
  - `POST /api/sessions` (create session from text)
  - `POST /api/upload` (upload file and create session)
  - `GET /api/sessions/<id>` (get single session)
  - `GET /api/sessions?user_id=X` (get user's sessions)
- Use placeholder `user_id` for now (no auth yet)
- Add error handling and validation

**Files to create/modify:**
- `backend/database/supabase_client.py` (NEW)
- `backend/database/models.py` (NEW)
- `backend/database/__init__.py` (NEW)
- `backend/storage/file_handler.py` (NEW)
- `backend/storage/__init__.py` (NEW)
- `backend/app.py` (MODIFY - add routes only, don't touch existing processor logic)

**Don't touch:**
- `backend/processors/` (leave existing AI pipeline alone)
- Frontend files
- Auth logic (use placeholder user_id: `"temp-user-id"`)

**Reference sections in INTEGRATION_PLAN.md:**
- Phase 3.1: Supabase Client
- Phase 3.2: Database Models
- Phase 3.3: Storage Operations
- Phase 3.4: Update Flask App

**Deliverables:**
- Working backend API that can create/retrieve sessions
- Database models ready to connect to Supabase
- File storage handler ready for uploads
- No auth required yet

---

## Agent 2: Frontend API Integration

**Goal:** Migrate frontend from local session state to backend API calls.

**Scope:**
- Create `frontend/src/api/` folder
- Create `backend-client.ts` with API methods:
  - `createTextSession(text: string)`
  - `uploadFile(file: File, type: 'image' | 'audio')`
  - `getSession(sessionId: string)`
  - `getUserSessions()`
- Update session state management to use backend
- Remove local session storage logic
- Update components to call backend API
- Handle loading/error states
- Use placeholder `user_id: "temp-user-id"` for now

**Files to create/modify:**
- `frontend/src/api/backend-client.ts` (NEW)
- `frontend/src/api/types.ts` (NEW - backend response types)
- `frontend/src/sessions/` components (MODIFY - replace local state with API calls)
- `frontend/src/workspace/input/` (MODIFY - call backend on submit)

**Don't touch:**
- Backend files
- Auth logic (use hardcoded placeholder user_id)
- Event processing display logic (just data fetching)

**Environment variable needed:**
- `REACT_APP_API_URL=http://localhost:5000` (local dev)

**Deliverables:**
- Frontend talks to backend API
- No more local session state
- File uploads go to backend
- Session history fetched from backend

---

## Agent 3: Infrastructure & Deployment Setup

**Goal:** Set up Supabase, Render deployment config, and environment management.

**Scope:**
- Create `render.yaml` for Render deployment
- Update/create `backend/requirements.txt` with all dependencies
- Create `.env.example` template files
- Create `backend/.env.example`
- Create `frontend/.env.example`
- Write setup instructions in `DEPLOYMENT.md`:
  - How to set up Supabase (manual steps user must do)
  - How to deploy to Render
  - Environment variables checklist
  - Testing endpoints
- Update `.gitignore` to exclude `.env` files
- Create database migration script for Supabase schema

**Files to create/modify:**
- `render.yaml` (NEW)
- `backend/requirements.txt` (UPDATE/CREATE)
- `backend/.env.example` (NEW)
- `frontend/.env.example` (NEW)
- `.gitignore` (UPDATE)
- `DEPLOYMENT.md` (NEW)
- `backend/database/schema.sql` (NEW - copy from integration plan)

**Don't touch:**
- Application code (frontend/backend logic)
- Auth implementation

**Reference sections in INTEGRATION_PLAN.md:**
- Phase 1: Supabase Setup
- Phase 2: Render Setup
- Phase 4: Environment Setup

**Deliverables:**
- Ready-to-deploy configuration
- Clear setup instructions
- SQL schema file ready to run in Supabase
- Environment templates

---

## Agent 4: Authentication System (RUN AFTER 1-3 COMPLETE)

**Goal:** Implement Google OAuth authentication with Supabase Auth.

**Scope:**
- Enable Google OAuth in Supabase Auth settings (provide instructions)
- Create `frontend/src/auth/supabase.ts`:
  - `signInWithGoogle()`
  - `signOut()`
  - `getSession()`
  - Auth state management
- Create `backend/auth/middleware.py`:
  - `@require_auth` decorator
  - Token verification with Supabase
- Update frontend to:
  - Add login/logout UI
  - Store auth token in localStorage
  - Send token in API requests
  - Redirect to login if unauthorized
- Update backend routes to use `@require_auth`
- Replace all `"temp-user-id"` with real user IDs from auth

**Files to create/modify:**
- `frontend/src/auth/supabase.ts` (NEW)
- `frontend/src/auth/AuthContext.tsx` (NEW)
- `frontend/src/components/LoginButton.tsx` (NEW)
- `frontend/src/api/backend-client.ts` (MODIFY - add auth headers)
- `backend/auth/middleware.py` (NEW)
- `backend/auth/__init__.py` (NEW)
- `backend/app.py` (MODIFY - add @require_auth to routes)

**Prerequisites:**
- Agent 1 must be complete (backend API working)
- Agent 2 must be complete (frontend using backend)
- Agent 3 must be complete (Supabase set up)

**Reference sections in INTEGRATION_PLAN.md:**
- Phase 5: Auth Integration

**Deliverables:**
- Working Google OAuth login
- Protected API routes
- User sessions persist across page reloads
- Real user IDs in database

---

## Recommended Order

### Phase 1 (Parallel):
Run these 3 agents simultaneously:
1. **Agent 1** (Backend Database & API)
2. **Agent 2** (Frontend API Integration)
3. **Agent 3** (Infrastructure Setup)

These don't conflict - they work on separate parts.

### Phase 2 (After Phase 1):
4. **Agent 4** (Authentication) - requires 1-3 to be done

### Phase 3 (After Phase 2):
5. **Agent 5** (AI Pipeline Integration) - connect LangChain processors to sessions
6. **Agent 6** (Google Calendar Integration) - add calendar event creation

---

## Additional Recommended Agents

### Agent 5: AI Pipeline Integration (AFTER AUTH WORKS)

**Goal:** Connect the existing LangChain processors to the session workflow.

**Scope:**
- Wire up text/image/audio processors to session creation
- Update processors to save results to database (extracted_events, processed_events)
- Add background job queue (or simple async processing)
- Update session status during processing
- Handle errors and update error_message field

**Files to modify:**
- `backend/processors/` (existing)
- `backend/app.py` (call processors after session creation)
- `backend/database/models.py` (use update methods)

---

### Agent 6: Google Calendar Integration (AFTER AI PIPELINE WORKS)

**Goal:** Add calendar event creation from processed events.

**Scope:**
- Set up Google Calendar API credentials
- Request calendar scope during Google OAuth
- Store Google tokens in user table
- Create calendar client
- Implement event creation from processed_events
- Check for conflicts with existing calendar events
- Update session with calendar_event_ids

**Files to create/modify:**
- `backend/calendar/google_calendar.py` (NEW)
- `backend/calendar/__init__.py` (NEW)
- `backend/database/models.py` (add calendar token methods)

---

## Conflict Prevention Rules

- **Agent 1 & 2:** Don't conflict (separate backend/frontend)
- **Agent 1 & 3:** Don't conflict (code vs config)
- **Agent 2 & 3:** Don't conflict (code vs config)
- **Agent 4:** Runs AFTER 1-3, modifies files from all three
- **Agent 5 & 6:** Run sequentially after Agent 4

---

## Testing Strategy

After each phase:
- **Phase 1:** Test backend endpoints with curl, test frontend with placeholder user
- **Phase 2:** Test full auth flow, create real sessions
- **Phase 3:** Test AI processing, test calendar integration

---

## Summary

**Start immediately (parallel):**
- Agent 1: Backend Database & API
- Agent 2: Frontend API Integration
- Agent 3: Infrastructure Setup

**Start after Phase 1:**
- Agent 4: Authentication

**Start after Phase 2:**
- Agent 5: AI Pipeline Integration
- Agent 6: Google Calendar Integration
