## Implementation plan (ArangoDB-first)

This plan is written to match the updated `PRD.md` and `SPEC.md`, and to keep the viewport query fast by centering it on `telemetry_latest`.

### **0) Local environment**
- **Create `.env`**:
  - Copy `.env.example` → `.env`
  - Set `ARANGO_ROOT_PASSWORD`
  - Keep `ARANGO_HOST_PORT=48529` (or pick another free port; do not use `28529` or `38529`)

- **Start ArangoDB**:

```bash
docker compose up -d
```

- **Verify**:
  - UI/API base should be reachable at `http://localhost:48529`

---

### **1) Repo layout (recommended)**
Use a small monorepo so web + API + ingestion share types.

```
.
├─ apps/
│  └─ web/                 # Next.js + CesiumJS
├─ services/
│  ├─ api/                 # Fastify JSON API
│  └─ ingest/              # workers (OpenSky, TLE)
├─ packages/
│  └─ shared/              # shared TS types + utilities
├─ docker-compose.yml
├─ PRD.md
├─ SPEC.md
└─ .env
```

Package manager: **pnpm** (fast, monorepo-friendly).

---

### **2) Database bootstrap**
Goal: create the `worldview` database, collections, and indexes described in `SPEC.md`.

Deliverables:
- `services/api/src/db/bootstrap.ts` (idempotent)
  - creates database `ARANGO_DB_NAME` if missing
  - creates collections: `assets`, `telemetry_latest`, `telemetry_points`, `events`, `relations` (optional)
  - creates indexes:
    - `telemetry_latest.geometry` geo
    - `telemetry_latest.ts`, `telemetry_latest.type` persistent
    - `telemetry_points` persistent `[assetKey, ts]`
    - `telemetry_points` TTL on `ts` (start at 24h retention)
    - `events.geometry` geo, `events.tsStart` persistent

Acceptance:
- Running bootstrap multiple times does not error and does not duplicate indexes.

---

### **3) Backend API (Fastify)**
Goal: expose the core contracts so the frontend can be viewport-driven.

Endpoints:
- `GET /health`
- `POST /viewport/query`
- `GET /assets/:assetKey`
- `GET /assets/:assetKey/trail?sinceTs=...&limit=...`
- `POST /events/query`

Implementation notes:
- Validate inputs (bbox ranges, limits).
- Convert bbox → AQL polygon.
- Always query from `telemetry_latest` for viewport.
- Keep joins cheap:
  - `LET a = DOCUMENT("assets", t.assetKey)` is acceptable when paired with a tight geo filter and a reasonable limit.

Acceptance:
- Viewport query returns within a few hundred ms on moderate density.

---

### **4) Ingestion services**
Goal: keep `telemetry_latest` fresh and write bounded history into `telemetry_points`.

#### **4A) OpenSky aircraft ingestion (MVP)**
- Poll OpenSky states.
- For each aircraft:
  - Upsert `assets` (`_key = aircraft_<icao24>`)
  - Upsert `telemetry_latest` (`assetKey`, `type="aircraft"`, `ts`, `geometry`, etc.)
  - Insert into `telemetry_points` (sampled; e.g., every 10–30s per aircraft) so trails work

Acceptance:
- After a few minutes, viewport query shows aircraft markers in dense regions.

#### **4B) Satellites (TLE)**
- Fetch CelesTrak TLE set on an interval (e.g., 12h).
- For curated satellites:
  - Upsert `assets` (`_key = sat_<noradId>`)
  - Tick propagation every 10–30s:
    - Update `telemetry_latest` (type `satellite`)
  - (Optional) Insert predicted samples (next 90m) into `telemetry_points` with TTL

Acceptance:
- Satellites appear and move smoothly; selecting one shows a predicted path.

---

### **5) Frontend (Next.js + Cesium)**
Goal: a usable globe that stays fast.

#### **5A) Cesium viewer**
- Fullscreen globe view
- Layer toggles: aircraft / satellites / events
- Debounced camera-change handler computes viewport bbox

#### **5B) Rendering loop**
- Call `/viewport/query`
- Create/update entities in-place (do not recreate on every poll)
- Clustering/LOD:
  - enable Cesium clustering when marker count is high

#### **5C) Inspector + trails**
- Click entity → fetch `/assets/:assetKey` and `/trail`
- Render trail polyline

Acceptance:
- Pan/zoom stays interactive; markers update without flicker.

---

### **6) Events overlay (MVP+)**
Goal: place-time context.

Steps:
- Add `events` ingest/import (manual JSON).
- Implement `/events/query` and render markers.
- Optional: create `relations` edges linking assets ↔ events (V1).

---

### **7) Quality + operational guardrails**
- Add rate-limit/backoff to ingestion.
- Add bounded logging (do not spam logs on poll loops).
- Add simple dashboards:
  - ingest freshness (now - latest ts)
  - counts in `telemetry_latest` by type

