# WorldView-Arango

A browser-based 3D globe "command center" that fuses real-time open data — aircraft (OpenSky), satellites (CelesTrak TLEs), and events — into an interactive 4D map powered by ArangoDB.

> **Status: experimental / demo.** Built to explore ArangoDB as a backing store for real-time geospatial fusion. Live feeds today are **aircraft (OpenSky ADS-B)** and **satellites (CelesTrak TLEs)** propagated with SGP4. Other overlays — GPS jamming tiles, country actions, strikes, airspace closures, maritime vessels — use **synthetic seed data** via `/demo/*` and `/events/seed-demo-*` endpoints. The default camera and demo scenario are centred on **Iran / Persian Gulf**.

## Features

- **Cesium/Resium 3D globe** with viewport-driven loading (the client only fetches what's in the camera frustum).
- **LIVE mode**: real-time aircraft (OpenSky) and satellites (CelesTrak TLEs, SGP4-propagated), refreshed every 5s.
- **PLAYBACK mode**: time-slider scrubber with 1×/5×/15×/60× speeds, backed by per-minute bucketed telemetry.
- **Trails**: recent path for the selected asset plus an optional "tracks" layer showing trails for up to 200 assets in view.
- **Event overlays**: GPS jamming hex tiles, US/Iran actions, strikes, airspace-closure polygons (rendered as a 3D no-fly "fence" using the Iran country boundary).
- **Timeline strip**: marker strip under the playback slider; click a marker to jump to that time and fly the camera to the event.
- **Asset inspector**: click any aircraft/satellite/vessel for metadata + recent trail.
- **Demo-data buttons** in the UI for seeding GPS jamming, aircraft, actions, and vessels when live feeds are quiet or rate-limited.

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  Next.js +  │────▶│  Fastify API │────▶│  ArangoDB   │
│  Cesium/    │     │              │◀────│  3.12       │
│  Resium     │     └──────────────┘     └─────────────┘
└─────────────┘              ▲
                             │
                    ┌──────────────┐
                    │  Ingest      │
                    │  Service     │
                    │  (OpenSky +  │
                    │   CelesTrak) │
                    └──────────────┘
```

This is an **npm workspaces** monorepo:

| Workspace | Path | Description |
|-----------|------|-------------|
| **Web** | `apps/web` | Next.js 16 + React 19 + Cesium/Resium globe UI |
| **API** | `services/api` | Fastify 5 REST API (viewport, snapshot, tracks, events, demo seeds) |
| **Ingest** | `services/ingest` | Polling service for OpenSky aircraft + CelesTrak satellite data |
| **Shared** | `packages/shared` | Shared TypeScript types (`Asset`, `Telemetry`, `ViewportQuery`) |

### Project structure

```
arango-worldview/
├── apps/
│   └── web/                      # Next.js + Cesium/Resium UI
│       ├── src/app/
│       │   ├── components/
│       │   │   ├── WorldViewApp.tsx     # Main globe + controls
│       │   │   └── ViewportTracker.tsx  # Camera → bbox reporter
│       │   └── layout.tsx / page.tsx / providers.tsx
│       ├── src/data/boundaries/IRN.geo.json   # Iran country polygon
│       ├── src/lib/{api,cesiumBaseUrl}.ts
│       └── scripts/copy-cesium-assets.mjs     # Postinstall Cesium copy
├── services/
│   ├── api/src/                  # Fastify routes, Arango queries
│   │   └── routes.ts             # /viewport/*, /events/*, /demo/*, /assets/*
│   └── ingest/src/               # Polling workers
│       ├── opensky.ts            # Aircraft
│       └── celestrak.ts          # Satellite TLEs + SGP4
├── packages/shared/src/index.ts  # Shared types
├── docker-compose.yml            # ArangoDB 3.12
├── PRD.md / SPEC.md              # Original product + technical specs
└── IMPLEMENTATION_PLAN.md        # Build plan
```

## Tech stack

- **Frontend**: Next.js 16, React 19, Cesium + Resium, TanStack React Query, Tailwind CSS 4
- **API**: Fastify 5, Zod validation, arangojs 10
- **Ingest**: Node.js + tsx, satellite.js (SGP4 propagation), arangojs
- **Database**: ArangoDB 3.12 (Docker)
- **Monorepo**: npm workspaces, concurrently

## Prerequisites

- **Node.js** `^20.19.0 || ^22.12.0 || >=24.0.0` (Next.js 16 / React 19 requirement)
- **Docker** (for ArangoDB)
- *Optional*: an OpenSky Network account — unauthenticated requests are heavily rate-limited. The ingest service works without one, just less reliably.

## Getting Started

### 1. Clone and install

```bash
git clone https://github.com/ArthurKeen/arango-worldview.git
cd arango-worldview
npm install
```

The `postinstall` hook in `apps/web` copies Cesium static assets into `apps/web/public/cesium/` (~22 MB, regenerated on every install, gitignored).

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and set at least `ARANGO_ROOT_PASSWORD`. Defaults:

| Variable | Default | Purpose |
|---|---|---|
| `ARANGO_HOST_PORT` | `48529` | Host port mapped to container `8529` |
| `ARANGO_ROOT_PASSWORD` | *(required)* | Root password for the Docker Arango |
| `ARANGO_DB_NAME` | `worldview` | Database the app creates/uses |
| `API_PORT` | `8080` | Fastify API port |
| `INGEST_TICK_MS` | `15000` | Polling interval for OpenSky + CelesTrak |
| `OPENSKY_USERNAME` | *(unset)* | Optional OpenSky account (see [API keys](#api-keys--credentials)) |
| `OPENSKY_PASSWORD` | *(unset)* | Optional OpenSky account password |
| `OPENSKY_BBOX` | *(unset)* | Optional `west,south,east,north` to limit ingest payload |
| `CELESTRAK_TLE_URL` | `.../GROUP=active&FORMAT=tle` | Override to fetch a different satellite group |
| `SATELLITE_LIMIT` | `200` | Max satellites ingested per CelesTrak snapshot |

### API keys & credentials

**Short version: no paid API keys are required.** The only optional credential is a free OpenSky Network account.

| Service | Required? | What you need | Why |
|---|---|---|---|
| **OpenSky Network** (aircraft / ADS-B) | *Optional but recommended* | Free account — username + password in `OPENSKY_USERNAME` / `OPENSKY_PASSWORD` | Anonymous requests work but are heavily rate-limited (you will see `429 Too Many Requests` during development). A free account gives you a far more usable quota. Register at [opensky-network.org](https://opensky-network.org/). The ingest service uses HTTP Basic auth; OpenSky is migrating to OAuth2 client-credentials, but legacy Basic still works for existing accounts. |
| **CelesTrak** (satellite TLEs) | No | — | Public, no key. Honor their [fair-use policy](https://celestrak.org/webmaster.php#usage) (don't hammer it; `INGEST_TICK_MS=15000` is fine). |
| **Esri World Imagery / Boundaries** (base map) | No | — | Used via public ArcGIS tile URLs with attribution (`Tiles © Esri`) already wired in. For heavy or production use, review [Esri's terms](https://www.esri.com/en-us/legal/terms/full-master-agreement) and consider your own imagery provider. |
| **ArangoDB** | *Required (local)* | `ARANGO_ROOT_PASSWORD` in `.env` | Not a third-party key — just the local Docker root password. |
| **satellite.js** (SGP4 propagation) | No | — | Bundled npm library, no external service calls. |

There are **no keys needed** for GPS jamming, actions, strikes, airspace closures, or vessels — those overlays all use synthetic seed data today.

### 3. Start ArangoDB

```bash
docker compose up -d
```

This launches ArangoDB 3.12 on `http://localhost:48529` (configurable via `ARANGO_HOST_PORT`). Default credentials: `root` / `$ARANGO_ROOT_PASSWORD`.

### 4. Run the full stack

```bash
npm run dev
```

Starts all three services concurrently:

| Service | URL | Color |
|---------|-----|-------|
| API | `http://localhost:8080` | blue |
| Ingest | _(background polling)_ | magenta |
| Web | `http://localhost:3000` | green |

Or run services individually:

```bash
npm run dev:api      # API only
npm run dev:ingest   # Ingest only
npm run dev:web      # Web only
```

### 5. Seed demo data (optional, recommended)

Once the app is running at `http://localhost:3000`, use the **Demo data** buttons in the left panel, or hit the API directly:

```bash
curl -XPOST http://localhost:8080/events/seed-demo-gps-jamming
curl -XPOST http://localhost:8080/demo/seed-aircraft
curl -XPOST http://localhost:8080/events/seed-demo-actions
curl -XPOST http://localhost:8080/demo/seed-vessels
```

These seed idempotent synthetic data around the default Iran/Persian Gulf viewpoint so you can try playback and overlays immediately without waiting for live feeds.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start all services in parallel |
| `npm run dev:api` | Start the Fastify API |
| `npm run dev:ingest` | Start the ingest polling service |
| `npm run dev:web` | Start the Next.js dev server |
| `npm run build` | Build all workspaces |
| `npm run lint` | Lint all workspaces |

## API

All endpoints live on `http://localhost:${API_PORT}` (default `8080`).

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Liveness check |
| `POST` | `/viewport/query` | Latest telemetry within a bbox, by asset type. **LIVE mode.** |
| `POST` | `/viewport/snapshot` | Reconstruct state-at-time `t` within a bbox. **PLAYBACK mode.** |
| `POST` | `/viewport/tracks` | Bulk-fetch recent tracks for a list of `assetKey`s (trails layer) |
| `GET`  | `/timeline/range` | Min/max timestamps available for playback + events |
| `GET`  | `/assets/:assetKey` | Asset metadata + latest telemetry |
| `GET`  | `/assets/:assetKey/trail` | Historical telemetry points for one asset |
| `POST` | `/events/query` | Events within a bbox + time window, filter by `kinds` and `minSeverity` |
| `POST` | `/events/seed-demo-gps-jamming` | Seed GPS jamming hex tiles (demo) |
| `POST` | `/events/seed-demo-actions` | Seed US/Iran actions, strikes, Iran airspace closure (demo) |
| `POST` | `/demo/seed-aircraft` | Seed 3 demo aircraft tracks (demo) |
| `POST` | `/demo/seed-vessels` | Seed AIS-like vessel tracks (demo) |

Request/response shapes live in `packages/shared/src/index.ts` and route handlers in `services/api/src/routes.ts`. All request bodies are Zod-validated.

## Data sources

- **Aircraft** — [OpenSky Network](https://opensky-network.org/): live ADS-B positions (free tier, rate-limited).
- **Satellites** — [CelesTrak](https://celestrak.org/): TLE orbital elements, propagated with SGP4 via [satellite.js](https://github.com/shashwatak/satellite.js).
- **Country boundaries** — Natural Earth (`IRN.geo.json` for the Iran airspace overlay).
- **GPS jamming, actions, strikes, vessels** — synthetic demo data generated by `/events/seed-demo-*` and `/demo/seed-*`. Not live feeds.

## Troubleshooting

- **Port `48529` already in use.** Set `ARANGO_HOST_PORT` to a free port in `.env` before `docker compose up -d`.
- **OpenSky `429 Too Many Requests`.** The free tier is strict. Set `OPENSKY_BBOX` to a smaller region, increase `INGEST_TICK_MS`, or rely on `/demo/seed-aircraft` for local development.
- **"No telemetry history yet" in Playback mode.** The playback slider reads from `telemetry_buckets`, which needs ~30–60s of ingest to populate. Click **Seed aircraft** / **Seed vessels** to get an instant history window.
- **Cesium widgets / tiles not loading.** Re-run `npm install` inside `apps/web` to trigger the Cesium asset copy (`postinstall`), or run `node apps/web/scripts/copy-cesium-assets.mjs` directly.
- **Docker healthcheck unhealthy.** The healthcheck uses `$ARANGO_ROOT_PASSWORD` — verify it matches between the container and `.env`.

## Related documentation

- [`PRD.md`](./PRD.md) — original Product Requirements Document (with current-state annotations).
- [`SPEC.md`](./SPEC.md) — technical specification.
- [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md) — build-order plan.
- [`substack-article.md`](./substack-article.md) — long-form write-up.

## License

ISC — see [`LICENSE`](./LICENSE).
