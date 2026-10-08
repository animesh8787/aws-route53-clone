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

## 2. Deploy the API on Render (free)
**Requirement:** hosted backend URL.
**Why:** needs a Render account connected to GitHub.
**Action:** Render dashboard → New → Blueprint → select the repo (reads `render.yaml`). When prompted, leave `CORS_ORIGINS` blank for now. Copy the service URL (e.g. `https://route53-clone-api.onrender.com`).
**Status:** Pending
**Resume point:** After step 3, set `CORS_ORIGINS` on Render to the Vercel URL (optional: all browser traffic is proxied same-origin, so the API works even before this).

## 3. Deploy the frontend on Vercel (free Hobby plan)
**Requirement:** hosted frontend URL (the demo link for the assignment).
**Why:** needs a Vercel account connected to GitHub.
**Action:** Vercel → Add New Project → import the repo → set **Root Directory** to `frontend` → add environment variable `BACKEND_URL` = the Render URL from step 2 (no trailing slash) → Deploy.
**Status:** Pending
**Resume point:** Send me both URLs; I will add them to the README.

## 4. (Optional) Durable data on a free host
Render's free plan has no persistent disk, so data resets whenever the API restarts or sleeps and is re-seeded with the demo data. This is fine for a demo. If you need hosted data to survive restarts, see "Persistence options" in `deployment/DEPLOYMENT.md` (e.g. a Fly.io volume, which requires a payment card, or a libSQL/Turso database, which is untested here).
**Status:** Optional
