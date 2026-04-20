import { env } from "./env.js";
import { createDb } from "./db.js";
import { nowMs } from "./util.js";

type OpenSkyStatesResponse = {
  time: number;
  states: any[] | null;
};

function openskyAuthHeader(): string | null {
  if (!env.OPENSKY_USERNAME || !env.OPENSKY_PASSWORD) return null;
  const token = Buffer.from(`${env.OPENSKY_USERNAME}:${env.OPENSKY_PASSWORD}`).toString("base64");
  return `Basic ${token}`;
}

export async function ingestOpenSkyOnce() {
  const url = new URL("https://opensky-network.org/api/states/all");
  if (env.OPENSKY_BBOX) {
    const parts = env.OPENSKY_BBOX.split(",").map((x) => x.trim());
    if (parts.length === 4) {
      const [west, south, east, north] = parts;
      url.searchParams.set("lomin", west);
      url.searchParams.set("lamin", south);
      url.searchParams.set("lomax", east);
      url.searchParams.set("lamax", north);
    }
  }

  const headers: Record<string, string> = {};
  const auth = openskyAuthHeader();
  if (auth) headers.Authorization = auth;

  const res = await fetch(url, { headers });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenSky HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  const payload = (await res.json()) as OpenSkyStatesResponse;
  if (!payload.states || payload.states.length === 0) return { ingested: 0 };

  const db = createDb();
  const assetsCol = db.collection("assets");
  const latestCol = db.collection("telemetry_latest");
  const pointsCol = db.collection("telemetry_points");
  const bucketsCol = db.collection("telemetry_buckets");

  const ts = nowMs();
  let ingested = 0;

  // OpenSky state vector fields (index-based):
  // 0 icao24, 1 callsign, 2 origin_country, 5 lon, 6 lat, 7 baro_altitude (m),
  // 9 velocity (m/s), 10 true_track (deg), 13 geo_altitude (m)
  for (const s of payload.states) {
    const icao24 = String(s?.[0] ?? "").trim();
    if (!icao24) continue;
    const lon = typeof s?.[5] === "number" ? (s[5] as number) : null;
    const lat = typeof s?.[6] === "number" ? (s[6] as number) : null;
    if (lon == null || lat == null) continue;

    const callsign = typeof s?.[1] === "string" ? s[1].trim() : undefined;
    const originCountry = typeof s?.[2] === "string" ? s[2].trim() : undefined;
    const velocityMS = typeof s?.[9] === "number" ? (s[9] as number) : undefined;
    const headingDeg = typeof s?.[10] === "number" ? (s[10] as number) : undefined;
    const altitudeM =
      typeof s?.[13] === "number"
        ? (s[13] as number)
        : typeof s?.[7] === "number"
          ? (s[7] as number)
          : undefined;

    const assetKey = `aircraft_${icao24}`;

    const assetDoc = {
      _key: assetKey,
      type: "aircraft",
      name: callsign || icao24,
      callsign,
      icao24,
      country: originCountry,
      updatedAt: ts,
      createdAt: ts,
    };

    // Upsert asset
    await assetsCol.save(assetDoc, { overwriteMode: "update" });

    const telemetry = {
      assetKey,
      type: "aircraft",
      ts,
      geometry: { type: "Point", coordinates: [lon, lat] as [number, number] },
      altitudeM,
      velocityMS,
      headingDeg,
      source: "opensky",
    };

    await latestCol.save({ _key: assetKey, ...telemetry }, { overwriteMode: "replace" });

    // Sample into rolling history (TTL will expire)
    await pointsCol.save(telemetry);

    // Minute bucket materialization for fast playback snapshots
    const bucket = Math.floor(ts / 60_000);
    await bucketsCol.save(
      {
        _key: `${assetKey}__${bucket}`,
        assetKey,
        type: "aircraft",
        bucket,
        ts,
        geometry: telemetry.geometry,
        altitudeM,
        velocityMS,
        headingDeg,
        source: "opensky",
      },
      { overwriteMode: "replace" },
    );

    ingested++;
  }

  return { ingested };
}

