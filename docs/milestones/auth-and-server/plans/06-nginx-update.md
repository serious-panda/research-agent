# Plan 06: Nginx Update

> Source PRD: `docs/milestones/auth-and-server/prd-auth-and-server.md`

## Context

The consumer-web nginx config currently proxies `/api/*` directly to `agent-api:8001`. Change the proxy target to `server:3333`. The SSE-critical settings (`proxy_buffering off`, `chunked_transfer_encoding on`) stay exactly as they are.

---

## What to build

### `apps/consumer-web/nginx.conf` — one line change

Current:
```nginx
location /api/ {
    proxy_pass http://agent-api:8001/api/;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_buffering off;
    proxy_cache off;
    chunked_transfer_encoding on;
}
```

Updated:
```nginx
location /api/ {
    proxy_pass http://server:3333/api/;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_buffering off;
    proxy_cache off;
    chunked_transfer_encoding on;
}
```

Nothing else in nginx.conf changes.

---

## Verification

```bash
docker compose up --build consumer-web server agent-api

# Test through nginx (port 3000)
TOKEN=$(curl -s -X POST localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@x.com","password":"secret123"}' | jq -r '.token.value')

curl localhost:3000/api/auth/me -H "Authorization: Bearer $TOKEN"
# → { id: 1, email: "test@x.com" }

# SSE through nginx
curl -N -X POST localhost:3000/api/research \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"question":"What is React?"}'
# → SSE events should stream through
```

---

## Files modified

| File | Change |
|---|---|
| `apps/consumer-web/nginx.conf` | `proxy_pass` target: `agent-api:8001` → `server:3333` |
