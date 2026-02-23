Start the full local dev environment. All three services run in background.

## Permissions needed

allowedPrompts:
- tool: Bash
  prompt: kill processes on ports 5000, 5173, 5174
- tool: Bash
  prompt: run docker-compose
- tool: Bash
  prompt: start dev servers

## Steps

1. **Kill existing servers** to free ports:
   - Kill any process on port 5000: `lsof -ti :5000 | xargs -r kill -9`
   - Kill any process on port 5173: `lsof -ti :5173 | xargs -r kill -9`
   - Kill any process on port 5174: `lsof -ti :5174 | xargs -r kill -9`
   Run all three in parallel. Don't worry if any fail (means nothing was running).

2. Start Duckling (required for temporal parsing):
   `docker-compose up -d duckling`
   Verify the container is running with `docker-compose ps`.

3. Start the backend Flask dev server (port 5000):
   `cd backend && python app.py`
   Run in background. Wait for "Running on http://127.0.0.1:5000" in output to confirm it started.

4. Start the frontend Vite dev server:
   `cd frontend && npm run dev`
   Run in background. Note the port it starts on (usually 5173 or 5174).

The frontend `.env.development.local` already points `VITE_API_URL` to `http://localhost:5000`.

Report the URLs for the frontend and backend when done.