import type { Database } from "arangojs";

type VesselSeed = {
  key: string;
  name: string;
  lng: number;
  lat: number;
  headingDeg: number;
  velocityMS: number;
};

export async function seedDemoVessels(db: Database) {
  const assetsCol = db.collection("assets");
  const latestCol = db.collection("telemetry_latest");
  const pointsCol = db.collection("telemetry_points");
  const bucketsCol = db.collection("telemetry_buckets");

  const ts = Date.now();
  const bucket = Math.floor(ts / 60_000);

  // Strait of Hormuz / Persian Gulf-ish demo vessels
  const vessels: VesselSeed[] = [
    { key: "vessel_demo_1", name: "AIS DEMO 1", lng: 56.2, lat: 26.6, headingDeg: 290, velocityMS: 6.5 },
    { key: "vessel_demo_2", name: "AIS DEMO 2", lng: 54.9, lat: 25.8, headingDeg: 110, velocityMS: 7.2 },
    { key: "vessel_demo_3", name: "AIS DEMO 3", lng: 52.9, lat: 26.9, headingDeg: 70, velocityMS: 5.0 },
  ];

  for (const v of vessels) {
    const assetKey = `vessel_${v.key}`;
    await assetsCol.save(
      {
        _key: assetKey,
        type: "vessel",
        name: v.name,
        tags: ["demo", "ais"],
        createdAt: ts,
        updatedAt: ts,
      },
      { overwriteMode: "update" },
    );

    const telemetry = {
      assetKey,
      type: "vessel",
      ts,
      geometry: { type: "Point", coordinates: [v.lng, v.lat] as [number, number] },
      headingDeg: v.headingDeg,
      velocityMS: v.velocityMS,
      source: "demo-ais",
    };

    await latestCol.save({ _key: assetKey, ...telemetry }, { overwriteMode: "replace" });
    await pointsCol.save(telemetry);
    await bucketsCol.save(
      { _key: `${assetKey}__${bucket}`, bucket, ...telemetry },
      { overwriteMode: "replace" },
    );
  }

  return { ok: true, inserted: vessels.length };
}

