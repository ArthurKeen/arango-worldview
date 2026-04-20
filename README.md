# WorldView-Arango

A browser-based 3D globe "command center" that fuses real-time open data — aircraft (OpenSky), satellites (CelesTrak TLEs), and events — into an interactive 4D map powered by ArangoDB.

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
| **API** | `services/api` | Fastify 5 REST API with viewport queries |
| **Ingest** | `services/ingest` | Polling service for OpenSky aircraft + CelesTrak satellite data |
| **Shared** | `packages/shared` | Shared TypeScript types (`Asset`, `Telemetry`, `ViewportQuery`) |

## Tech Stack

- **Frontend**: Next.js 16, React 19, Cesium + Resium, TanStack React Query, Tailwind CSS 4
- **API**: Fastify 5, Zod validation, arangojs
- **Ingest**: Node.js + tsx, satellite.js (SGP4 propagation), arangojs
- **Database**: ArangoDB 3.12 (Docker)
- **Monorepo**: npm workspaces, concurrently

## Prerequisites

- **Node.js** >= 18
- **Docker** (for ArangoDB)

## Getting Started

### 1. Clone and install

```bash
git clone https://github.com/ArthurKeen/arango-worldview.git
cd arango-worldview
npm install
```

The `postinstall` hook in `apps/web` automatically copies Cesium static assets into `public/cesium/`.

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and set at least `ARANGO_ROOT_PASSWORD`. See `.env.example` for all available options.

### 3. Start ArangoDB

```bash
docker compose up -d
```

This launches ArangoDB 3.12 on port `48529` by default (configurable via `ARANGO_HOST_PORT` in `.env`).

### 4. Run the full stack

```bash
npm run dev
```

This starts all three services concurrently:

| Service | URL | Color |
|---------|-----|-------|
| API | `http://localhost:8080` | blue |
| Ingest | _(background polling)_ | magenta |
| Web | `http://localhost:3000` | green |

You can also run services individually:

```bash
npm run dev:api      # API only
npm run dev:ingest   # Ingest only
npm run dev:web      # Web only
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start all services in parallel |
| `npm run dev:api` | Start the Fastify API |
| `npm run dev:ingest` | Start the ingest polling service |
| `npm run dev:web` | Start the Next.js dev server |
| `npm run build` | Build all workspaces |
| `npm run lint` | Lint all workspaces |

## Data Sources

- **Aircraft**: [OpenSky Network](https://opensky-network.org/) — live ADS-B positions (free tier)
- **Satellites**: [CelesTrak](https://celestrak.org/) — TLE orbital elements, propagated with SGP4 via satellite.js

## License

ISC
