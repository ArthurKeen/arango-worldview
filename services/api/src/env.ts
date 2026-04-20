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
  API_HOST: z.string().default("0.0.0.0"),
  API_PORT: z.coerce.number().int().positive().default(8080),

  ARANGO_URL: z.string().default("http://localhost:48529"),
  ARANGO_DB_NAME: z.string().default("worldview"),
  ARANGO_USERNAME: z.string().default("root"),
  ARANGO_PASSWORD: z.string().min(1),
});

export const env = EnvSchema.parse(process.env);

