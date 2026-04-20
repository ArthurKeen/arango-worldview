import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createArangoAppDb } from "./db.js";
import { seedDemoVessels } from "./demoVessels.js";

const ViewportQuerySchema = z.object({
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  types: z.array(z.enum(["aircraft", "satellite", "vessel", "facility", "event_source"])).min(1),
  minTs: z.number().optional(),
  limit: z.number().int().positive().max(5000).optional(),
});

const ViewportSnapshotSchema = z.object({
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  types: z.array(z.enum(["aircraft", "satellite", "vessel", "facility", "event_source"])).min(1),
  atTs: z.number(),
  windowMs: z.number().int().positive().max(6 * 60 * 60_000).optional(),
  limit: z.number().int().positive().max(5000).optional(),
});

const ViewportTracksSchema = z.object({
  assetKeys: z.array(z.string().min(1)).min(1).max(500),
  endTs: z.number(),
  windowMs: z.number().int().positive().max(6 * 60 * 60_000).default(30 * 60_000),
  maxPointsPerAsset: z.number().int().positive().max(500).default(120),
});

export async function registerRoutes(app: FastifyInstance) {
  app.get("/health", async () => ({ ok: true }));

  app.post("/viewport/query", async (req) => {
    const body = ViewportQuerySchema.parse(req.body);
    const [west, south, east, north] = body.bbox;
    const limit = body.limit ?? 2000;
    const minTs = body.minTs ?? Date.now() - 60_000; // default 60s freshness window
    const includeAircraft = body.types.includes("aircraft");
    const includeSatellites = body.types.includes("satellite");

    // When aircraft are dense, they can crowd out satellites under a single LIMIT.
    // Reserve satellite slots so "satellite" remains visible when both are enabled.
    const satLimit = includeSatellites
      ? Math.min(500, Math.max(50, Math.floor(limit * 0.2)))
      : 0;
    const aircraftLimit = includeAircraft ? Math.max(0, limit - satLimit) : 0;
    const otherTypes = body.types.filter((t) => t !== "aircraft" && t !== "satellite");
    const otherLimit = Math.max(0, limit - satLimit - aircraftLimit);

    const db = createArangoAppDb();
    const cursor = await db.query(
      `
LET poly = GEO_POLYGON([
  [[@west, @south], [@east, @south], [@east, @north], [@west, @north], [@west, @south]]
])

LET sats = (
  FOR t IN telemetry_latest
    FILTER t.ts >= @minTs
    FILTER t.type == "satellite"
    FILTER GEO_INTERSECTS(t.geometry, poly)
    LET a = DOCUMENT("assets", t.assetKey)
    FILTER a != null
    LIMIT @satLimit
    RETURN { asset: a, telemetry: t }
)

LET aircraft = (
  FOR t IN telemetry_latest
    FILTER t.ts >= @minTs
    FILTER t.type == "aircraft"
    FILTER GEO_INTERSECTS(t.geometry, poly)
    LET a = DOCUMENT("assets", t.assetKey)
    FILTER a != null
    LIMIT @aircraftLimit
    RETURN { asset: a, telemetry: t }
)

LET others = (
  FOR t IN telemetry_latest
    FILTER t.ts >= @minTs
    FILTER t.type IN @otherTypes
    FILTER GEO_INTERSECTS(t.geometry, poly)
    LET a = DOCUMENT("assets", t.assetKey)
    FILTER a != null
    LIMIT @otherLimit
    RETURN { asset: a, telemetry: t }
)

RETURN APPEND(APPEND(sats, aircraft), others)
      `,
      {
        west,
        south,
        east,
        north,
        minTs,
        satLimit,
        aircraftLimit,
        otherTypes,
        otherLimit,
      },
    );

    const rows = await cursor.all();
    const items = rows[0] ?? [];
    return { items, meta: { limit, satLimit, aircraftLimit, otherLimit } };
  });

  // V1: playback mode (time slider)
  app.post("/viewport/snapshot", async (req) => {
    const body = ViewportSnapshotSchema.parse(req.body);
    const [west, south, east, north] = body.bbox;
    const limit = body.limit ?? 2000;
    const windowMs = body.windowMs ?? 10 * 60_000;
    const atTs = body.atTs;
    const includeAircraft = body.types.includes("aircraft");
    const includeSatellites = body.types.includes("satellite");

    const satLimit = includeSatellites
      ? Math.min(300, Math.max(50, Math.floor(limit * 0.2)))
      : 0;
    const aircraftLimit = includeAircraft ? Math.max(0, limit - satLimit) : 0;
    const otherTypes = body.types.filter((t) => t !== "aircraft" && t !== "satellite");
    const otherLimit = Math.max(0, limit - satLimit - aircraftLimit);

    const db = createArangoAppDb();
    const cursor = await db.query(
      `
LET poly = GEO_POLYGON([
  [[@west, @south], [@east, @south], [@east, @north], [@west, @north], [@west, @south]]
])
LET bucketMs = 60000
LET bucketMax = FLOOR(@atTs / bucketMs)
LET bucketMin = bucketMax - CEIL(@windowMs / bucketMs)

LET sats = @satLimit > 0 ? (
  FOR b IN bucketMin..bucketMax
    FOR p IN telemetry_buckets
      FILTER p.bucket == b
      FILTER p.type == "satellite"
      FILTER GEO_INTERSECTS(p.geometry, poly)
      COLLECT assetKey = p.assetKey AGGREGATE maxTs = MAX(p.ts)
      LET point = FIRST(
        FOR p2 IN telemetry_buckets
          FILTER p2.assetKey == assetKey
          FILTER p2.ts == maxTs
          LIMIT 1
          RETURN p2
      )
      LET a = DOCUMENT("assets", assetKey)
      FILTER a != null
      LIMIT @satLimit
      RETURN { asset: a, telemetryAt: point }
) : []

LET aircraft = @aircraftLimit > 0 ? (
  FOR b IN bucketMin..bucketMax
    FOR p IN telemetry_buckets
      FILTER p.bucket == b
      FILTER p.type == "aircraft"
      FILTER GEO_INTERSECTS(p.geometry, poly)
      COLLECT assetKey = p.assetKey AGGREGATE maxTs = MAX(p.ts)
      LET point = FIRST(
        FOR p2 IN telemetry_buckets
          FILTER p2.assetKey == assetKey
          FILTER p2.ts == maxTs
          LIMIT 1
          RETURN p2
      )
      LET a = DOCUMENT("assets", assetKey)
      FILTER a != null
      LIMIT @aircraftLimit
      RETURN { asset: a, telemetryAt: point }
) : []

LET others = (
  FOR ttype IN @otherTypes
    FOR b IN bucketMin..bucketMax
      FOR p IN telemetry_buckets
        FILTER p.bucket == b
        FILTER p.type == ttype
        FILTER GEO_INTERSECTS(p.geometry, poly)
        COLLECT assetKey = p.assetKey AGGREGATE maxTs = MAX(p.ts)
        LET point = FIRST(
          FOR p2 IN telemetry_buckets
            FILTER p2.assetKey == assetKey
            FILTER p2.ts == maxTs
            LIMIT 1
            RETURN p2
        )
        LET a = DOCUMENT("assets", assetKey)
        FILTER a != null
        LIMIT @otherLimit
        RETURN { asset: a, telemetryAt: point }
)

RETURN APPEND(APPEND(sats, aircraft), others)
      `,
      {
        west,
        south,
        east,
        north,
        atTs,
        windowMs,
        satLimit,
        aircraftLimit,
        otherTypes,
        otherLimit,
      },
    );

    const rows = await cursor.all();
    const items = rows[0] ?? [];
    return { items, meta: { limit, atTs, windowMs, satLimit, aircraftLimit, otherLimit } };
  });

  // V1: slider bounds (what timestamps exist)
  app.get("/timeline/range", async () => {
    const db = createArangoAppDb();
    // IMPORTANT: This endpoint must stay fast. Avoid scanning raw telemetry_points.
    // Playback uses telemetry_buckets, so compute bounds from buckets.
    const cursor = await db.query(`
LET telemetryBuckets = (
  LET minTs = FIRST(FOR p IN telemetry_buckets SORT p.ts ASC LIMIT 1 RETURN p.ts)
  LET maxTs = FIRST(FOR p IN telemetry_buckets SORT p.ts DESC LIMIT 1 RETURN p.ts)
  RETURN { minTs, maxTs }
)

LET events = (
  LET minTs = FIRST(FOR e IN events SORT e.tsStart ASC LIMIT 1 RETURN e.tsStart)
  LET maxTs = FIRST(FOR e IN events SORT e.tsStart DESC LIMIT 1 RETURN e.tsStart)
  RETURN { minTs, maxTs }
)

RETURN { telemetry_buckets: telemetryBuckets[0], events: events[0] }
    `);
    const rows = await cursor.all();
    return rows[0] ?? { telemetry_buckets: null, events: null };
  });

  app.get("/assets/:assetKey", async (req) => {
    const ParamsSchema = z.object({ assetKey: z.string().min(1) });
    const { assetKey } = ParamsSchema.parse((req as any).params);
    const db = createArangoAppDb();

    const [asset, telemetry] = await Promise.all([
      db.collection("assets").document(assetKey).catch(() => null),
      db.collection("telemetry_latest").document(assetKey).catch(() => null),
    ]);

    if (!asset) return { asset: null, telemetry };
    return { asset, telemetry };
  });

  app.get("/assets/:assetKey/trail", async (req) => {
    const ParamsSchema = z.object({ assetKey: z.string().min(1) });
    const QuerySchema = z.object({
      sinceTs: z.coerce.number().optional(),
      limit: z.coerce.number().int().positive().max(5000).optional(),
    });

    const { assetKey } = ParamsSchema.parse((req as any).params);
    const { sinceTs, limit } = QuerySchema.parse((req as any).query);

    const db = createArangoAppDb();
    const cursor = await db.query(
      `
FOR p IN telemetry_points
  FILTER p.assetKey == @assetKey
  FILTER p.ts >= @sinceTs
  SORT p.ts ASC
  LIMIT @limit
  RETURN p
      `,
      {
        assetKey,
        sinceTs: sinceTs ?? Date.now() - 30 * 60_000,
        limit: limit ?? 2000,
      },
    );
    const points = await cursor.all();
    return { points };
  });

  app.post("/events/query", async (req) => {
    const Schema = z.object({
      bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
      tsStart: z.number(),
      tsEnd: z.number(),
      kinds: z.array(z.string()).optional(),
      minSeverity: z.number().optional(),
      limit: z.number().int().positive().max(5000).optional(),
    });
    const body = Schema.parse(req.body);
    const [west, south, east, north] = body.bbox;
    const limit = body.limit ?? 1000;

    const db = createArangoAppDb();
    const cursor = await db.query(
      `
LET poly = GEO_POLYGON([
  [[@west, @south], [@east, @south], [@east, @north], [@west, @north], [@west, @south]]
])

FOR e IN events
  FILTER @kinds == null || LENGTH(@kinds) == 0 || e.kind IN @kinds
  FILTER @minSeverity == null || e.severity >= @minSeverity
  FILTER e.tsStart <= @tsEnd
  FILTER (e.tsEnd == null || e.tsEnd >= @tsStart)
  FILTER GEO_INTERSECTS(e.geometry, poly)
  SORT e.tsStart DESC
  LIMIT @limit
  RETURN e
      `,
      {
        west,
        south,
        east,
        north,
        tsStart: body.tsStart,
        tsEnd: body.tsEnd,
        limit,
        kinds: body.kinds ?? null,
        minSeverity: body.minSeverity ?? null,
      },
    );
    const events = await cursor.all();
    return { events };
  });

  // Dev convenience: seed demo GPS jamming tiles (idempotent by _key)
  app.post("/events/seed-demo-gps-jamming", async () => {
    const db = createArangoAppDb();

    const now = Date.now();
    const tsStart = now - 60 * 60_000;
    const tsEnd = now + 60 * 60_000;

    // Hex-like patches (closer to GPSJAM's look than rectangles).
    // This is still synthetic demo data — real GPSJAM requires upstream ADS-B processing (ADS-B Exchange).
    function hexPolygon(lng: number, lat: number, radiusDeg: number) {
      const pts: Array<[number, number]> = [];
      const lonScale = Math.cos((lat * Math.PI) / 180) || 1;
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i;
        const dLat = radiusDeg * Math.sin(a);
        const dLng = (radiusDeg * Math.cos(a)) / lonScale;
        pts.push([lng + dLng, lat + dLat]);
      }
      pts.push(pts[0]!);
      return { type: "Polygon", coordinates: [pts] as any };
    }

    const center = { lng: 49.0, lat: 33.0 };
    // Much smaller cells to avoid the “giant overlapping diamonds” effect.
    const radiusDeg = 0.28;
    // Flat-top hex grid spacing (approx; degrees are imperfect but good enough for demo).
    // dx = 1.5 * r, dy = sqrt(3) * r
    const xStep = 1.5 * radiusDeg;
    const yStep = Math.sqrt(3) * radiusDeg;

    const docs: any[] = [];
    for (let r = -7; r <= 7; r++) {
      for (let q = -10; q <= 10; q++) {
        const lng = center.lng + q * xStep + (r % 2 ? xStep / 2 : 0);
        const lat = center.lat + r * yStep;
        if (lng < 35 || lng > 60 || lat < 24 || lat > 40) continue;

        const dist = Math.hypot((lng - center.lng) / 8, (lat - center.lat) / 6);
        const severity = Math.max(0.25, Math.min(0.95, 1.0 - dist));
        const key = `gpsjam_demo_hex_${q}_${r}`;
        const poly = hexPolygon(lng, lat, radiusDeg);

        docs.push({
          _key: key,
          kind: "gps_jamming",
          tsStart,
          tsEnd,
          title: "GPS/GNSS interference (demo)",
          summary: "Synthetic GNSS interference patches for UI development.",
          source: "demo",
          severity,
          geometry: poly as any,
          confidence: 0.4,
          tags: ["gps", "gnss", "interference", "demo"],
          meta: { provider: "demo", shape: "hex", key },
        });
      }
    }

    // Cleanup old demo keys then bulk upsert new ones.
    await db.query(`
FOR e IN events
  FILTER e._key IN ["gpsjam_demo_1","gpsjam_demo_2","gpsjam_demo_3"] OR LIKE(e._key, "gpsjam_demo_hex_%", true)
  REMOVE e IN events
    `);

    const cursor = await db.query(
      `
FOR d IN @docs
  UPSERT { _key: d._key }
    INSERT d
    UPDATE d
  IN events
RETURN 1
      `,
      { docs },
    );
    const inserted = (await cursor.all()).length;

    return { ok: true, inserted, tsStart, tsEnd };
  });

  // Dev convenience: seed demo aircraft tracks near Iran (so planes show even when OpenSky is rate-limited).
  app.post("/demo/seed-aircraft", async () => {
    const db = createArangoAppDb();

    const now = Date.now();
    const minutes = 35;
    const baseTs = now - minutes * 60_000;

    const seeds = [
      { key: "air_demo_1", name: "DEMO FLT 001", lng: 51.0, lat: 35.6, headingDeg: 140, velocityMS: 225 },
      { key: "air_demo_2", name: "DEMO FLT 002", lng: 50.2, lat: 34.8, headingDeg: 80, velocityMS: 240 },
      { key: "air_demo_3", name: "DEMO FLT 003", lng: 52.4, lat: 32.7, headingDeg: 25, velocityMS: 210 },
    ];

    const assetDocs: any[] = [];
    const latestDocs: any[] = [];
    const pointDocs: any[] = [];
    const bucketDocs: any[] = [];

    for (const s of seeds) {
      const assetKey = `aircraft_${s.key}`;
      assetDocs.push({
        _key: assetKey,
        type: "aircraft",
        name: s.name,
        callsign: s.name,
        tags: ["demo", "air"],
        createdAt: now,
        updatedAt: now,
      });

      // Generate a simple straight-ish track (minute buckets) so playback shows motion.
      for (let i = 0; i <= minutes; i++) {
        const ts = baseTs + i * 60_000;
        const frac = i / minutes;

        const lng = s.lng + 2.2 * frac * Math.cos((s.headingDeg * Math.PI) / 180);
        const lat = s.lat + 1.4 * frac * Math.sin((s.headingDeg * Math.PI) / 180);
        const altitudeM = 10_000 + 1_500 * Math.sin(frac * Math.PI);
        const headingDeg = (s.headingDeg + 15 * Math.sin(frac * 2 * Math.PI) + 360) % 360;

        const telemetry = {
          assetKey,
          type: "aircraft",
          ts,
          geometry: { type: "Point", coordinates: [lng, lat] as [number, number] },
          altitudeM,
          velocityMS: s.velocityMS,
          headingDeg,
          source: "demo-air",
        };

        pointDocs.push(telemetry);
        const bucket = Math.floor(ts / 60_000);
        bucketDocs.push({
          _key: `${assetKey}__${bucket}`,
          bucket,
          ...telemetry,
        });
      }

      // Latest at "now"
      const latest = {
        assetKey,
        type: "aircraft",
        ts: now,
        geometry: { type: "Point", coordinates: [s.lng + 2.2, s.lat + 1.4] as [number, number] },
        altitudeM: 11_000,
        velocityMS: s.velocityMS,
        headingDeg: s.headingDeg,
        source: "demo-air",
      };
      latestDocs.push({ _key: assetKey, ...latest });
    }

    // Bulk upsert assets/latest + insert points + upsert buckets
    await db.query(
      `
FOR a IN @assets
  UPSERT { _key: a._key }
    INSERT a
    UPDATE a
  IN assets
      `,
      { assets: assetDocs },
    );
    await db.query(
      `
FOR t IN @latest
  UPSERT { _key: t._key }
    INSERT t
    UPDATE t
  IN telemetry_latest
      `,
      { latest: latestDocs },
    );
    await db.query(
      `
FOR p IN @points
  INSERT p INTO telemetry_points
      `,
      { points: pointDocs },
    );
    await db.query(
      `
FOR b IN @buckets
  UPSERT { _key: b._key }
    INSERT b
    UPDATE b
  IN telemetry_buckets
      `,
      { buckets: bucketDocs },
    );

    return { ok: true, inserted: assetDocs.length, window: { from: baseTs, to: now } };
  });

  // Dev convenience: seed demo vessels (AIS-like) near Iran/Persian Gulf
  app.post("/demo/seed-vessels", async () => {
    const db = createArangoAppDb();
    return await seedDemoVessels(db);
  });

  // Dev convenience: seed demo "actions" + strikes + airspace closures (idempotent by _key)
  app.post("/events/seed-demo-actions", async () => {
    const db = createArangoAppDb();
    const col = db.collection("events");

    const now = Date.now();
    const events = [
      {
        _key: "action_demo_us_1",
        kind: "action_us",
        tsStart: now - 50 * 60_000,
        tsEnd: now - 45 * 60_000,
        title: "US action (demo)",
        summary: "Synthetic demo action for timeline + overlay.",
        source: "demo",
        severity: 0.6,
        confidence: 0.4,
        tags: ["us", "action", "demo"],
        geometry: { type: "Point", coordinates: [44.5, 33.3] },
      },
      {
        _key: "action_demo_iran_1",
        kind: "action_iran",
        tsStart: now - 40 * 60_000,
        tsEnd: now - 35 * 60_000,
        title: "Iran action (demo)",
        summary: "Synthetic demo action for timeline + overlay.",
        source: "demo",
        severity: 0.7,
        confidence: 0.4,
        tags: ["iran", "action", "demo"],
        geometry: { type: "Point", coordinates: [51.4, 35.7] },
      },
      {
        _key: "strike_demo_1",
        kind: "strike",
        tsStart: now - 30 * 60_000,
        tsEnd: now - 30 * 60_000,
        title: "Strike (demo)",
        summary: "Synthetic strike marker.",
        source: "demo",
        severity: 0.9,
        confidence: 0.4,
        tags: ["strike", "demo"],
        geometry: { type: "Point", coordinates: [47.9, 30.5] },
      },
      {
        _key: "airspace_closure_demo_1",
        kind: "airspace_closure",
        jurisdiction: "IRN",
        tsStart: now - 25 * 60_000,
        tsEnd: now + 60 * 60_000,
        title: "Airspace closure (demo)",
        summary: "Synthetic restricted polygon.",
        source: "demo",
        severity: 0.5,
        confidence: 0.4,
        tags: ["airspace", "closure", "demo"],
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [53.921598, 37.198918],
              [54.800304, 37.392421],
              [55.511578, 37.964117],
              [56.180375, 37.935127],
              [56.619366, 38.121394],
              [57.330434, 38.029229],
              [58.436154, 37.522309],
              [59.234762, 37.412988],
              [60.377638, 36.527383],
              [61.123071, 36.491597],
              [61.210817, 35.650072],
              [60.803193, 34.404102],
              [60.52843, 33.676446],
              [60.9637, 33.528832],
              [60.536078, 32.981269],
              [60.863655, 32.18292],
              [60.941945, 31.548075],
              [61.699314, 31.379506],
              [61.781222, 30.73585],
              [60.874248, 29.829239],
              [61.369309, 29.303276],
              [61.771868, 28.699334],
              [62.72783, 28.259645],
              [62.755426, 27.378923],
              [63.233898, 27.217047],
              [63.316632, 26.756532],
              [61.874187, 26.239975],
              [61.497363, 25.078237],
              [59.616134, 25.380157],
              [58.525761, 25.609962],
              [57.397251, 25.739902],
              [56.970766, 26.966106],
              [56.492139, 27.143305],
              [55.72371, 26.964633],
              [54.71509, 26.480658],
              [53.493097, 26.812369],
              [52.483598, 27.580849],
              [51.520763, 27.86569],
              [50.852948, 28.814521],
              [50.115009, 30.147773],
              [49.57685, 29.985715],
              [48.941333, 30.31709],
              [48.567971, 29.926778],
              [48.014568, 30.452457],
              [48.004698, 30.985137],
              [47.685286, 30.984853],
              [47.849204, 31.709176],
              [47.334661, 32.469155],
              [46.109362, 33.017287],
              [45.416691, 33.967798],
              [45.64846, 34.748138],
              [46.151788, 35.093259],
              [46.07634, 35.677383],
              [45.420618, 35.977546],
              [44.77267, 37.17045],
              [44.225756, 37.971584],
              [44.421403, 38.281281],
              [44.109225, 39.428136],
              [44.79399, 39.713003],
              [44.952688, 39.335765],
              [45.457722, 38.874139],
              [46.143623, 38.741201],
              [46.50572, 38.770605],
              [47.685079, 39.508364],
              [48.060095, 39.582235],
              [48.355529, 39.288765],
              [48.010744, 38.794015],
              [48.634375, 38.270378],
              [48.883249, 38.320245],
              [49.199612, 37.582874],
              [50.147771, 37.374567],
              [50.842354, 36.872814],
              [52.264025, 36.700422],
              [53.82579, 36.965031],
              [53.921598, 37.198918],
            ],
          ],
        },
      },
    ];

    for (const e of events) {
      await col.save(e as any, { overwriteMode: "replace" });
    }

    return { ok: true, inserted: events.length, window: { from: now - 60 * 60_000, to: now + 60 * 60_000 } };
  });

  // V1: fetch multiple tracks efficiently (for playback track toggles)
  app.post("/viewport/tracks", async (req) => {
    const body = ViewportTracksSchema.parse(req.body);
    const endTs = body.endTs;
    const bucketMs = 60_000;
    const bucketMax = Math.floor(endTs / bucketMs);
    const bucketMin = bucketMax - Math.ceil(body.windowMs / bucketMs);

    const db = createArangoAppDb();
    const cursor = await db.query(
      `
LET keys = @assetKeys
FOR p IN telemetry_buckets
  FILTER p.assetKey IN keys
  FILTER p.bucket >= @bucketMin && p.bucket <= @bucketMax
  SORT p.assetKey ASC, p.ts ASC
  COLLECT assetKey = p.assetKey INTO grp = p
  LET points = (
    FOR g IN grp
      LIMIT @maxPointsPerAsset
      RETURN g.p
  )
  RETURN { assetKey, points }
      `,
      {
        assetKeys: body.assetKeys,
        bucketMin,
        bucketMax,
        maxPointsPerAsset: body.maxPointsPerAsset,
      },
    );

    const tracks = await cursor.all();
    return { endTs, windowMs: body.windowMs, tracks };
  });
}

