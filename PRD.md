## Product Requirements Document (PRD)

### **Project name**
**WorldView-Arango**

### **1) Executive summary**
**Objective**: Build a browser-based 3D globe “command center” that fuses real-time + near-real-time open data (satellites, aircraft, events) into an interactive 4D map.

**Why now**: Photorealistic 3D tiles + commodity WebGL/WebGPU + public OSINT feeds make “spatial intelligence” accessible. The hard part is keeping the UX responsive while ingesting and querying fast-moving data.

**North star**: A user can open a tab, pan/zoom anywhere on Earth, and immediately see:
- **Aircraft** currently in view (position, altitude, velocity, callsign)
- **Satellites** (current position + orbit track)
- **Events** anchored to places and time

### **2) Goals and non-goals**
#### **Goals**
- **Fast, responsive viewport-first UX**: the UI only loads what’s relevant to the camera frustum / bounding region and zoom.
- **Time-aware (“4D”)**: users can scrub recent history for aircraft tracks; satellites show predicted orbit tracks.
- **Multi-domain fusion**: join assets ↔ telemetry ↔ events via ArangoDB graph relationships when valuable.
- **Local-first development**: single-command Docker setup for ArangoDB; clear seeds + migration scripts.

#### **Non-goals (for MVP)**
- Building a full intelligence analysis platform (alerts, workflow, case management).
- Real-time classified / proprietary feeds.
- Large-scale video ingestion or storage (CCTV can be link-outs/embeds; not archival).
- Perfect global coverage (feed availability and rate limits vary).

### **3) Target personas**
- **OSINT analyst / investigator**: correlates movement patterns with real-world events.
- **Geospatial builder**: explores and demos “spatial computing” interfaces and shaders.
- **Curious operator**: wants situational awareness for a region (air traffic, satellites overhead).

### **4) Primary user journeys**
#### **Journey A: “What’s happening here?”**
1. User opens app → globe loads quickly.
2. User navigates to a city → aircraft populate within view.
3. User toggles overlays (aircraft/satellites/events).
4. User clicks an aircraft → inspector shows metadata + recent path.

#### **Journey B: “Track a satellite”**
1. User searches for a satellite by name/NORAD ID.
2. User clicks → orbit track renders (past + predicted).
3. User follows satellite over time (time controls).

#### **Journey C: “Event context”**
1. User enables event overlay.
2. Events appear as geo-anchored markers with time window filters.
3. Clicking an event shows summary + related assets (if any links exist).

### **5) Product scope**
#### **MVP scope (buildable, demo-ready)**
- **Globe**: Cesium viewer with base imagery; optional 3D Tiles integration later.
- **Aircraft overlay**: live positions in viewport + click-to-inspect.
- **Satellites overlay**: curated set (e.g., top 200 from CelesTrak) with predicted track segments.
- **Events overlay (lightweight)**: manual import or a simple feed; geocoded markers.
- **Time controls**:
  - Aircraft: last \(N\) minutes trail (e.g., 30–120m) for selected asset
  - Satellites: predicted orbit polyline for next \(N\) minutes (e.g., 90m)
- **Data persistence**: ArangoDB holds assets + latest telemetry + rolling historical telemetry (TTL).
- **Viewport API**: backend endpoint that returns “what’s in view” efficiently.

#### **V1 scope (expanded demo)**
- **Time slider (4D playback)**: timeline scrubber + playback controls to reconstruct “what the map looked like” at time \(t\).
- **GPS jamming tiles**: time-bounded grid/tiles overlay showing GNSS interference intensity/coverage.
- **Event taxonomy (“actions”)**: structured event types (e.g., US actions, Iranian actions, strikes, airspace closures) with time windows, sources, and confidence.
- **Airspace closures / no-fly zones**: polygon overlays with time bounds.
- **Maritime (AIS) overlay**: vessels as assets with live + historical tracks (same telemetry model).
- **Visual modes**: shader/post-processing toggles (CRT, NVG, FLIR-like palette, cel shading).
- **Saved viewpoints**: bookmarks of camera position + active layers.
- **Improved events**: multiple sources, dedupe, relevance ranking.
- **Streaming updates**: websocket/SSE for near-real-time telemetry refresh.

#### **Stretch**
- **CCTV**: curated public camera links geolocated and projected/attached in the scene (no archival).
- **Infra overlays**: OSM-based infrastructure layers, heatmaps, and flow fields.

### **6) Functional requirements**
- **FR1: Viewport-driven loading**: backend accepts viewport region + zoom/altitude and returns assets within it.
- **FR2: Asset inspection**: click asset → metadata + recent telemetry + related items.
- **FR3: Search**: search by name/callsign/NORAD ID.
- **FR4: Layer toggles**: aircraft / satellites / events independent.
- **FR5: Time window filtering**: filter events and tracks by time range.

### **7) Non-functional requirements**
- **Performance**:
  - First meaningful paint \(<3s\) on a typical dev machine.
  - Viewport refresh \(<500ms\) for moderate densities.
- **Scalability**:
  - Support thousands of aircraft points without choking the UI (clustering / LOD).
  - Data retention policies to prevent unbounded telemetry growth (TTL).
- **Reliability**:
  - Graceful degradation when feeds are rate-limited.
- **Security & privacy**:
  - Do not store secrets in repo; use `.env`.
  - Make “sensitive sources” opt-in; log minimal PII (most OSINT feeds are not PII).
- **Compliance**:
  - Respect API terms (rate limits, caching rules).

### **8) Data sources (initial)**
- **Satellites (TLE)**: CelesTrak (public) and/or Space-Track (account).
- **Aircraft**: OpenSky Network (free tier) and/or ADS-B Exchange (keys required).
- **Events**: MVP supports manual import; later add RSS/news sources with geocoding.

### **9) Success metrics**
- **Engagement**: time-on-map, number of asset inspections, number of searches.
- **System**: p95 viewport API latency, ingest freshness (seconds behind feed), UI FPS.
- **Quality**: accuracy sanity checks (e.g., aircraft altitude plausible; satellite track continuity).

### **10) Risks & mitigations**
- **Rate limits / feed instability**: cache + backoff + multi-source abstraction.
- **UI overload in dense areas**: clustering + LOD + sample-down trails.
- **Arango query cost**: keep a `telemetry_latest` collection for fast viewport queries; only traverse graphs for secondary views.

---

### **11) V1 backlog (epics → tasks)**
This backlog is ordered to prioritize the “WorldView-defining” features first: **Time Slider** and **GPS jamming tiles**.

#### **Epic 1 — Time slider (4D playback)**
- **E1.1**: Define time UX
  - Add timeline UI: scrubber, play/pause, speed selector (e.g., 1×, 5×, 15×, 60×)
  - Add “LIVE” mode vs “PLAYBACK” mode toggle
  - Add time range selector (last 1h / 6h / 24h)
- **E1.2**: API support for playback snapshots
  - Add backend endpoint to return “state at time \(t\)” for a viewport (aircraft + satellites)
  - Add downsampling strategy (server-side) to keep payload bounded
  - Add endpoint for “available data range” (min/max timestamps for slider)
- **E1.3**: Data retention policy for time travel
  - Adjust TTL to retain enough telemetry for desired playback window (e.g., 24h default)
  - Add per-source sampling rules (aircraft heavy; satellites light)
- **E1.4**: Frontend rendering
  - Render playback entities without flicker (update in place)
  - Show trails/ghosting for selected entity during playback
  - Show “data freshness” indicator and “missing data” gaps

#### **Epic 2 — GPS jamming tiles (GNSS interference)**
- **E2.1**: Event model + ingestion contract
  - Define `gps_jamming` event schema (tile/grid id, severity, time window, source)
  - Add importer path (manual JSON first; automated feed later)
- **E2.2**: Backend query + performance
  - Add `/events/query` filters for `kind=gps_jamming`
  - Ensure geo + time indexes make viewport queries fast
- **E2.3**: Frontend overlay
  - Render tiles as screen-space rectangles / polygons with intensity color scale
  - Add legend + toggle + time-range binding (tiles change as slider moves)
  - Add hover/click inspect (tile metadata)

#### **Epic 3 — “Actions” (US / Iran / strikes) and event taxonomy**
- **E3.1**: Expand events schema
  - Standardize `kind` enum and minimal required fields (title, source, confidence, geometry, time)
  - Add tagging for “US action” vs “Iran action” and subtypes
- **E3.2**: Event UX
  - Timeline markers for major actions
  - Filter panel by kind/country/source/confidence
- **E3.3**: Relations (optional)
  - Create links between events ↔ assets (nearby, mentioned, correlated)

#### **Epic 4 — Airspace closures / no-fly zones**
- **E4.1**: Model closures as polygon events with `tsStart/tsEnd`
- **E4.2**: Overlay + styling + labels (country, status)
- **E4.3**: Time slider integration (zones appear/disappear over time)

#### **Epic 5 — Maritime AIS overlay**
- **E5.1**: Add `vessel` assets + telemetry ingestion
- **E5.2**: Viewport query support + clustering
- **E5.3**: Playback + trails for vessels

#### **Epic 6 — Saved viewpoints + sharing**
- **E6.1**: Save camera position + time state + layer toggles
- **E6.2**: Deep-link URLs to a viewpoint

#### **Epic 7 — Visual modes (shader pipeline)**
- **E7.1**: Define shader presets (CRT/NVG/FLIR/cel)
- **E7.2**: Toggle UX + performance guardrails


