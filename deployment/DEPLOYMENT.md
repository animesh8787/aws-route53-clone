# Deployment guide

| Piece | Platform | Cost | Config |
|---|---|---|---|
| FastAPI + SQLite | Render web service (Docker) | Free | `render.yaml`, `backend/Dockerfile` |
| Next.js UI | Vercel (Hobby) | Free | root directory `frontend`, env `BACKEND_URL` |

## How the two halves connect
The browser only ever talks to the Vercel origin. `frontend/next.config.ts` rewrites `/api/*` to `BACKEND_URL`, so the session cookie (`HttpOnly`, `SameSite=Lax`, `Secure` in production) is first-party and unaffected by third-party-cookie blocking. `BACKEND_URL` is read **at build time**; change it → redeploy.

## Steps
1. Push to GitHub.
2. Render → New → Blueprint → pick the repo. It builds `backend/Dockerfile`, generates `SECRET_KEY`, seeds demo data on first boot. Health check: `/api/health`.
3. Vercel → import repo, Root Directory `frontend`, env `BACKEND_URL=https://<service>.onrender.com`.
4. Open the Vercel URL and sign in with `demo@example.com` / `password`.

Free Render services sleep after ~15 minutes idle; the first request afterwards takes ~30-60 s while the API wakes and re-seeds.

## Persistence options (SQLite on free hosting)
SQLite needs a writable disk that outlives the process.

- **Render free:** no persistent disk. The database is rebuilt and re-seeded on every restart. Acceptable for a demo; documented in the README as a known limitation.
- **Render paid / Fly.io volume:** mount a disk at `/data` and keep `DATABASE_URL=sqlite:////data/route53.db` (the Docker default). Both require a payment method.
- **libSQL / Turso (free tier, SQLite-compatible):** would give hosted durability with a `DATABASE_URL` pointing at the Turso database via the `sqlalchemy-libsql` driver. Not implemented or tested in this repository.
- **Local / Docker:** `docker compose up --build` keeps data in the `db-data` volume.

## Schema migrations
`backend/alembic/versions/` holds the initial migration. The app creates missing tables on startup (`Base.metadata.create_all`), which is what the demo and tests use. For a managed database run `alembic upgrade head` from `backend/` instead.
