# Human actions required

Everything below needs an account, credential or click that only you can provide. The application itself is complete and runs locally without any of it. Everything is free-tier; no card should be required (if a platform asks for one, stop and tell me).

## 1. Push the code to GitHub
**Requirement:** a GitHub repository containing `frontend/` and `backend/` (assignment deliverable).
**Why:** needs your GitHub authentication.
**Action:**
```bash
cd "C:\Users\anime\Desktop\New folder (2)"
git remote add origin https://github.com/<your-user>/route53-clone.git
git push -u origin master
```
**Status:** Pending
**Resume point:** Tell me the repo URL so I can put it in the README.

## 2. Create a free Turso database (keeps hosted data across restarts)
**Requirement:** durable SQLite storage for the hosted API.
**Why:** needs your Turso account (sign in at turso.tech with GitHub; no card on the free plan).
**Action:** Turso dashboard (or CLI) -> create a database (any name) -> copy its URL (`libsql://<name>-<org>.turso.io`) -> create a database token and copy it.
Use the URL in the form `sqlite+libsql://<name>-<org>.turso.io?secure=true`.
**Status:** Pending
**Resume point:** Used in step 3. Without it the API still works but its data resets on restart.

## 3. Deploy the API on Render (free)
**Requirement:** hosted backend URL.
**Why:** needs a Render account connected to GitHub.
**Action:** Render dashboard -> New -> Blueprint -> select the repo (reads `render.yaml`). When prompted enter `DATABASE_URL` (the `sqlite+libsql://...` value from step 2) and `TURSO_AUTH_TOKEN`; leave `CORS_ORIGINS` blank. Copy the service URL (e.g. `https://route53-clone-api.onrender.com`).
**Status:** Pending
**Resume point:** Open `<service-url>/api/health`; it should return `{"status":"ok"}`.

## 4. Deploy the frontend on Vercel (free Hobby plan)
**Requirement:** hosted frontend URL (the demo link for the assignment).
**Why:** needs a Vercel account connected to GitHub.
**Action:** Vercel → Add New Project → import the repo → set **Root Directory** to `frontend` → add environment variable `BACKEND_URL` = the Render URL from step 3 (no trailing slash) → Deploy.
**Status:** Pending
**Resume point:** Send me both URLs; I will add them to the README.

## 5. (Alternative) Durable data without Turso
Skip step 2 only if you accept that data resets when the free Render API restarts. Other options are in `deployment/DEPLOYMENT.md`.
**Status:** Optional
