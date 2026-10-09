# Deployment checklist (manual steps)

These steps need an account, credential or click from the project owner. The application runs locally without any of them, and nothing here costs money.

## What changed since the last deployment
The console now looks like the real one (top bar, Services menu, footer, CloudShell, Home page) and has an Amazon Q chat panel backed by Groq's free API. Two new tables (`assistant_conversations`, `assistant_messages`) are created automatically on start. No existing table changed, so **the Turso database does not need to be emptied again**.

## 1. Push the code to GitHub
```bash
cd "C:\Users\anime\Desktop\Animesh"
git push
```
Render and Vercel redeploy automatically after the push.

## 2. Switch on Amazon Q (free Groq key)
1. Create an account at https://console.groq.com and make an API key (free tier, no card).
2. Render → your API service → Environment → add `GROQ_API_KEY` = the key → Save (the service restarts).
3. For local use put the same line in `backend/.env`.

Never paste the key into the repository, the README or a chat. Without the key everything else works and the Amazon Q panel says it is not configured.

## 3. Rotate the Turso token (recommended)
The previous token was shared in a chat. In Turso create a new token for the database, set it as `TURSO_AUTH_TOKEN` on Render, and delete the old one.

## 4. Check the live site
1. Open `<render-url>/api/health` → `{"status":"ok"}` (the first request after idle can take about a minute).
2. Open the Vercel URL, sign in with `demo@example.com` / `password`, and check the dashboard (22 hosted zones).
3. Open Amazon Q (button in the top bar, or Ctrl+I) and ask "How many hosted zones do I have?"; open CloudShell (footer) and run `aws route53 list-hosted-zones`.
4. Create an account on the sign-up page and confirm it lands on the Home page with no data; use **Account → Load sample data**.

## 5. Optional settings (Render environment)
| Variable | Purpose | Default |
|---|---|---|
| `ALLOW_REGISTRATION` | set `false` to close sign-up | `true` |
| `MAX_FAILED_LOGINS` / `LOCKOUT_MINUTES` | account lockout policy | `5` / `15` |
| `GROQ_MODEL` / `GROQ_FALLBACK_MODEL` | Amazon Q models | `openai/gpt-oss-120b` / `llama-3.3-70b-versatile` |
| `ASSISTANT_DAILY_LIMIT` | Amazon Q questions per user per day | `100` |
| `CORS_ORIGINS` | only needed if the browser calls the API directly | empty |

## 6. Before submitting
- Make the GitHub repository public (it is private now) and confirm no secret is in the history.
- Confirm the README's hosted demo link works and that Amazon Q answers.
