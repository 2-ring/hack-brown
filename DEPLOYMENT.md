# DropCal Deployment Guide

This guide covers the complete deployment setup for DropCal using **Supabase** (database + storage) and **Render** (backend hosting).

---

## Prerequisites

- GitHub account (for Render deployment)
- Google account (for Supabase)
- Anthropic API key
- OpenAI API key (for audio transcription)
- Google Cloud Console project (for Calendar API)

---

## Part 1: Supabase Setup (Database + Storage)

### Step 1: Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign in
2. Click **"New Project"**
3. Fill in the details:
   - **Organization**: Choose or create one
   - **Name**: `dropcal` (or your preferred name)
   - **Database Password**: Create a strong password and **save it securely**
   - **Region**: Choose closest to your Render deployment (e.g., `US East (Ohio)` or `US West (Oregon)`)
4. Click **"Create new project"**
5. Wait ~2 minutes for provisioning

### Step 2: Run Database Schema

1. In your Supabase project, go to **SQL Editor** (left sidebar)
2. Click **"New Query"**
3. Copy the contents of `backend/database/schema.sql` and paste it
4. Click **"Run"** or press `Ctrl/Cmd + Enter`
5. Verify success: Go to **Table Editor** → You should see `users` and `sessions` tables

### Step 3: Create Storage Bucket

1. Go to **Storage** (left sidebar)
2. Click **"Create a new bucket"**
3. Bucket details:
   - **Name**: `uploads`
   - **Public bucket**: **Uncheck** (keep it private)
4. Click **"Create bucket"**

### Step 4: Configure Storage Policies

Since we're using the service role key in the backend, storage will work automatically. When you implement auth (Agent 4), you can add Row Level Security policies.

### Step 5: Get Supabase Credentials

1. Go to **Settings** → **API** (left sidebar)
2. Copy these values (you'll need them later):
   - **Project URL**: `https://xxxxx.supabase.co`
   - **API Key** → **`service_role`** (secret): This is your `SUPABASE_KEY`
   - **API Key** → **`anon` `public`**: Save this for frontend auth later
3. Go to **Settings** → **Database**
4. Copy the **Database password** you created in Step 1

---

## Part 2: Local Development Setup

### Step 1: Clone and Install

```bash
# Clone the repository
git clone <your-repo-url>
cd hack@brown

# Backend setup
cd backend
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt

# Frontend setup
cd ../frontend
npm install
```

### Step 2: Configure Backend Environment

1. Copy the example env file:
   ```bash
   cd backend
   cp .env.example .env
   ```

2. Edit `backend/.env` with your actual credentials:
   ```bash
   # Anthropic API Key
   ANTHROPIC_API_KEY=sk-ant-...

   # OpenAI API Key (for audio transcription)
   OPENAI_API_KEY=sk-...

   # Supabase Configuration
   SUPABASE_URL=https://xxxxx.supabase.co
   SUPABASE_KEY=your_service_role_key_here
   SUPABASE_DB_PASSWORD=your_database_password

   # Google Calendar OAuth Credentials
   GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=GOCSPX-xxxxx

   # Token Encryption Key (generate a new one!)
   # Generate with: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
   ENCRYPTION_KEY=5ynV6RgnTdmDJ21gALlncT7HfjETByQbUXGlzXc_RkQ=

   # Flask Configuration
   FLASK_ENV=development
   ```

   **Important:** Generate your own `ENCRYPTION_KEY` by running:
   ```bash
   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
   ```

### Step 3: Configure Frontend Environment

1. Copy the example env file:
   ```bash
   cd frontend
   cp .env.example .env
   ```

2. Edit `frontend/.env`:
   ```bash
   # Backend API URL
   VITE_API_URL=http://localhost:5000

   # Supabase Configuration (for frontend auth later)
   VITE_SUPABASE_URL=https://xxxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=your_anon_public_key_here
   ```

### Step 4: Test Locally

1. **Start backend**:
   ```bash
   cd backend
   source venv/bin/activate
   python app.py
   ```
   Visit: http://localhost:5000/api/health

2. **Start frontend** (in new terminal):
   ```bash
   cd frontend
   npm run dev
   ```
   Visit: http://localhost:5173

3. **Test database connection**:
   ```bash
   # Create a test session
   curl -X POST http://localhost:5000/api/sessions \
     -H "Content-Type: application/json" \
     -d '{"text": "Meeting tomorrow at 2pm", "user_id": "test-user"}'

   # Get sessions
   curl http://localhost:5000/api/sessions?user_id=test-user
   ```

4. **Verify in Supabase**:
   - Go to Supabase → **Table Editor** → `sessions`
   - You should see your test session

---

## Part 3: Render Deployment (Backend)

### Step 1: Push Code to GitHub

```bash
git add .
git commit -m "Add Supabase integration and deployment config"
git push origin main
```

### Step 2: Create Render Web Service

1. Go to [render.com](https://render.com) and sign in
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub repository
4. Render should auto-detect the `render.yaml` file
5. Or manually configure:
   - **Name**: `dropcal-backend`
   - **Region**: Same as Supabase (e.g., Oregon)
   - **Branch**: `main`
   - **Root Directory**: (leave blank)
   - **Environment**: `Python 3`
   - **Build Command**: `pip install -r backend/requirements.txt`
   - **Start Command**: `gunicorn -w 4 -b 0.0.0.0:$PORT backend.app:app --timeout 120`

### Step 3: Add Environment Variables

In Render dashboard, go to **Environment** and add:

```
PYTHON_VERSION=3.11.0
FLASK_ENV=production
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_KEY=your_service_role_key_here
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxx
ENCRYPTION_KEY=your_generated_encryption_key_here
```

**Important**:
- Generate `ENCRYPTION_KEY` with: `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`
- Click **"Save Changes"** after adding all variables.

### Step 4: Deploy

1. Click **"Create Web Service"**
2. Wait for deployment (~3-5 minutes)
3. Your backend will be live at: `https://dropcal-backend.onrender.com`

### Step 5: Test Production Backend

```bash
# Health check
curl https://dropcal-backend.onrender.com/api/health

# Create session
curl -X POST https://dropcal-backend.onrender.com/api/sessions \
  -H "Content-Type: application/json" \
  -d '{"text": "Team standup Friday at 10am", "user_id": "prod-test"}'
```

---

## Part 4: Frontend Deployment (Optional)

### Option A: Vercel

1. Go to [vercel.com](https://vercel.com)
2. Click **"New Project"** → Import your GitHub repo
3. Framework: **Vite**
4. Root Directory: `frontend`
5. Environment Variables:
   ```
   VITE_API_URL=https://dropcal-backend.onrender.com
   VITE_SUPABASE_URL=https://xxxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=your_anon_key
   ```
6. Deploy

### Option B: Netlify

1. Go to [netlify.com](https://netlify.com)
2. Click **"Add new site"** → Import from Git
3. Build settings:
   - **Base directory**: `frontend`
   - **Build command**: `npm run build`
   - **Publish directory**: `frontend/dist`
4. Environment variables: Same as Vercel
5. Deploy

### Option C: Render Static Site

1. In Render dashboard, click **"New +"** → **"Static Site"**
2. Connect repo
3. Configure:
   - **Name**: `dropcal-frontend`
   - **Root Directory**: `frontend`
   - **Build Command**: `npm run build`
   - **Publish Directory**: `frontend/dist`
4. Environment variables: Same as above
5. Deploy

---

## Verification Checklist

After deployment, verify:

- [ ] Backend health endpoint responds: `https://your-backend.onrender.com/api/health`
- [ ] Can create sessions via API
- [ ] Sessions appear in Supabase Table Editor
- [ ] Frontend loads and connects to backend
- [ ] File uploads work (test with image upload)
- [ ] Files appear in Supabase Storage bucket

---

## Troubleshooting

### Backend Issues

**Database connection fails:**
- Verify `SUPABASE_URL` and `SUPABASE_KEY` are correct
- Check Supabase project is not paused (free tier pauses after inactivity)
- Verify tables exist in Supabase Table Editor

**Import errors:**
- Ensure all dependencies in `requirements.txt` are installed
- Check Python version matches (3.11+)
- Rebuild on Render: **Manual Deploy** → **Clear build cache & deploy**

**Timeout errors:**
- Increase timeout in `render.yaml`: `--timeout 120`
- Optimize AI agent calls (run in background for large files)

### Frontend Issues

**Cannot connect to backend:**
- Check `VITE_API_URL` is set correctly
- Verify backend is running: visit health endpoint
- Check CORS configuration in `backend/app.py`

**Environment variables not working:**
- Prefix must be `VITE_` for Vite to expose them
- Restart dev server after changing `.env`
- Rebuild production site after changing environment variables

### Storage Issues

**File upload fails:**
- Verify `uploads` bucket exists in Supabase Storage
- Check file size limits (default 25MB in Flask)
- Verify file type is allowed in `FileStorage.ALLOWED_TYPES`

---

## Monitoring

### Render Logs
- Go to Render dashboard → Your service → **Logs**
- Real-time logs show all requests and errors

### Supabase Logs
- Go to Supabase → **Logs** (left sidebar)
- View database queries and API requests

### Error Tracking
- Check `/api/sessions` with `status: 'error'` in Supabase
- Review `error_message` field for details

---

## Cost Estimates

### Free Tier Limits

**Supabase (Free)**
- 500MB database
- 1GB file storage
- 2GB bandwidth/month
- Unlimited API requests

**Render (Free)**
- 750 hours/month (enough for 1 service 24/7)
- Service spins down after 15min inactivity
- 100GB bandwidth/month

**Upgrades Needed If:**
- Database > 500MB: Supabase Pro ($25/mo)
- Backend needs 24/7: Render Starter ($7/mo)
- High traffic: Both paid tiers

---

## Next Steps

After successful deployment:

1. **Implement Authentication (Agent 4)**
   - Enable Google OAuth in Supabase
   - Add auth UI to frontend
   - Protect backend routes

2. **Connect AI Pipeline (Agent 5)**
   - Wire processors to session creation
   - Update sessions with extracted events
   - Handle background processing

3. **Add Google Calendar Integration (Agent 6)**
   - Request calendar scopes during auth
   - Create events from processed_events
   - Check for conflicts

4. **Custom Domain (Optional)**
   - Add custom domain in Render/Vercel/Netlify
   - Update CORS settings in backend
   - Update frontend API URL

---

## Support

- **Supabase Docs**: https://supabase.com/docs
- **Render Docs**: https://render.com/docs
- **Integration Plan**: See `INTEGRATION_PLAN.md`
- **Agent Tasks**: See `AGENT_TASKS.md`
