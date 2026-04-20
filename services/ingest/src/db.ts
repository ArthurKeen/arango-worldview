import { Database } from "arangojs";
import { env } from "./env.js";

export function createDb(): Database {
  const db = new Database({ url: env.ARANGO_URL });
  db.useBasicAuth(env.ARANGO_USERNAME, env.ARANGO_PASSWORD);
  return db.database(env.ARANGO_DB_NAME);
}

