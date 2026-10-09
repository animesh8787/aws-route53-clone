# Deployment checklist (manual steps)

These steps need an account, credential or click from the project owner. The application runs locally without any of them, and nothing here needs a new API key or paid service.

## What changed since the last deployment
The database schema grew (accounts, ownership, new tables). Render creates missing tables on start but does not alter existing ones, so the Turso database must be emptied once before the new version starts.

## 1. Push the code to GitHub
```bash
cd "C:\Users\anime\Desktop\Animesh"
git push
```
Render and Vercel redeploy automatically after the push.

## 2. Empty the Turso database (one time, before the new backend starts)
Turso dashboard → your `route53` database → SQL console. Run these statements (all of them; select all and run, or run line by line):
```sql
DROP TABLE IF EXISTS activity_events;
DROP TABLE IF EXISTS resources;
DROP TABLE IF EXISTS dns_records;
DROP TABLE IF EXISTS vpc_associations;
DROP TABLE IF EXISTS hosted_zones;
DROP TABLE IF EXISTS mock_health_checks;
DROP TABLE IF EXISTS health_checks;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS users;
```
Then in Render: Manual Deploy → Restart service (or wait for the push to redeploy). The log should show `Seeded demo data.`; the first start takes about half a minute.

## 3. Rotate the Turso token (recommended)
The previous token was shared in a chat. In Turso create a new token for the database, set it as `TURSO_AUTH_TOKEN` on Render, and delete the old one.

## 4. Check the live site
1. Open `<render-url>/api/health` → `{"status":"ok"}` (the first request after idle can take about a minute).
2. Open the Vercel URL, sign in with `demo@example.com` / `password`, and check the dashboard (22 hosted zones).
3. Create an account on the sign-up page and confirm it starts empty; use **Account → Load sample data**.

## 5. Optional settings (Render environment)
| Variable | Purpose | Default |
|---|---|---|
| `ALLOW_REGISTRATION` | set `false` to close sign-up | `true` |
| `MAX_FAILED_LOGINS` / `LOCKOUT_MINUTES` | account lockout policy | `5` / `15` |
| `CORS_ORIGINS` | only needed if the browser calls the API directly | empty |

## 6. Before submitting
- Make the GitHub repository public (it is private now) and confirm no secret is in the history.
- Confirm the README's hosted demo link works.
