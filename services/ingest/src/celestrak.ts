import * as satellite from "satellite.js";
import { env } from "./env.js";
import { createDb } from "./db.js";
import { nowMs } from "./util.js";

type TleEntry = { name: string; line1: string; line2: string };

function parseTle(text: string): TleEntry[] {
  const lines = text
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0);

  const out: TleEntry[] = [];
  for (let i = 0; i + 2 < lines.length; i += 3) {
    const name = lines[i] ?? "";
    const line1 = lines[i + 1] ?? "";
    const line2 = lines[i + 2] ?? "";
    if (line1.startsWith("1 ") && line2.startsWith("2 ")) out.push({ name: name.trim(), line1, line2 });
  }
  return out;
}

function noradIdFromLine1(line1: string): number | null {
  // TLE line1 columns 3-7 is satellite number (1-indexed); easy extraction:
  const satNum = line1.slice(2, 7).trim();
  const n = Number(satNum);
  return Number.isFinite(n) ? n : null;
}

function eciToLngLatAltM(eci: { x: number; y: number; z: number }, when: Date) {
  const gmst = satellite.gstime(when);
  const geodetic = satellite.eciToGeodetic(eci as any, gmst);
  const lat = satellite.degreesLat(geodetic.latitude);
  const lng = satellite.degreesLong(geodetic.longitude);
  const altM = geodetic.height * 1000;
  return { lat, lng, altM };
}

export async function ingestCelesTrakTleSnapshot() {
  const res = await fetch(env.CELESTRAK_TLE_URL);
  if (!res.ok) throw new Error(`CelesTrak HTTP ${res.status}`);
  const text = await res.text();
  const entries = parseTle(text).slice(0, env.SATELLITE_LIMIT);

  const db = createDb();
  const assetsCol = db.collection("assets");

  const ts = nowMs();
  let upserted = 0;

  for (const e of entries) {
    const noradId = noradIdFromLine1(e.line1);
    if (!noradId) continue;
    const assetKey = `sat_${noradId}`;

    await assetsCol.save(
      {
        _key: assetKey,
        type: "satellite",
        name: e.name,
        noradId,
        updatedAt: ts,
        createdAt: ts,
        tags: ["celestrak", "active"],
        tle: { line1: e.line1, line2: e.line2, fetchedAt: ts },
      },
      { overwriteMode: "update" },
    );
    upserted++;
  }

  return { upserted };
}

export async function tickSatellitesFromAssets() {
  const db = createDb();
  const assetsCol = db.collection("assets");
  const latestCol = db.collection("telemetry_latest");
  const pointsCol = db.collection("telemetry_points");
  const bucketsCol = db.collection("telemetry_buckets");

  const ts = nowMs();
  const when = new Date(ts);

  const cursor = await db.query(`
FOR a IN assets
  FILTER a.type == "satellite"
  FILTER a.tle != null
  RETURN { _key: a._key, name: a.name, noradId: a.noradId, tle: a.tle }
  `);

  const sats: Array<{ _key: string; name?: string; noradId?: number; tle: { line1: string; line2: string } }> =
    await cursor.all();

  let updated = 0;

  for (const s of sats) {
    const { line1, line2 } = s.tle;
    const satrec = satellite.twoline2satrec(line1, line2);
    const pv = satellite.propagate(satrec, when);
    if (!pv.position) continue;

    const { lat, lng, altM } = eciToLngLatAltM(pv.position as any, when);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    const telemetry = {
      assetKey: s._key,
      type: "satellite",
      ts,
      geometry: { type: "Point", coordinates: [lng, lat] as [number, number] },
      altitudeM: altM,
      source: "tle",
    };

    await latestCol.save({ _key: s._key, ...telemetry }, { overwriteMode: "replace" });
    await pointsCol.save(telemetry);

    const bucket = Math.floor(ts / 60_000);
    await bucketsCol.save(
      {
        _key: `${s._key}__${bucket}`,
        assetKey: s._key,
        type: "satellite",
        bucket,
        ts,
        geometry: telemetry.geometry,
        altitudeM: altM,
        source: "tle",
      },
      { overwriteMode: "replace" },
    );
    updated++;
  }

  return { updated };
}

