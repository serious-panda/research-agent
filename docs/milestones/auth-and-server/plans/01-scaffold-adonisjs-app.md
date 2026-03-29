# Plan 01: Scaffold AdonisJS App

> Source PRD: `docs/milestones/auth-and-server/prd-auth-and-server.md`

## Context

Create the `apps/server` AdonisJS v6 application skeleton. This task establishes the folder structure, installs dependencies, and configures the database and auth packages. No business logic is written here — just the foundation for tasks 02–04.

---

## What to build

### 1. Scaffold

From the repo root:

```bash
cd apps
npm init adonisjs@latest server -- --kit=api
cd server
```

The `--kit=api` flag scaffolds without Inertia/Edge (we serve the React SPA separately).

### 2. Install and configure packages

```bash
node ace configure @adonisjs/lucid    # prompts: select postgres
node ace configure @adonisjs/auth     # prompts: select access_tokens guard + lucid provider
```

This generates:
- `config/database.ts` — Lucid database config
- `config/auth.ts` — auth guard config
- `database/migrations/TIMESTAMP_create_auth_access_tokens_table.ts` — generated automatically by auth configure

### 3. Database config (`config/database.ts`)

Update to read from individual `DB_*` env vars (matches docker-compose injection pattern):

```typescript
pg: {
  client: 'pg',
  connection: {
    host: env.get('DB_HOST', 'localhost'),
    port: env.get('DB_PORT', 5432),
    user: env.get('DB_USER', 'research'),
    password: env.get('DB_PASSWORD'),
    database: env.get('DB_DATABASE', 'research'),
  },
  migrations: { naturalSort: true },
}
```

### 4. Env validation (`start/env.ts`)

Add to the existing `Env.create` call:

```typescript
DB_HOST: Env.schema.string(),
DB_PORT: Env.schema.number(),
DB_USER: Env.schema.string(),
DB_PASSWORD: Env.schema.string(),
DB_DATABASE: Env.schema.string(),
AGENT_API_URL: Env.schema.string(),
```

### 5. Folder structure to create manually

AdonisJS scaffolds a flat `app/` directory. Create the module subdirectories:

```
app/
├── auth/
│   ├── controllers/
│   └── models/
├── research/
│   └── controllers/
└── reports/
    └── controllers/
```

### 6. `.env` file

Copy `.env.example` and fill in:

```env
APP_KEY=<output of: node ace generate:key>
DB_HOST=localhost
DB_PORT=5432
DB_USER=research
DB_PASSWORD=<from repo root .env>
DB_DATABASE=research
AGENT_API_URL=http://localhost:8001
```

### 7. Health route

Add to `start/routes.ts`:

```typescript
router.get('/health', async () => ({ status: 'ok' }))
```

---

## Verification

```bash
# Postgres must be running (docker compose up postgres)
node ace migration:run    # should succeed with no errors
node ace serve --watch    # app starts on :3333
curl localhost:3333/health  # → {"status":"ok"}
```

---

## Files created/modified

| File | Action |
|---|---|
| `apps/server/` | Created (full scaffold) |
| `apps/server/config/database.ts` | Modified — DB_* env vars |
| `apps/server/start/env.ts` | Modified — add DB_* + AGENT_API_URL |
| `apps/server/start/routes.ts` | Modified — add /health |
| `apps/server/.env` | Created — local dev values |
| `apps/server/app/auth/`, `research/`, `reports/` | Created (empty dirs) |
