# CLAUDE.md — apps/backoffice

Vite 5 + React 18 + TypeScript stub. Currently a "Coming soon" placeholder; will become the admin UI for managing reports, ingestion jobs, and agent configuration.

## Layout

```
apps/backoffice/
├── src/
│   ├── main.tsx    # React 18 entry point
│   └── App.tsx     # "Coming soon" placeholder — replace when building features
├── vite.config.ts  # Dev server on port 3001; no API proxy (no backend calls yet)
├── nginx.conf      # Static SPA serve only; no /api/ proxy block
└── Dockerfile      # Multi-stage: node build → nginx serve
```

## Dev commands

```bash
npm install
npm run dev      # http://localhost:3001
npm run build    # tsc -b && vite build
```

## Adding features

When adding real pages:
- Add an API proxy in `vite.config.ts` if the backoffice needs to call agent-api
- Update `nginx.conf` to proxy `/api/` to `agent-api:8001` (same pattern as consumer-web, with `proxy_buffering off` for any SSE routes)
- Follow the same hook/component pattern as `apps/consumer-web` for consistency
