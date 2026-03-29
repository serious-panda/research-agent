# PRD: Auth & Application Server

## Overview

Add user authentication and a unified application server to the research agent. A new AdonisJS v6 TypeScript service (`apps/server`) becomes the single backend entry point for all non-AI concerns: user registration and login, JWT-style token auth, and proxying API calls to the existing Python agent. The React consumer UI gains a login page. The Python agent-api remains unchanged and becomes an internal service.

The pattern is a **modular monolith**: all new backend modules (auth, research proxy, reports proxy) live inside one AdonisJS process, sharing the same database connection and request lifecycle — no inter-service HTTP calls within the new backend, no separate containers for each concern.

---

## Goals

1. Users must log in before submitting research questions
2. New users can self-register via a signup form in the UI
3. A single TypeScript backend handles auth and BFF proxying — no new Python services, no new microservices
4. The Python agent-api is fully internal; the browser never communicates with it directly
5. SSE streaming continues to work end-to-end through the new server layer
6. Deployment stays as simple as today: `docker compose up --build`

---

## Non-Goals

- OAuth / social login
- User roles or permissions (all logged-in users have equal access)
- Per-user thread history or report ownership (global data, same as today)
- Password reset / email verification
- HTTPS/TLS (handled upstream, out of scope here)

---

## Architecture

```
Browser
  │  (port 3000)
  ▼
consumer-web  (nginx — unchanged except proxy_pass target)
  └── /api/*  ──►  apps/server  (AdonisJS v6, port 3333)
                       ├── POST /api/auth/register
                       ├── POST /api/auth/login
                       ├── DELETE /api/auth/logout   (auth required)
                       ├── GET  /api/auth/me          (auth required)
                       ├── POST /api/research         (SSE proxy, auth required)
                       ├── GET  /api/research/:id     (auth required)
                       ├── GET  /api/reports          (auth required)
                       └── GET  /api/reports/:id      (auth required)
                              │
                        agent-api:8001  (internal, Python, unchanged)
                              ├── postgres:5432
                              ├── qdrant:6333
                              └── mcp-server:8000
```

### New service: `apps/server`

- **Framework**: AdonisJS v6 (TypeScript, Node 22)
- **Database**: shared `postgres` service — new `users` and `auth_access_tokens` tables alongside existing LangGraph checkpoint tables
- **Auth**: `@adonisjs/auth` access tokens guard — opaque tokens returned on login, stored in browser `localStorage`, sent as `Authorization: Bearer` header
- **SSE proxy**: AdonisJS v6 natively streams a `fetch()` `Response` — no manual piping

### Modified: `apps/consumer-web`

- Nginx: `proxy_pass` target changed from `agent-api:8001` to `server:3333`
- New `LoginPage` component rendered when no valid token in localStorage
- New `SignupPage` component — toggled from the login page
- `useAuth` hook manages token lifecycle (login, logout, register)
- All `fetch()` calls include `Authorization: Bearer` header

### Modified: `apps/agent-api`

- Remove `CORSMiddleware` (no longer browser-facing)
- Remove host port binding in docker-compose

---

## Token Model

AdonisJS opaque access tokens:

- Generated on `POST /api/auth/login`, returned as `{ token: { value: "oat_..." } }`
- Hash stored in `auth_access_tokens` table; plaintext never persisted
- No expiry set (personal project; revoke by deleting row)
- Stored in `localStorage` on the frontend
- Sent as `Authorization: Bearer <value>` on every protected request
- Revoked on logout (row deleted from DB)

---

## New Environment Variables

| Variable | Where used | Notes |
|---|---|---|
| `APP_KEY` | apps/server | AdonisJS encryption key; generate with `node ace generate:key` |
| `AGENT_API_URL` | apps/server | Internal URL of agent-api; `http://agent-api:8001` in Docker |

Existing `POSTGRES_DSN` / `DB_*` variables are reused by apps/server (same postgres instance).

---

## Task Breakdown

| # | Task | Description |
|---|---|---|
| 01 | Scaffold AdonisJS app | `npm init adonisjs`, configure Lucid + auth, folder structure |
| 02 | Auth module | User model, migrations, register/login/logout/me controllers |
| 03 | Research proxy module | SSE-streaming proxy controller + auth middleware |
| 04 | Reports proxy module | Non-streaming proxy for report list and detail |
| 05 | Docker integration | Dockerfile, docker-compose service, migration on startup |
| 06 | Nginx update | Change proxy_pass target in consumer-web nginx.conf |
| 07 | Frontend auth | LoginPage, useAuth hook, auth.ts API, update research.ts |
| 08 | Cleanup | Remove CORS from agent-api, remove agent-api host port |
| 09 | Signup page | SignupPage component, register() in auth.ts, toggle between login and signup |

See `plans/` for detailed implementation instructions per task.
