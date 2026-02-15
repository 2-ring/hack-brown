Start the full local dev environment. All three services run in background.

## Steps

1. Start Duckling (required for temporal parsing):
   `docker-compose up -d duckling`
   Verify the container is running with `docker-compose ps`.

2. Start the backend Flask dev server (port 5000):
   `cd backend && python app.py`
   Run in background. Wait for "Running on http://127.0.0.1:5000" in output to confirm it started.

3. Start the frontend Vite dev server:
   `cd frontend && npm run dev`
   Run in background. Note the port it starts on (usually 5174 if 5173 is in use).

The frontend `.env.development.local` already points `VITE_API_URL` to `http://localhost:5000`.

Report the URLs for the frontend and backend when done.