## Product Requirements Document (PRD)

> **Status (as of April 2026).** This is the **original PRD** written in March 2026 before implementation began. It has been annotated with current implementation status so readers can distinguish "what we planned" from "what shipped":
>
> - ✅ **Implemented** — in the current `main` branch.
> - 🚧 **Partial** — some parts shipped; scope narrower than the PRD described.
> - ⏳ **Not implemented** — still on the backlog.
>
> The app today ships MVP + most of V1 (Epics 1–5). Epics 6 (saved viewpoints) and 7 (visual modes) are not implemented. Streaming updates are simulated via React Query polling rather than SSE/WebSockets. See `README.md` for the user-facing feature list and `SPEC.md` for the current technical design.

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
- ✅ **Globe**: Cesium viewer with Esri World Imagery + boundaries/labels overlay. (3D Tiles integration deferred.)
- ✅ **Aircraft overlay**: live OpenSky positions in viewport + click-to-inspect.
- ✅ **Satellites overlay**: CelesTrak TLEs propagated with SGP4 via satellite.js; viewport-filtered.
- ✅ **Events overlay**: event schema + `/events/query`; demo seed endpoints populate GPS jamming, actions, strikes, airspace closures.
- ✅ **Time controls**:
  - Aircraft: recent-trail rendering via `/assets/:key/trail` and `/viewport/tracks`.
  - Satellites: current position + track overlay (predicted-orbit polyline segments via bucketed telemetry; live SGP4 propagation happens in the ingest service, not the browser).
- ✅ **Data persistence**: ArangoDB collections `assets`, `telemetry_latest`, `telemetry_points`, `telemetry_buckets`, `events`.
- ✅ **Viewport API**: `POST /viewport/query` (LIVE) and `POST /viewport/snapshot` (PLAYBACK) with per-type reservation to prevent dense aircraft from crowding out satellites.

#### **V1 scope (expanded demo)**
- ✅ **Time slider (4D playback)**: LIVE ↔ PLAYBACK toggle, 1×/5×/15×/60× playback speeds, timeline-marker strip aligned to the slider, click-to-fly on markers.
- ✅ **GPS jamming tiles**: hex-grid overlay rendered as ground-clamped ellipses, severity-coloured, time-window aware. *Demo seed data — no live feed.*
- ✅ **Event taxonomy ("actions")**: kinds `action_us`, `action_iran`, `strike`, `airspace_closure`, `gps_jamming`, `maritime_disruption`; severity + confidence + tags + geometry. *Demo seed data.*
- ✅ **Airspace closures / no-fly zones**: polygon events rendered as a 3D fence with stripe material + glow outline; uses the Iran country boundary (`IRN.geo.json`) when `jurisdiction: "IRN"`.
- ✅ **Maritime (AIS) overlay**: `vessel` asset type with live + historical tracks via the shared telemetry model. *Demo seed data only — no live AIS feed integrated.*
- ⏳ **Visual modes**: shader/post-processing toggles (CRT, NVG, FLIR-like palette, cel shading). *Not implemented.*
- ⏳ **Saved viewpoints**: bookmarks of camera position + active layers. *Not implemented.* (Two hard-coded "Focus Iran" / "Focus Gulf" buttons exist as a lightweight substitute.)
- 🚧 **Improved events**: schema in place; dedupe / multi-source / relevance ranking not implemented (single demo "source" today).
- 🚧 **Streaming updates**: implemented as **React Query polling** (5–15 s cadence depending on layer), not SSE/WebSockets.

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

#### **Epic 1 — Time slider (4D playback)** ✅
- ✅ **E1.1**: LIVE/PLAYBACK toggle; scrubber; play/pause; 1×/5×/15×/60× speeds. Time-range selector shipped as a 3h/6h/12h timeline-strip window.
- ✅ **E1.2**: `POST /viewport/snapshot` returns state-at-`t` using per-minute `telemetry_buckets` with per-type slot reservation; `GET /timeline/range` returns min/max available timestamps.
- 🚧 **E1.3**: Buckets collection is used for fast playback; **TTL policies are not yet configured** — telemetry accumulates indefinitely until managed manually.
- 🚧 **E1.4**: Playback entities update in place; selected-asset trail renders. **"Data freshness" / "missing-data gaps" indicators are not implemented.**

#### **Epic 2 — GPS jamming tiles (GNSS interference)** ✅ (with demo data)
- ✅ **E2.1**: `gps_jamming` event schema implemented (`kind`, `severity`, `tsStart/tsEnd`, `geometry: Polygon`, `source`, `confidence`, `tags`). **Importer is the `/events/seed-demo-gps-jamming` hex-grid generator**; no live GNSS-interference feed integrated.
- ✅ **E2.2**: `POST /events/query` supports `kinds` + `minSeverity` + bbox + time-window filters.
- ✅ **E2.3**: Tiles render as ground-clamped ellipses, severity-coloured (yellow / orange / red), toggled by "GPS jamming tiles" checkbox and bound to the playback time window. Hover/click inspect not yet wired up.

#### **Epic 3 — "Actions" (US / Iran / strikes) and event taxonomy** ✅ (with demo data)
- ✅ **E3.1**: Kind taxonomy in use: `action_us`, `action_iran`, `strike`, `airspace_closure`, `gps_jamming`, `maritime_disruption`. Required fields: `title`, `source`, `confidence`, `severity`, `geometry`, `tsStart[/tsEnd]`, `tags`.
- ✅ **E3.2**: Timeline-strip markers colour-coded by kind; click to fly to event + set playback time. Filter panel is currently per-kind checkboxes (Actions / GPS jamming / Vessels); no confidence/source facets yet.
- ⏳ **E3.3**: Event ↔ asset graph relations **not implemented**.

#### **Epic 4 — Airspace closures / no-fly zones** ✅
- ✅ **E4.1**: Modeled as `airspace_closure` events with polygon geometry + `tsStart/tsEnd` + `jurisdiction`.
- ✅ **E4.2**: Polygon overlay with transparent cyan fill, stripe-textured 3D wall ("fence"), magenta outline with glow; prefers the country boundary GeoJSON (e.g. `IRN.geo.json`) over the raw event polygon when `jurisdiction` is set.
- ✅ **E4.3**: Time-slider integration — closures appear/disappear by their `tsStart/tsEnd`.

#### **Epic 5 — Maritime AIS overlay** ✅ (demo data only)
- ✅ **E5.1**: `vessel` asset type in the shared schema; `/demo/seed-vessels` seeds vessel assets + telemetry + buckets.
- ✅ **E5.2**: `/viewport/query` + `/viewport/snapshot` accept `"vessel"` as a type; no clustering yet (density has been low enough in demos).
- ✅ **E5.3**: Playback + trails for vessels via shared `/viewport/tracks`.
- ⏳ **No live AIS feed integrated** (AISStream/AISHub/etc.) — everything is synthetic demo data.

#### **Epic 6 — Saved viewpoints + sharing** ⏳ Not implemented
- Two hard-coded camera presets exist in `CameraControls` ("Focus Iran", "Focus Gulf") as lightweight substitutes.
- Deep-link URLs (bbox, time, layer state) are not implemented.

#### **Epic 7 — Visual modes (shader pipeline)** ⏳ Not implemented
- Scene tweaks (atmosphere off, fog off, sharper tiles) are hard-coded in `SceneTweaks`, but no user-toggleable CRT/NVG/FLIR/cel shader presets exist.


