import * as dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

// Workspaces run with different CWDs; always load repo-root `.env`.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

function expandKnownPlaceholders() {
  const hostPort = process.env.ARANGO_HOST_PORT ?? "48529";
  if (process.env.ARANGO_URL?.includes("${ARANGO_HOST_PORT}")) {
    process.env.ARANGO_URL = process.env.ARANGO_URL.replaceAll("${ARANGO_HOST_PORT}", hostPort);
  }
  if (process.env.ARANGO_PASSWORD?.includes("${ARANGO_ROOT_PASSWORD}")) {
    process.env.ARANGO_PASSWORD = process.env.ARANGO_PASSWORD.replaceAll(
      "${ARANGO_ROOT_PASSWORD}",
      process.env.ARANGO_ROOT_PASSWORD ?? "",
    );
  }
}

expandKnownPlaceholders();

const EnvSchema = z.object({
  ARANGO_URL: z.string().default("http://localhost:48529"),
  ARANGO_DB_NAME: z.string().default("worldview"),
  ARANGO_USERNAME: z.string().default("root"),
  ARANGO_PASSWORD: z.string().min(1),

  INGEST_TICK_MS: z.coerce.number().int().positive().default(15_000),

  // OpenSky (optional credentials improve rate limits)
  OPENSKY_USERNAME: z.string().optional(),
  OPENSKY_PASSWORD: z.string().optional(),
  // Optional bbox: "west,south,east,north"
  OPENSKY_BBOX: z.string().optional(),

  // Satellites
  CELESTRAK_TLE_URL: z.string().default(
    "https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle",
  ),
  SATELLITE_LIMIT: z.coerce.number().int().positive().default(200),
});

export const env = EnvSchema.parse(process.env);

