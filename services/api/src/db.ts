import { Database } from "arangojs";
import { CollectionType } from "arangojs/collections";
import { env } from "./env.js";

export function createArangoSystemDb(): Database {
  const db = new Database({ url: env.ARANGO_URL });
  db.useBasicAuth(env.ARANGO_USERNAME, env.ARANGO_PASSWORD);
  return db.database("_system");
}

export function createArangoAppDb(): Database {
  const db = new Database({ url: env.ARANGO_URL });
  db.useBasicAuth(env.ARANGO_USERNAME, env.ARANGO_PASSWORD);
  return db.database(env.ARANGO_DB_NAME);
}

async function ensureDatabaseExists(systemDb: Database, dbName: string) {
  const existing = await systemDb.listDatabases();
  if (existing.includes(dbName)) return;
  await systemDb.createDatabase(dbName);
}

async function ensureCollection(db: Database, name: string, type: CollectionType) {
  const col = db.collection(name);
  const exists = await col.exists();
  if (exists) return col;
  if (type === CollectionType.EDGE_COLLECTION) {
    await db.createEdgeCollection(name);
  } else {
    await db.createCollection(name);
  }
  return db.collection(name);
}

export async function bootstrapDatabase() {
  const systemDb = createArangoSystemDb();
  await ensureDatabaseExists(systemDb, env.ARANGO_DB_NAME);

  const db = createArangoAppDb();

  const assets = await ensureCollection(db, "assets", 2);
  const telemetryLatest = await ensureCollection(db, "telemetry_latest", 2);
  const telemetryPoints = await ensureCollection(db, "telemetry_points", 2);
  const telemetryBuckets = await ensureCollection(db, "telemetry_buckets", 2);
  const events = await ensureCollection(db, "events", 2);
  await ensureCollection(db, "relations", 3);

  // Indexes — idempotent create via "ensureIndex" pattern
  // assets: (optional later) search view

  // telemetry_latest
  await telemetryLatest.ensureIndex({ type: "geo", fields: ["geometry"] });
  await telemetryLatest.ensureIndex({ type: "persistent", fields: ["ts"] });
  await telemetryLatest.ensureIndex({ type: "persistent", fields: ["type"] });
  await telemetryLatest.ensureIndex({ type: "persistent", fields: ["assetKey"], unique: true, sparse: true });

  // telemetry_points
  await telemetryPoints.ensureIndex({ type: "persistent", fields: ["assetKey", "ts"] });
  await telemetryPoints.ensureIndex({ type: "persistent", fields: ["type", "ts"] });
  await telemetryPoints.ensureIndex({ type: "persistent", fields: ["ts"] });
  await telemetryPoints.ensureIndex({ type: "geo", fields: ["geometry"] });
  // Keep 24 hours by default. Tune later.
  await telemetryPoints.ensureIndex({ type: "ttl", fields: ["ts"], expireAfter: 60 * 60 * 24 });

  // telemetry_buckets (minute-bucketed telemetry for fast playback)
  await telemetryBuckets.ensureIndex({ type: "geo", fields: ["geometry"] });
  await telemetryBuckets.ensureIndex({ type: "persistent", fields: ["bucket", "type"] });
  await telemetryBuckets.ensureIndex({ type: "persistent", fields: ["assetKey", "bucket"] });
  await telemetryBuckets.ensureIndex({ type: "persistent", fields: ["ts"] });
  // Same retention window as telemetry_points (start with 24h)
  await telemetryBuckets.ensureIndex({ type: "ttl", fields: ["ts"], expireAfter: 60 * 60 * 24 });

  // events
  await events.ensureIndex({ type: "geo", fields: ["geometry"] });
  await events.ensureIndex({ type: "persistent", fields: ["tsStart"] });
  await events.ensureIndex({ type: "persistent", fields: ["kind"] });

  return { db, assets, telemetryLatest, telemetryPoints, events };
}

