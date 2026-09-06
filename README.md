# Aiman — Portfolio API

Independent Node.js API for the DevOps portfolio, prepared for its own GitHub repository and VPS deployment. It serves a curated catalog of public GitHub projects with no runtime GitHub token and no external npm dependencies. The existing `my-portfolio` and `my-portfolio-api` projects are excluded.

## Local development

Requires Node.js 24:

```sh
cp .env.example .env
npm run dev
```

API: http://localhost:4000. Health: http://localhost:4000/healthz. The frontend is a separate repository and should set `apiUrl` in its `public/config.json` to this API's HTTPS origin. For local development it uses `VITE_API_URL` in `.env`.

## Endpoints

| Method | Path | Response |
| --- | --- | --- |
| GET / HEAD | `/healthz` | Health and process uptime |
| GET / HEAD | `/api/profile` | Public profile |
| GET / HEAD | `/api/projects` | Project catalog; optional `q` and `category` filters |
| GET / HEAD | `/api/projects/:id` | One project |

Example: `/api/projects?category=Automation&q=smtp`.

## Configuration

Copy `.env.example` to `.env` and set:

- `PORT`: local listening port, default `4000`.
- `HOST`: listening address, default `0.0.0.0`.
- `CORS_ORIGINS`: comma-separated exact frontend origins, without trailing slashes.
- `RATE_LIMIT`: requests per minute per socket peer, default `120`.
- `API_DOMAIN`: API hostname used by Caddy in production.

The API includes method restrictions, CORS preflight, JSON errors, security headers, cache headers, rate limiting, structured request logs, timeouts, and graceful shutdown. CORS controls browser access, not authentication; all catalog data is intentionally public. Behind Caddy, clients share a rate-limit bucket because the limiter uses the proxy socket address rather than trusting forwarded headers. Tune the limit for expected total traffic. Buckets are in memory and reset on restart.

## VPS deployment with Docker

Install Docker and its Compose plugin. Point your API hostname at the VPS. Allow inbound ports 80 and 443 for Caddy's automatic TLS certificate provisioning and HTTPS service.

```sh
cp .env.example .env
# Set API_DOMAIN=api.your-domain.com
# Set CORS_ORIGINS=https://your-portfolio-domain.com
docker compose -f compose.production.yml config --quiet
docker compose -f compose.production.yml up -d --build
docker compose -f compose.production.yml logs -f api
curl https://api.your-domain.com/healthz
```

`compose.production.yml` runs the API and Caddy. The API uses a non-root account, read-only filesystem, dropped capabilities, resource limits, and health checks. Only the reverse proxy exposes public ports. Caddy certificate data is stored in named volumes. Update with `docker compose -f compose.production.yml up -d --build` after pulling changes. Avoid `down -v` when preserving volume data.

## MySQL — requested Compose file

`docker-compose.yml` contains the requested MySQL 8.0 service, named `my-portfolio-mysql`, exposing `3307:3306`, persisting `/var/lib/mysql`, and enabling `mysql_native_password`.

The file intentionally reads `../.env`, as requested. For a standalone clone, create that file **one directory above this repository** using `.env.mysql.example`:

```sh
# If ../.env already exists, add the MYSQL_* entries manually instead of overwriting it.
cp -n .env.mysql.example ../.env
# Replace the two sample passwords in ../.env.
docker compose --env-file ../.env -f docker-compose.yml config --quiet
docker compose --env-file ../.env -f docker-compose.yml up -d
```

`--env-file ../.env` is required for Compose variable interpolation. The service's `env_file` passes that same file to MySQL. Restrict port 3307 with your VPS firewall when running this configuration remotely. The named volume preserves database data; changing initialization variables does not rotate credentials in an existing database.

**The API currently uses `data/portfolio.json`; MySQL is provisioned but not connected to the API.** No persistence-dependent feature was requested. The database service and production API stack can be started independently. A future database integration will need schema, migrations, and an application database connection.

## Content maintenance

Edit `data/portfolio.json`, rebuild the API container, and copy the catalog to `lib/portfolio.json` in the separate frontend repository to update its offline fallback. Use only public projects you intend to publish. Case studies were reviewed against public READMEs on September 6, 2026.

## Validation

```sh
npm test
docker build -t portfolio-api .
```

Tests cover catalog exclusions, details, search, filtering, HTTP methods, CORS, health, and rate limiting. GitHub Actions runs the API tests and Docker build. CI does not deploy automatically.

## Backend-managed skills

The About page fetches `GET /api/skills` from the API on page load. Add or edit entries in the API repository's `data/portfolio.json` under `skills`:

```json
{ "name": "Docker", "category": "Containers", "description": "Describe your actual experience here." }
```

In local watch mode, restart the API after changing the JSON file (Node's watcher may not watch files read using `readFile`). In production, rebuild/restart the API with `docker compose -f compose.production.yml up -d --build`. Reload the frontend page to see changes. No frontend rebuild is required for live skills updates. The bundled frontend snapshot is only used if the API cannot be reached; copy the catalog to the frontend and rebuild only when you also want to refresh that offline fallback. There is no admin editor or database connection yet.
