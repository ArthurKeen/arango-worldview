## Sub-agent prompt (implementation)

You are an autonomous coding agent implementing **WorldView-Arango** in the repo at the workspace root.

### **Your goal**
Implement the MVP described in `PRD.md` and the architecture/DB model in `SPEC.md`, with an ArangoDB-first design that keeps viewport queries fast via `telemetry_latest`.

### **Hard constraints**
- Use **Docker Compose** ArangoDB from `docker-compose.yml`.
- **Do not bind to host port `28529`** (it is already used by other local Arango containers).
- **Do not bind to host port `38529`** (it is already used by another local Arango container: `nasic`).
- Default Arango host port for this project is **`48529`** (container `8529` → host `48529`).
- Do not commit secrets. Use `.env` (copy from `.env.example`).
- Optimize viewport queries to avoid per-point graph traversals (viewport reads from `telemetry_latest`).
- Implement storage-bounding for telemetry history using **TTL** (per `SPEC.md`).

### **Recommended technology (use unless blocked)**
- **Frontend**: Next.js (TypeScript) + CesiumJS + TailwindCSS + TanStack Query
- **Backend**: Fastify (TypeScript) + `arangojs`
- **Ingestion**: TypeScript workers
  - Aircraft: OpenSky
  - Satellites: CelesTrak TLE + `satellite.js`

### **Repo structure (create if missing)**
Use a small monorepo so API + ingestion + frontend can share types.

```
.
├─ apps/
│  └─ web/                     # Next.js + Cesium
├─ services/
│  ├─ api/                     # Fastify API
│  └─ ingest/                  # ingestion workers (OpenSky, TLE)
├─ packages/
│  └─ shared/                  # shared TS types/utilities
├─ docker-compose.yml
├─ .env.example
├─ PRD.md
└─ SPEC.md
```

### **Environment variables**
Use `.env` (not committed). At minimum:
- `ARANGO_HOST_PORT=48529` (or another free port; never `28529` or `38529`)
- `ARANGO_ROOT_PASSWORD=...`
- `ARANGO_DB_NAME=worldview`
- `ARANGO_URL=http://localhost:${ARANGO_HOST_PORT}` (or build from host/port)

### **Deliverables**
1) **Local infra works**
- `docker compose up -d` starts ArangoDB.
- Document the URL `http://localhost:48529`.

2) **Backend API**
- Implement endpoints (matching `SPEC.md`):
  - `GET /health`
  - `POST /viewport/query`
  - `GET /assets/:assetKey`
  - `GET /assets/:assetKey/trail`
  - `POST /events/query`
- Implement idempotent DB bootstrap creating:
  - collections: `assets`, `telemetry_latest`, `telemetry_points`, `events` (and `relations` optional)
  - indexes: geo + persistent + TTL as specified

- **Hot-path requirement**:
  - `/viewport/query` must query `telemetry_latest` first, then join to `assets` by key. Do not require traversals for viewport rendering.

3) **Ingestion**
- Aircraft ingestion: poll OpenSky, upsert `assets` + `telemetry_latest`, insert sampled `telemetry_points` (TTL bounded).
- Satellite ingestion: fetch TLE, upsert satellite `assets`, update `telemetry_latest` on a timer; optionally write predicted samples.

4) **Frontend MVP**
- Cesium globe with layer toggles.
- Debounced camera move → compute bbox → call `/viewport/query`.
- Render aircraft/satellites as entities, update in place (no flicker).
- Click asset → inspector + trail polyline.

### **Acceptance criteria**
- Viewport query returns items for dense regions without UI freezing.
- Storage remains bounded via TTL on `telemetry_points`.
- Ports do not conflict with other Arango containers (no usage of `28529`).

- **MVP demo flow works end-to-end**:
  - Start Arango + backend + ingestion + web app
  - Pan/zoom → markers appear
  - Click marker → inspector loads + trail renders

### **Implementation approach (work in this order)**
- Bring up Arango via Docker Compose and verify connectivity.
- Implement backend with DB bootstrap first; add `/health` then `/viewport/query`.
- Add ingestion writing to the DB; validate via simple counts in Arango (and spot-check in UI).
- Implement frontend that renders viewport results.
- Add trails + inspector.

### **Definition of done**
- `docker compose up -d` works and Arango is reachable on host port `48529` (or configured port).
- Backend starts and passes `/health`.
- Ingestion populates `assets` + `telemetry_latest` continuously.
- Web app renders viewport results and does not flicker on refresh.
- Trails use `telemetry_points` and remain bounded via TTL.

