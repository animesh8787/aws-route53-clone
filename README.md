# AWS Route 53 Console Clone

A functional clone of the **AWS Route 53 management console**: hosted zones and DNS records for nine record types, six routing policies plus IP-based routing, health checks, traffic policies, domains, Resolver, DNS Firewall, billing estimates and real accounts with per-user data. It reproduces the console's look and workflows rather than real DNS: the UI is built with [Cloudscape](https://cloudscape.design) (the open-source design system AWS uses for its console), with a FastAPI + SQLite backend behind it.

| | |
|---|---|
| **Demo login** | `demo@example.com` / `password` (or create your own account on the sign-up page) |
| **Hosted demo** | https://aws-route53-clone-beta.vercel.app |
| **Stack** | Next.js 16 (TypeScript) · FastAPI · SQLAlchemy 2 · SQLite (Turso for hosted durability) |

![Hosted zone detail](docs/screenshots/05-hosted-zone-detail.png)

## Contents
1. [Features](#features) · 2. [Screenshots](#screenshots) · 3. [UI/UX approach](#uiux-approach) · 4. [Architecture](#architecture) · 5. [Folder structure](#folder-structure) · 6. [Local setup](#local-setup) · 7. [Environment variables](#environment-variables) · 8. [Database schema](#database-schema) · 9. [API overview](#api-overview) · 10. [DNS records & validation](#dns-records--validation) · 11. [Routing policies](#routing-policies) · 12. [DNS simulator](#dns-simulator) · 13. [Console areas](#console-areas) · 14. [Amazon Q assistant](#amazon-q-assistant) · 15. [BIND import / export](#bind-import--export) · 16. [Security](#security) · 17. [Testing](#testing) · 18. [Deployment](#deployment) · 19. [Known limitations](#known-limitations)

## Features
**Core (assignment scope)**
- Authentication: sign up, sign in, sign out, persistent sessions, protected routes.
- **Hosted zones** (public and private): list, search, filter, sort, server-side pagination, create, edit, delete. Every zone gets deterministic **SOA** and **NS** system records.
- **DNS records**: create, view, search, edit, delete for **A, AAAA, CNAME, TXT, MX, NS, PTR, SRV, CAA** with one dynamic editor that changes with the record type (structured rows for MX, SRV and CAA).
- Route 53 look and feel: top navigation, collapsible service navigation, breadcrumbs, flashbar notifications, tables with selection, sorting and preferences, modals, empty, loading and error states, context help panel.
- Every entry of the side navigation is a working page; the dashboard summarises all areas.

**Beyond the brief**
- **Routing policies**: simple, weighted, latency, failover, geolocation, multivalue and **IP-based** (CIDR collections); alias records to CloudFront, ELB, S3 website, API Gateway or another record.
- **Health checks** with status history that drive failover and multivalue answers; **Traffic policies** (versioned JSON) and **policy records** that materialise into real DNS records; **CIDR collections**; **Profiles**.
- **Registered domains**: simulated search, registration (creates the hosted zone), renewal, transfer-out code, request history.
- **Resolver**: VPC overview, inbound and outbound endpoints, forwarding rules, query logging. **DNS Firewall**: domain lists and rule groups.
- A **DNS simulator** ("Test record") that answers queries from the stored data, optionally from a source VPC (firewall, forwarding, private zones, query logging).
- **Billing** estimate computed from your resources, **notifications** and an activity feed, hosted zone **tags** and **DNSSEC** (simulated keys).
- **Real accounts**: sign up with password rules, lockout, rate limits, CSRF protection, security headers, sessions list and revocation, change password, per-user data isolation, sample data.
- **Console chrome like AWS**: dark top bar with a console-wide search, the Services menu (all categories, favourites, recently visited), notifications, a settings menu (theme, shortcuts), an account menu, the footer with **CloudShell**, Feedback, Privacy and Terms, and a **Home** page that new accounts land on.
- **[Amazon Q](#amazon-q-assistant)** chat panel (Ctrl+I): reads your own zones, records and health checks, explains DNS and Route 53, and guides changes with console steps, CLI commands or CloudFormation. It never changes anything itself.
- **CloudShell**: a simulated, read-only shell (`aws route53 …`, `aws route53domains …`, `aws sts get-caller-identity`, `dig`, `nslookup`, `help`) that answers from your own data.
- **Global resolvers, shared DNS views and Resolver on Outposts**, domain **transfer in** and a **billing report**.

**Bonus items**
- BIND zone-file **import** (upload or paste, preview, confirm) and **export** as JSON or BIND; **dark mode**; **keyboard shortcuts**; **bulk operations** (delete and edit TTL).

## Screenshots
| | |
|---|---|
| ![Landing](docs/screenshots/00-landing.png) Public landing page | ![Login](docs/screenshots/01-login.png) Sign in |
| ![Sign up](docs/screenshots/01b-signup.png) Sign up with live password rules | ![Dashboard](docs/screenshots/02-dashboard.png) Dashboard |
| ![Hosted zones](docs/screenshots/03-hosted-zones.png) Hosted zones |
| ![Create A](docs/screenshots/07-create-a-record.png) Record editor | ![Create MX](docs/screenshots/08-create-mx-record.png) Structured MX editor |
| ![Weighted routing](docs/screenshots/09c-weighted-routing.png) Routing policy fields | ![Search and filter](docs/screenshots/10-search-filter.png) Search and filter |
| ![Import](docs/screenshots/12-import-preview.png) BIND import preview | ![Test record](docs/screenshots/15-test-record-weighted.png) DNS simulator |
| ![Health checks](docs/screenshots/20-health-checks.png) Health checks | ![Health check](docs/screenshots/21-health-check-detail.png) Health check detail |
| ![Traffic policy](docs/screenshots/23-traffic-policy.png) Traffic policy | ![CIDR collection](docs/screenshots/25-cidr-collection.png) CIDR collection |
| ![Register domain](docs/screenshots/27-register-domain.png) Domain registration | ![Domains](docs/screenshots/26-registered-domains.png) Registered domains |
| ![Resolver VPCs](docs/screenshots/29-resolver-vpcs.png) Resolver VPCs | ![Rules](docs/screenshots/30-resolver-rules.png) Resolver rules |
| ![DNS Firewall](docs/screenshots/31-dns-firewall.png) DNS Firewall | ![DNSSEC](docs/screenshots/33-dnssec.png) DNSSEC signing |
| ![Billing](docs/screenshots/35-billing.png) Billing estimate | ![Activity](docs/screenshots/36-activity.png) Activity |
| ![Account](docs/screenshots/37-account.png) Account | ![Security](docs/screenshots/38-security-credentials.png) Security credentials |
| ![Notifications](docs/screenshots/39-notifications.png) Notifications | ![Help](docs/screenshots/41-help-panel.png) Help panel |
| ![Home](docs/screenshots/42-home.png) Home | ![Global resolvers](docs/screenshots/43-global-resolvers.png) Global resolvers |
| ![Amazon Q](docs/screenshots/44-amazon-q-welcome.png) Amazon Q | ![Amazon Q answer](docs/screenshots/45-amazon-q-answer.png) Amazon Q answer |
| ![CloudShell](docs/screenshots/46-cloudshell.png) CloudShell | ![Services menu](docs/screenshots/40-services-menu.png) Services menu |
| ![Dark mode](docs/screenshots/16-dark-mode.png) Dark mode | ![Mobile](docs/screenshots/17-mobile.png) Mobile |

Regenerate them with `npm run screenshots` (in `frontend/`).

## UI/UX approach
The assignment asks for a look and feel "exactly the same" as Route 53, so the UI uses **Cloudscape** (`@cloudscape-design/components`), the same component library as the real console, instead of approximating it with custom CSS. Page structure follows the console: dark top navigation (Services menu, notifications, help, account menu), "Route 53" side navigation, breadcrumbs, sticky table headers with `View details / Edit / Delete / Create`, details panels with tabs, full-page forms, and typed confirmations for destructive actions.

The code that is ours is the feature layer: the dynamic record editor, validation, URL-synced table state, data fetching, the resource framework, the simulator and the whole backend.

## Architecture
```
Browser ──► Next.js (React, Cloudscape, TanStack Query, React Hook Form + Zod)
              │  /api/*  (Next.js rewrite → same-origin, first-party cookie)
              ▼
           FastAPI ── routers → services → repositories → SQLAlchemy ── SQLite / Turso
                         │          │
                         │          └ dns/validators.py (pure DNS rules)
                         └ Pydantic schemas, uniform error contract
```
- **Backend layers**: `api/routers` (HTTP only) → `services` (business rules: conflicts, system records, import, resolver, domains, billing, auth) → `repositories` (query building) → `models`.
- **Two storage styles.** The core DNS entities (zones, records, health checks) are relational tables. The many console configuration objects (profiles, policies, endpoints, rules, firewall objects, domains...) share one `resources` table with a Pydantic-validated JSON payload per *kind*. Each kind is a small declarative definition (payload model, validation, delete guard, hooks), so adding a resource type does not mean a new table, router or page.
- **Frontend resource framework.** List, create/edit and detail pages for those objects are generated from a config (`columns`, `fields`, `detailRows`, `detailTabs`), including server-side search, filters, sorting and pagination synced to the URL. Custom editors (policy JSON with preview, row editors, domain registration wizard) plug into the same form.
- **Validation twice.** `lib/dns-validation.ts` and Zod give instant feedback; the backend re-validates everything and returns field-level errors that the forms map back onto inputs.
- **Error contract.** Every error is `{"detail": "message", "errors": [{"field", "message"}]}` with 400/401/403/404/409/422/429; stack traces never reach the client.
- **Record storage.** One row per Route 53 *resource record set* (`name + type + set identifier`) with `values` as a JSON list of canonical presentation strings (`10 mail.example.com.`). Routing, alias, IP-based and policy-record settings are real columns; `parsed_values` in responses gives the structured form for editors.
- **Ownership.** Every zone, health check, resource and event belongs to a user (`owner_id`) and every query is scoped to the signed-in user.

## Folder structure
```
backend/
  app/
    api/ (deps.py, routers/)   core/ (config, security, errors, ratelimit, ids)   db/
    models/  schemas/  repositories/  dns/ (constants, validators, mock_data)
    services/ (zone, record, validation, resolver, bind, domain, billing, auth, activity ...)
    services/assistant/ (Amazon Q: Groq client, read-only tools, prompt)
    services/resources/ (framework + kinds/: profile, cidr, traffic policy, policy record, domain, resolver, firewall)
    seed.py  main.py
  alembic/ (migration)   tests/   Dockerfile   pyproject.toml
frontend/
  src/app/ (login, signup, (console)/ dashboard, hosted-zones, [section] resource pages, billing, account ...)
  src/components/ (layout, common, resource, states)   src/features/ (auth, records, hosted-zones, resolver, firewall, assistant, cloudshell ...)
  src/hooks/  src/lib/ (api, dns-validation, record-config, record-schema, resource-config)  src/types/
  e2e/ (Playwright)   Dockerfile
docs/screenshots/   docker-compose.yml   render.yaml   .env.example
```

## Local setup
Prerequisites: Python 3.11+, Node 20+ (tested on 24).

```bash
# 1) Backend  (http://localhost:8000, interactive docs at /api/docs)
cd backend
python -m venv .venv
.venv/Scripts/activate        # Windows (macOS/Linux: source .venv/bin/activate)
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000     # creates the SQLite DB and demo data on first start
```
```bash
# 2) Frontend  (http://localhost:3000)
cd frontend
npm install
npm run dev
```
Sign in with `demo@example.com` / `password`, or create an account. Reset the database: `cd backend && python -m app.seed --reset`.

**Docker:** `docker compose up --build` → http://localhost:3000 (data kept in the `db-data` volume).

## Environment variables
See [`.env.example`](.env.example). Defaults work for local development.

| Variable | Where | Purpose |
|---|---|---|
| `DATABASE_URL` | backend | SQLAlchemy URL (default `sqlite:///backend/route53.db`; `sqlite+libsql://…` for Turso) |
| `TURSO_AUTH_TOKEN` | backend | Token for a Turso database |
| `SECRET_KEY` | backend | Secret for the deployment (set a random value in production) |
| `COOKIE_SECURE` | backend | `true` over HTTPS |
| `CORS_ORIGINS` | backend | Allowed browser origins |
| `SEED_ON_START` | backend | Create tables and the demo account's data on startup |
| `ALLOW_REGISTRATION` | backend | `false` closes sign-up (default `true`) |
| `MAX_FAILED_LOGINS`, `LOCKOUT_MINUTES` | backend | Account lockout policy (defaults 5 and 15) |
| `GROQ_API_KEY` | backend | Free key from console.groq.com that switches Amazon Q on (without it the panel says it is not configured) |
| `GROQ_MODEL`, `GROQ_FALLBACK_MODEL` | backend | Chat models (defaults `openai/gpt-oss-120b`, then `llama-3.3-70b-versatile`) |
| `ASSISTANT_DAILY_LIMIT` | backend | Questions per user per day (default 100) |
| `ASSISTANT_FAKE` | backend | `true` answers from stored data without any API call (used by the end-to-end tests) |
| `BACKEND_URL` | frontend (build time) | Target of the `/api/*` rewrite |

## Database schema
SQLite, foreign keys enforced (`PRAGMA foreign_keys=ON`), all child rows cascade from their owner. Migration: `backend/alembic/versions/`.

| Table | Purpose | Key columns |
|---|---|---|
| `users` | Accounts | `email` (unique), `password_hash` (bcrypt), `display_name`, `account_id`, `failed_logins`, `locked_until`, `password_changed_at` |
| `sessions` | Server-side sessions | `token_hash` (SHA-256, unique), `user_id → users`, `expires_at`, `last_seen_at`, `user_agent`, `ip_address` |
| `hosted_zones` | Zones | `owner_id → users`, `zone_id` (unique), `name`, `is_private`, `comment`, `record_count`, `tags` (JSON), `dnssec` (JSON); unique `(owner_id, name, is_private)` |
| `vpc_associations` | Mocked VPCs of private zones | `hosted_zone_id → hosted_zones`, `vpc_id`, `region` |
| `dns_records` | Resource record sets | `hosted_zone_id → hosted_zones`, `name`, `type`, `ttl`, `values` (JSON), routing columns (`routing_policy`, `set_identifier`, `weight`, `region`, `failover`, `geo_*`, `cidr_collection_id`, `cidr_location`), alias columns, `health_check_id → health_checks`, `policy_record_id`, `is_system`; unique `(zone, name, type, set_identifier)` |
| `health_checks` | Simulated health checks | `owner_id`, `health_check_id` (unique), `type`, `endpoint`, `port`, `path`, `search_string`, `request_interval`, `failure_threshold`, `regions`, `status`, `history` (JSON) |
| `resources` | Console objects of every kind | `owner_id`, `kind`, `public_id` (unique), `name`, `status`, `data` (JSON); unique `(owner_id, kind, name)` |
| `activity_events` | Audit trail / notifications | `owner_id`, `action`, `resource_type`, `resource_name`, `href`, `detail`, `is_read` |
| `assistant_conversations` | Amazon Q chats | `owner_id`, `public_id` (`conv-…`), `title`, timestamps |
| `assistant_messages` | Messages of a chat | `conversation_id → assistant_conversations`, `role`, `content`, `feedback` |

**System records.** Creating a zone adds an apex `NS` (four `ns-N.awsdns-NN.{com,net,org,co.uk}.` servers) and `SOA`, derived deterministically from the zone ID and flagged `is_system`. They cannot be deleted (403); only their TTL and values can change. A zone that still has other records can be deleted only after explicit acknowledgement (`?force=true`).

## API overview
Interactive documentation: `GET /api/docs`. Every endpoint except `auth/register`, `auth/login` and `auth/config` needs the session cookie, and every state-changing request needs the `X-Requested-With: fetch` header (set by the web client).

| Area | Endpoints |
|---|---|
| Auth | `POST /api/auth/register · login · logout · change-password` · `GET /api/auth/me · config · sessions` · `PATCH /api/auth/me` · `DELETE /api/auth/me · sessions/{id}` · `POST /api/auth/sessions/revoke-others` |
| Account | `GET /api/account/summary` · `POST /api/account/sample-data · clear-data` |
| Hosted zones | `GET/POST /api/hosted-zones` · `GET/PUT/DELETE /api/hosted-zones/{id}` (`?q&type&sort&order&page&page_size`, `DELETE ?force=true`) |
| Zone extras | `GET/PUT /api/hosted-zones/{id}/tags` · `GET /api/hosted-zones/{id}/dnssec` · `POST …/dnssec/enable · disable` |
| Records | `GET/POST /api/hosted-zones/{id}/records` (`q`, `type`, `routing_policy`, `alias`, sort, pagination) · `POST …/records/bulk-delete · bulk-ttl` · `GET/PUT/DELETE /api/records/{id}` |
| Import / export | `POST /api/hosted-zones/{id}/import` (`dry_run`, `skip_invalid`) · `GET /api/hosted-zones/{id}/export?format=json\|bind` |
| Simulator | `GET /api/dns/resolve?name=&type=` (+ `client_region`, `client_country`, `client_ip`, `source_vpc`, `seed`) |
| Health checks | `GET/POST /api/health-checks` · `GET/PUT/DELETE /api/health-checks/{id}` · `PATCH …/{id}/status` · `GET …/{id}/records` |
| Console resources | `GET/POST /api/resources/{kind}` · `GET/PUT/DELETE /api/resources/{kind}/{id}`; kinds: `profile`, `cidr_collection`, `traffic_policy`, `policy_record`, `domain`, `domain_request`, `resolver_inbound`, `resolver_outbound`, `resolver_rule`, `query_logging`, `fw_domain_list`, `fw_rule_group`, `global_resolver`, `shared_dns_view` (read-only), `resolver_outpost` (list: `q`, `status`, `filter_<field>`, `sort`, `order`, `page`, `page_size`) |
| Domains | `GET /api/domains/availability?name=` · `POST /api/domains/{id}/renew · transfer-out` · `POST /api/domains/transfer-in` |
| Amazon Q | `GET /api/assistant/status` · `POST /api/assistant/chat` (server-sent events) · `GET /api/assistant/conversations` · `GET/DELETE /api/assistant/conversations/{id}` · `DELETE /api/assistant/conversations` · `POST /api/assistant/messages/{id}/feedback` |
| Resolver | `GET /api/resolver/vpcs` · `GET /api/resolver/vpcs/{vpc_id}` · `GET /api/vpcs` |
| Other | `GET /api/dashboard/summary` · `GET /api/billing/estimate` · `GET /api/activity` · `GET /api/activity/summary` · `POST /api/activity/read · feedback` · `GET /api/health` |

## DNS records & validation
| Type | Accepted value | Notes |
|---|---|---|
| A / AAAA | IPv4 / IPv6 (normalised, e.g. `2001:0db8::1` → `2001:db8::1`) | one per line |
| CNAME | host name | single value; not at the apex; cannot coexist with other types at the name |
| TXT | raw text, or one or more `"quoted"` strings | quoting and escaping handled; long raw text is split into 255-char strings |
| MX | `priority host` (0-65535) | multiple values |
| NS / PTR | host names | |
| SRV | `priority weight port target` (each 0-65535) | name like `_sip._tcp` |
| CAA | `flags tag "value"` | flags 0-255, tag `issue` / `issuewild` / `iodef` |

Rules enforced on both client and server: label and name length (63/253), wildcard only as the leftmost label, names must belong to the zone, relative / `@` / absolute names accepted, TTL 0-2147483647, unsupported types rejected, duplicate values rejected. **Conflicts (409):** duplicate name/type/record ID, CNAME exclusivity, mixed routing policies for one name and type, duplicate failover role, latency region, geolocation or CIDR location, records managed by a traffic policy.

## Routing policies
| Policy | Required fields | Rules |
|---|---|---|
| Simple | none | no record ID |
| Weighted | record ID, weight 0-255 | |
| Latency | record ID, AWS region | one record per region |
| Failover | record ID, PRIMARY or SECONDARY | one of each; optional health check |
| Geolocation | record ID, continent or country (or `*` default), optional US state | one record per location |
| Multivalue | record ID | one value per record |
| IP-based | record ID, CIDR collection, location (or `*` default) | one record per location |

**Alias records** (A, AAAA, CNAME): target type CloudFront, ELB, S3 website, API Gateway or another record in the zone (must exist), plus *evaluate target health*. They have no TTL or values.

## DNS simulator
`GET /api/dns/resolve` (UI: zone → **Test record**) finds the most specific hosted zone and applies the DNS lookup order to your stored records: exact match → CNAME chase (up to 8) → wildcard (only if the name has no records) → routing policy → alias.

- **Weighted**: random choice proportional to weight (deterministic with `seed`). **Failover**: PRIMARY while its health check is healthy, else SECONDARY. **Latency**: closest to `client_region`. **Geolocation**: subdivision → country → continent → default. **Multivalue**: up to 8 healthy records. **IP-based**: the location whose CIDR block contains `client_ip`, else the default.
- **From a VPC** (`source_vpc`): DNS Firewall rule groups apply first (ALLOW, BLOCK with NODATA / NXDOMAIN / OVERRIDE, ALERT), private zones are visible only when associated with the VPC, otherwise the most specific resolver rule can forward the query, and query logging destinations are noted.
- Responses include `rcode`, `answers`, the chosen record and a human-readable `trace`. Aliases to AWS services return deterministic **simulated** addresses; forwarded queries return no answer data.

## Console areas
| Area | What you can do |
|---|---|
| Health checks | Create HTTP/HTTPS/TCP checks with string matching; toggle simulated status with history; see which records use them |
| Profiles | Bundle VPCs, private zones and resolver resources (a VPC belongs to one profile) |
| CIDR collections | Named locations of IPv4/IPv6 blocks (no overlaps); used by IP-based records |
| Traffic policies | Versioned JSON documents (failover, weighted, latency, geo, multivalue) with a live preview |
| Policy records | Apply a policy version to a DNS name; the matching records are created, shown with a *Traffic policy* badge and removed with it |
| Registered domains | Simulated search with prices, a three-step registration wizard (creates the hosted zone), renew, transfer lock, auth code |
| Requests | Registration, renewal and transfer history (requests complete a few seconds after submission) |
| Resolver | VPC overview, inbound and outbound endpoints (addresses allocated inside the VPC range), forwarding rules, query logging |
| DNS Firewall | Domain lists (paste or import a file, wildcards) and rule groups with priorities and VPC associations |
| Hosted zone tabs | Records, DNSSEC signing (simulated KSK and DS record), tags |
| Billing | Monthly estimate from your resources with an editable-in-code price table (labelled as an estimate) |
| Notifications | Unread badge, latest events, full activity list |

## Amazon Q assistant
The Amazon Q button in the top bar (or **Ctrl+I**) opens a chat panel on the left, laid out like the real console's: new chat, prompt library, history, full screen, suggested prompts, streamed answers with copy buttons and *Helpful / Not helpful* feedback. It uses [Groq](https://console.groq.com)'s free OpenAI-compatible API.

- **What it can do**: look at your own hosted zones, records, health checks, resolver and other resources, the billing estimate and recent activity; resolve names with the simulator; explain AWS and DNS concepts; and give step-by-step console instructions, CLI commands or CloudFormation for changes.
- **What it cannot do**: change anything. The backend exposes it nine read-only, per-user tools (`get_account_overview`, `list_hosted_zones`, `get_hosted_zone`, `search_records`, `list_health_checks`, `resolve_dns`, `list_console_resources`, `get_billing_estimate`, `recent_activity`); the model decides which to call (up to four rounds per question) and there is no write tool. Questions about topics other than AWS are declined.
- **Page-aware**: each question carries the current page, so "why is this failing?" works; error alerts have a **Diagnose with Amazon Q** button.
- **Safety**: text coming from tools or pages is treated as data, never as instructions; per-user limits (12 questions a minute, `ASSISTANT_DAILY_LIMIT` a day, 10,000 characters per message); the API key lives only in the server environment and never reaches the browser; chats are stored per user and removed with *Clear data* or account closure.
- **Setup**: create a free key at console.groq.com and set `GROQ_API_KEY` (in `backend/.env` locally, in the Render environment when hosted). Without it the panel explains that Amazon Q is not configured. With `ASSISTANT_FAKE=true` it answers from stored data without any API call, which is what the tests use.

## BIND import / export
**Import** (`Hosted zone → Import zone file`): paste or upload (up to 1 MB) → *Preview import* (nothing saved; each row shows Valid, Error or Skipped with line number and reason) → *Import*. The import is all-or-nothing unless *Skip invalid records* is ticked.

Supported: `$ORIGIN`, `$TTL` (including `1h`, `2d`), `@`, relative and absolute names, blank owner (repeats the previous), optional TTL and `IN`, parenthesised multi-line values, `;` comments, quoted TXT strings; A, AAAA, CNAME, TXT, MX, NS, PTR, SRV, CAA. SOA and apex NS are skipped (managed by Route 53). Not supported: `$INCLUDE`, `$GENERATE`, classes other than `IN`, DNSSEC types.

**Export:** JSON (zone metadata and every record with structured values) or a BIND zone file. Alias records cannot be expressed in BIND and are emitted as comments; routing details are added as trailing comments.

## Security
- **Passwords**: bcrypt hashes; at least 10 characters with a letter and a number, not common, not containing the email name, at most 72 bytes. The sign-up form shows each rule as it is met.
- **Sessions**: a random token in an `HttpOnly`, `SameSite=Lax` cookie (`Secure` in production). Only a SHA-256 of the token is stored, a fresh token is issued on every sign-in, sessions expire after 7 days, at most 10 are kept per user, and users can list and end sessions. Changing the password signs out every other session.
- **Brute-force protection**: failed sign-ins are counted per account; five failures lock the account for 15 minutes, and unknown-email and wrong-password failures look identical. Per-address rate limits apply to sign-in and sign-up.
- **CSRF**: besides `SameSite=Lax`, state-changing requests must carry `X-Requested-With: fetch`, which a cross-site page cannot add without a CORS preflight.
- **Isolation**: every query is scoped to the signed-in user; other users' IDs return 404, including numeric IDs, references between resources and the DNS simulator.
- **Headers**: `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy` (and HSTS in production) on both the API and the web app; auth responses are `no-store`.
- **Input**: Pydantic validation on every payload, parameterised SQL through SQLAlchemy, 1 MB limit on zone-file import, no stack traces in responses, secrets only from environment variables.
- Accounts can edit their display name, close their account (password required) and clear their data.

## Testing
```bash
cd backend && pytest -q                  # 123 tests
cd backend && ruff check app tests
cd frontend && npm run typecheck && npm run lint
cd frontend && PW_CHANNEL=chrome npm run test:e2e   # Playwright, 24 tests; omit PW_CHANNEL to use bundled Chromium (npx playwright install chromium)
```
- **Backend (pytest, isolated SQLite file):** authentication, lockout, rate limits, CSRF, sessions, password change, account isolation across every endpoint, zone and record CRUD, system records, all record types (valid and invalid), conflicts, routing policies, alias, IP-based routing, traffic policies and policy records, BIND import/export, resolver behaviour for every policy plus firewall, forwarding and private zones, domains, health checks, billing, activity, tags, DNSSEC, seed data.
- **End to end (Playwright, production build, throw-away database):** sign-up validation and sample data, password change and sessions, lockout, the full hosted-zone and record workflow with persistence across sessions, every record type through the editor, BIND import/export, every console area (create, validate, edit, delete), the top bar, billing, tags and DNSSEC, and a smoke test that opens every navigation entry.

## Deployment
Target: **Vercel** (frontend) + **Render free web service** (API) + **Turso** (hosted SQLite), all free. The browser only talks to the Vercel origin: `frontend/next.config.ts` rewrites `/api/*` to `BACKEND_URL` (read at build time), so the session cookie stays first-party.

1. **Render** → New → Blueprint → pick the repository. It builds `backend/Dockerfile` from `render.yaml`, generates `SECRET_KEY` and checks `/api/health`.
2. **Turso** (durable data): create a free database and set `DATABASE_URL=sqlite+libsql://<db>-<org>.turso.io?secure=true` and `TURSO_AUTH_TOKEN` on Render. Without it the SQLite file is rebuilt and re-seeded on every restart (Render's free plan has no disk).
3. **Vercel** → import the repository, Root Directory `frontend`, env `BACKEND_URL=https://<service>.onrender.com`.
4. Optional: set `GROQ_API_KEY` on Render to switch Amazon Q on.

Free Render services sleep after about 15 minutes idle; the first request afterwards takes up to a minute. Tables are created on start (`Base.metadata.create_all`); `backend/alembic/versions/` holds the initial migration for managed databases (`alembic upgrade head`).

## Known limitations
- **Durability on Render's free plan depends on Turso.** Render's free plan has no persistent disk, so without a Turso database the SQLite file is recreated and re-seeded on every restart. Free services also sleep when idle; the first request can take up to a minute.
- Everything AWS-side is simulated: health checks (the status is a toggle, nothing is probed), domain availability and prices, DNSSEC keys, billing prices, forwarded DNS answers, endpoint addresses. This is not an authoritative DNS server and nothing is registered or charged anywhere.
- Traffic policies support one rule level (no nested rules) because each rule becomes ordinary routing records.
- Sign-up has no email verification or password reset (there is no mail service); sessions and lockout are the account protections.
- Rate limiting is in memory, per API process.
- Amazon Q needs a `GROQ_API_KEY`; Groq's free tier has its own rate limits, in which case the panel shows a retry message. Answers come from a general-purpose model, not from AWS.
- CloudShell is a simulation of a handful of read-only commands, not a real shell. Services other than Route 53 in the Services menu open an "not available" notice.
- Hosted-zone search uses a text filter plus a type dropdown rather than the console's property filter.
- Only a mock list of 22 countries is offered for geolocation.
