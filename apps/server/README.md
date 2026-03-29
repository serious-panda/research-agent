# apps/server

AdonisJS v6 TypeScript service that acts as the single backend entry point for the research agent monorepo. All browser-facing traffic flows through this service — it handles user auth and proxies API calls to the internal Python agent.

## Purpose

The browser never talks directly to the Python agent-api. This service sits in between and is responsible for:

- **Auth** — registration, login, logout, session validation via opaque access tokens
- **Research proxy** — forwards SSE-streaming requests to agent-api, preserving the stream end-to-end
- **Reports proxy** — forwards report list and detail requests to agent-api

This keeps the Python agent fully internal (no host port, no CORS) and gives a single place to enforce authentication across all API routes.

## Architecture

```
consumer-web (nginx :3000)
  └── /api/* ──► server :3333
                    ├── POST /api/auth/register
                    ├── POST /api/auth/login
                    ├── DELETE /api/auth/logout      (auth required)
                    ├── GET  /api/auth/me             (auth required)
                    ├── POST /api/research            (SSE proxy, auth required)
                    ├── GET  /api/research/:id        (auth required)
                    ├── GET  /api/reports             (auth required)
                    └── GET  /api/reports/:id         (auth required)
                              │
                        agent-api :8001  (internal)
```

## Key principles

- **Modular monolith** — auth, research proxy, and reports proxy are separate modules inside one process; no inter-service HTTP within this app
- **No business logic** — research and reports modules are pure proxies; all AI logic stays in agent-api
- **Schema isolation** — Lucid migrations run in the `server` PostgreSQL schema, leaving `public` (LangGraph) and `agent` (checkpoints) untouched
- **Token auth** — opaque access tokens via `@adonisjs/auth`; hash stored in DB, plaintext returned once on login/register

## Layout

```
app/
├── modules/
│   ├── auth/
│   │   ├── controllers/   access_token, new_account, profile
│   │   ├── models/        user.ts
│   │   ├── validators/    user.ts (VineJS)
│   │   └── transformers/  user_transformer.ts
│   ├── research/
│   │   └── controllers/   research_controller.ts (SSE proxy)
│   └── reports/
│       └── controllers/   reports_controller.ts
├── middleware/
│   ├── auth_middleware.ts
│   ├── silent_auth_middleware.ts
│   ├── force_json_response_middleware.ts
│   └── container_bindings_middleware.ts
└── exceptions/
    └── handler.ts
database/
├── migrations/
│   ├── *_create_users_table.ts
│   └── *_create_access_tokens_table.ts
└── schema.ts
providers/
└── api_provider.ts   (serialize() helper — wraps all responses in { data: ... })
start/
└── routes.ts
```

## Environment variables

| Variable | Description |
|---|---|
| `APP_KEY` | AdonisJS encryption key — generate with `node ace generate:key` |
| `DB_HOST` | Postgres host |
| `DB_PORT` | Postgres port |
| `DB_USER` | Postgres user |
| `DB_PASSWORD` | Postgres password |
| `DB_DATABASE` | Postgres database name |
| `AGENT_API_URL` | Internal URL of agent-api (e.g. `http://agent-api:8001`) |
| `PORT` | Listen port (default `3333`) |
| `HOST` | Listen host (default `0.0.0.0`) |

Copy `apps/server/.env.docker` as a starting point for work mode and fill in secrets.

## Work mode (local dev)

Prerequisites: postgres running on localhost:5432 (e.g. `docker compose up postgres`).

```bash
cd apps/server

# First time
cp .env.docker .env          # then set DB_PASSWORD and APP_KEY
node ace generate:key        # paste output into .env as APP_KEY
npm install

# Run migrations
node ace migration:run

# Start with hot reload
npm run dev                  # http://localhost:3333
```

## Other useful commands

```bash
node ace migration:rollback  # roll back last batch
node ace migration:status    # show pending / applied migrations
node ace make:migration      # scaffold a new migration file
npm run typecheck            # tsc --noEmit
npm run lint                 # eslint
npm run build                # compile to build/
```

## Docker

The Dockerfile is a two-stage build. The container runs migrations then starts the server:

```
node ace migration:run --force && node bin/server.js
```

Built and wired by `docker compose up --build` from the repo root. No manual steps needed in Docker mode.

## Response format

All endpoints return JSON wrapped in a `data` envelope via the custom `ApiSerializer`:

```json
{ "data": { ... } }
```

The `serialize()` helper injected into `HttpContext` by `providers/api_provider.ts` handles this automatically. Controllers call `return serialize(payload)` — no manual wrapping needed.
