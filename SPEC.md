## Technical Specification (WorldView-Arango)

### **0) Scope and guiding constraints**
- **Viewport-first**: the map must only request and render data relevant to the current camera region and LOD.
- **Hot path isolation**: viewport queries must not depend on graph traversals.
- **Bounded storage**: historical telemetry must expire via TTL.
- **Composable ingestion**: multiple sources (OpenSky/ADS-B, CelesTrak/Space-Track, events feeds) plug into the same normalized model.

---

### **1) Technology selection**
#### **Frontend**
- **Next.js (TypeScript)**: UI shell and app framework.
- **CesiumJS**: 3D globe + time-dynamic visualization.
- **TailwindCSS**: styling and UI layout.
- **TanStack Query**: polling, caching, request dedupe.

#### **Backend**
- **Node.js (TypeScript) + Fastify**: JSON APIs now, websocket/SSE later.
- **ArangoDB JS driver**: `arangojs`.

#### **Ingestion**
- **Satellites**: `satellite.js` (TLE propagation in JS/TS).
- **Aircraft**: OpenSky REST (MVP) with optional ADS-B Exchange integration (keys).
- **Scheduling**: cron for periodic fetch + long-running poller for live updates.

#### **Database**
- **ArangoDB 3.12.x** (Docker local): multi-model (document + geo + graph), AQL, TTL indexes.

---

### **2) Local Docker (ArangoDB)**
Your machine currently has other Arango containers bound to host port `28529`. This project uses:
- **Host port**: `48529`
- **Container port**: `8529`

Operational expectations:
- A single `docker compose up -d` should bring Arango up.
- Data persists via named volume.
- Root password and DB name come from `.env`.

---

### **3) ArangoDB physical model**
#### **Database name**
Recommended: `worldview` (configurable via env)

#### **Collections**
Use lowercase to avoid surprises across tooling.

1) **`assets`** (document)
- **_key**: stable identifier, prefixed by type
  - aircraft: `aircraft_<icao24>`
  - satellite: `sat_<noradId>`
- **Fields**:
  - `type`: `"aircraft" | "satellite" | "facility" | "event_source"`
  - `name?`, `callsign?`, `icao24?`, `noradId?`
  - `operator?`, `country?`, `tags?`: `string[]`
  - `createdAt`, `updatedAt` (epoch millis)

2) **`telemetry_latest`** (document) — **viewport hot path**
- **Purpose**: one “current position” record per asset for fast geo queries
- **Fields**:
  - `assetKey` (matches `assets._key`)
  - `type` (duplicate for filtering without joining)
  - `ts` (epoch millis)
  - `geometry`: GeoJSON Point `{ type: "Point", coordinates: [lng, lat] }`
  - `altitudeM?`, `velocityMS?`, `headingDeg?`
  - `source` (e.g., `opensky`, `adsbx`, `tle`)

3) **`telemetry_points`** (document) — **rolling history (TTL)**
- **Purpose**: trails and time scrubbing; storage-bounded
- **Fields**:
  - `assetKey`, `type`, `ts`, `geometry`
  - optional kinematics
  - `source`

4) **`events`** (document)
- **Fields**:
  - `kind` (string enum; e.g., `gps_jamming`, `airspace_closure`, `strike`, `action_us`, `action_iran`)
  - `tsStart`, `tsEnd?`
  - `title`, `summary?`, `url?`, `source`
  - `geometry` (GeoJSON Point/Polygon)
  - `severity?` (0..1 or 0..100; for heat/tiles)
  - `meta?` (free-form object; e.g., tile id, bands, attribution)
  - `confidence?` (0..1), `tags?`

5) **`relations`** (edge) (optional for MVP, recommended for V1)
- **Purpose**: connect assets ↔ events, assets ↔ assets
- **Fields**:
  - `_from`, `_to`
  - `type` (e.g., `near`, `mentioned_in`, `same_operator`)
  - `ts?`, `weight?`, `meta?`

---

### **4) Index strategy**
#### **`telemetry_latest`**
- **Geo index**: `geometry`
- **Persistent**: `ts`
- **Persistent**: `type`
- **Unique**: `assetKey` (only if you don’t use it as `_key`)

#### **`telemetry_points`**
- **Persistent**: `[assetKey, ts]`
- **TTL**: `ts` with `expireAfter` (recommend starting at **24h**, then tune)

#### **`events`**
- **Geo index**: `geometry`
- **Persistent**: `tsStart`
- **Persistent**: `kind`

#### **`assets`**
- Optional **ArangoSearch view** for search across `name`, `callsign`, `operator`.

---

### **5) API design**
#### **GET `/health`**
- Returns `{ ok: true, arango: { ok: true } }` plus versions if needed.

#### **POST `/viewport/query`**
Returns “things currently in view” (latest positions + metadata).
- **Request**:
  - `bbox`: `[west, south, east, north]` (degrees)
  - `types`: `string[]` (e.g., `["aircraft","satellite"]`)
  - `minTs?`: epoch millis (optional freshness)
  - `limit?`: number (default 2000; enforce server max)
- **Response**:
  - `items`: `{ asset: Asset, telemetry: TelemetryLatest }[]`

#### **V1: POST `/viewport/snapshot` (time slider)**
Returns the “state of the map” at a specific time \(t\) (playback mode).
- **Request**:
  - `bbox`: `[west, south, east, north]`
  - `types`: `["aircraft","satellite","vessel"]` (extensible)
  - `atTs`: epoch millis (the scrubber time)
  - `windowMs?`: how far back to search for last-known positions (default 10m)
  - `limit?`: cap total returned entities (default 2000)
- **Response**:
  - `items`: `{ asset, telemetryAt }[]` where `telemetryAt.ts <= atTs` and is the nearest sample within `windowMs`

#### **V1: GET `/timeline/range`**
Returns min/max timestamps available for playback per layer/source (so the UI can bound the slider).

#### **GET `/assets/:assetKey`**
- Returns asset doc + latest telemetry.

#### **GET `/assets/:assetKey/trail?sinceTs=...&limit=...`**
- Returns `telemetry_points` for drawing trail/polyline.

#### **POST `/events/query`**
- Request: `bbox` + `tsStart/tsEnd`
- Response: events in region/time.

#### **V1: POST `/events/query` additions**
- Add optional filters:
  - `kinds?: string[]` (e.g., `["gps_jamming"]`)
  - `minSeverity?: number`

---

### **6) AQL patterns (optimized)**
Key rule: **viewport reads from `telemetry_latest`**, then joins to `assets`.

#### **Viewport query**

```aql
LET poly = GEO_POLYGON([
  [[@west, @south], [@east, @south], [@east, @north], [@west, @north], [@west, @south]]
])

FOR t IN telemetry_latest
  FILTER t.ts >= @minTs
  FILTER t.type IN @types
  FILTER GEO_INTERSECTS(t.geometry, poly)
  LET a = DOCUMENT("assets", t.assetKey)
  FILTER a != null
  LIMIT @limit
  RETURN { asset: a, telemetry: t }
```

#### **Trail**

```aql
FOR p IN telemetry_points
  FILTER p.assetKey == @assetKey
  FILTER p.ts >= @sinceTs
  SORT p.ts ASC
  LIMIT @limit
  RETURN p
```

#### **Events in view**

```aql
LET poly = GEO_POLYGON([
  [[@west, @south], [@east, @south], [@east, @north], [@west, @north], [@west, @south]]
])

FOR e IN events
  FILTER @kinds == null || LENGTH(@kinds) == 0 || e.kind IN @kinds
  FILTER e.tsStart <= @tsEnd
  FILTER (e.tsEnd == null || e.tsEnd >= @tsStart)
  FILTER GEO_INTERSECTS(e.geometry, poly)
  SORT e.tsStart DESC
  LIMIT @limit
  RETURN e
```

#### **V1: Viewport snapshot at time \(t\) (time slider hot path)**
This is the core query for playback mode: for each asset within the viewport and time window, return its most recent position at or before `@atTs`.

```aql
LET poly = GEO_POLYGON([
  [[@west, @south], [@east, @south], [@east, @north], [@west, @north], [@west, @south]]
])
LET since = @atTs - @windowMs

FOR p IN telemetry_points
  FILTER p.ts <= @atTs
  FILTER p.ts >= since
  FILTER p.type IN @types
  FILTER GEO_INTERSECTS(p.geometry, poly)
  COLLECT assetKey = p.assetKey AGGREGATE maxTs = MAX(p.ts)
  LET point = FIRST(
    FOR p2 IN telemetry_points
      FILTER p2.assetKey == assetKey
      FILTER p2.ts == maxTs
      LIMIT 1
      RETURN p2
  )
  LET a = DOCUMENT("assets", assetKey)
  FILTER a != null
  LIMIT @limit
  RETURN { asset: a, telemetryAt: point }
```

Notes:
- This relies on the `[assetKey, ts]` index for the `p2` lookup.
- If performance becomes an issue at larger scales, introduce a derived collection (e.g. `telemetry_buckets`) keyed by `assetKey + minuteBucket` to speed “state at time” queries.

---

### **7) Ingestion pipelines**
#### **Aircraft (OpenSky)**
- Poll cadence: start conservative (e.g., 10–15s) and tune.
- Normalization:
  - `assets` upsert keyed by `icao24`
  - `telemetry_latest` upsert keyed by `assetKey`
  - `telemetry_points` insert for history (optionally sample to reduce volume)

#### **Satellites (CelesTrak TLE)**
- Fetch TLE list periodically (e.g., 12h).
- For each satellite:
  - Upsert `assets` by `noradId`
  - Update `telemetry_latest` at a fixed tick (e.g., 10–30s)
  - Optionally generate predicted samples for next 90m into `telemetry_points` (TTL handles expiration)

#### **Events**
- MVP: accept manual JSON import; later add feed ingestion and geocoding.

#### **V1: GPS jamming tiles**
- Store jamming as `events` documents with:
  - `kind = "gps_jamming"`
  - `geometry` as a tile polygon (or rectangle polygon) in WGS84
  - `tsStart/tsEnd` time bounds
  - `severity` and `meta` for attribution/band/source
- First ingestion path: manual import JSON → normalize → insert/upsert into `events`.

---

### **8) Frontend implementation (Cesium)**
#### **Viewport requests**
- On camera move end (debounced), compute bbox.
- Call `/viewport/query` with types + freshness bound.

#### **Rendering strategy**
- Use Cesium `EntityCluster` or custom clustering at high densities.
- Keep a map of `entityId → Entity` and update positions rather than recreating.
- Trails fetched only for selected assets to limit bandwidth.

#### **Time (“4D”)**
- MVP: client-side trail playback for selected asset.
- V1:
  - **Time slider UI**: scrubber + play/pause + speed.
  - **Playback queries**: call `/viewport/snapshot` as `atTs` changes (debounced).
  - **Optional CZML**: once stable, emit CZML for smooth interpolation and Cesium clock integration.

#### **V1: GPS jamming tiles overlay**
- Fetch with `/events/query` filtered to `kinds=["gps_jamming"]` and the current time window.
- Render:
  - `PolygonGraphics` for tile polygons with a severity color ramp
  - legend + toggles + hover inspect

---

### **9) Milestone plan**
#### **Milestone 0: Infra**
- Docker Compose ArangoDB (host `48529`)
- Bootstrap DB/collections/indexes

#### **Milestone 1: Backend**
- Fastify API skeleton
- Implement `/health`, `/viewport/query`

#### **Milestone 2: Aircraft ingestion**
- OpenSky poller
- Upsert `assets` + `telemetry_latest`

#### **Milestone 3: Frontend MVP**
- Cesium globe
- Layer toggles + viewport rendering loop

#### **Milestone 4: Trails**
- Insert to `telemetry_points` + TTL
- Asset inspector + trail polyline

#### **Milestone 5: Satellites**
- TLE ingestion + propagation
- Satellite overlay + predicted track

#### **Milestone 6: Events**
- events import + `/events/query`
- overlay + time filtering

