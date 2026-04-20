"use client";

import "@/lib/cesiumBaseUrl";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Viewer,
  Entity,
  PolylineGraphics,
  BillboardGraphics,
  PointGraphics,
  LabelGraphics,
  PolygonGraphics,
  EllipseGraphics,
  WallGraphics,
  useCesium,
} from "resium";
import * as Cesium from "cesium";
import { useQuery } from "@tanstack/react-query";
import { API_URL, getJson, postJson } from "@/lib/api";
import { ViewportTracker } from "./ViewportTracker";
import IranBoundary from "@/data/boundaries/IRN.geo.json";

type AssetType = "aircraft" | "satellite" | "vessel";

type ViewportItem = {
  asset: { _key: string; type: string; name?: string; callsign?: string };
  telemetry: {
    assetKey: string;
    type: string;
    ts: number;
    geometry: { type: "Point"; coordinates: [number, number] };
    altitudeM?: number;
    headingDeg?: number;
    source: string;
  };
};

type SnapshotItem = {
  asset: { _key: string; type: string; name?: string; callsign?: string };
  telemetryAt: {
    assetKey: string;
    type: string;
    ts: number;
    geometry: { type: "Point"; coordinates: [number, number] };
    altitudeM?: number;
    headingDeg?: number;
    source: string;
  };
};

type GpsJammingEvent = {
  _key: string;
  kind: string;
  tsStart: number;
  tsEnd?: number;
  title?: string;
  severity?: number;
  geometry: { type: "Polygon"; coordinates: number[][][] };
};

type ActionEvent = {
  _key: string;
  kind: string;
  tsStart: number;
  tsEnd?: number;
  title?: string;
  severity?: number;
  jurisdiction?: string;
  geometry: any;
};

export function WorldViewApp() {
  const [bbox, setBbox] = useState<[number, number, number, number] | null>(null);
  const [showAircraft, setShowAircraft] = useState(true);
  const [showSatellites, setShowSatellites] = useState(true);
  const [showVessels, setShowVessels] = useState(true);
  const [showGpsJamming, setShowGpsJamming] = useState(true);
  const [showActions, setShowActions] = useState(true);
  const [selectedAssetKey, setSelectedAssetKey] = useState<string | null>(null);
  const [demoStatus, setDemoStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const [mode, setMode] = useState<"live" | "playback">("live");
  const [playbackTs, setPlaybackTs] = useState(() => Date.now());
  const [playSpeed, setPlaySpeed] = useState<1 | 5 | 15 | 60>(15);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showTracks, setShowTracks] = useState(false);
  const [trackWindow, setTrackWindow] = useState<15 | 30 | 60 | 180>(30);
  const [timelineWindowHours, setTimelineWindowHours] = useState<3 | 6 | 12>(6);
  const [flyToTarget, setFlyToTarget] = useState<ActionEvent | null>(null);

  const types = useMemo(() => {
    const t: AssetType[] = [];
    if (showAircraft) t.push("aircraft");
    if (showSatellites) t.push("satellite");
    if (showVessels) t.push("vessel");
    return t;
  }, [showAircraft, showSatellites, showVessels]);

  // Live mode: viewport query (latest telemetry)
  const viewportLiveQuery = useQuery({
    queryKey: ["viewport", bbox, types],
    enabled: mode === "live" && bbox != null && types.length > 0,
    queryFn: async () => {
      return await postJson<{ items: ViewportItem[] }>("/viewport/query", {
        bbox,
        types,
        minTs: Date.now() - 5 * 60_000,
        limit: 3000,
      });
    },
    refetchInterval: 5000,
  });

  // Playback mode: snapshot query at time t (time slider)
  const viewportSnapshotQuery = useQuery({
    queryKey: ["snapshot", bbox, types, playbackTs],
    enabled: mode === "playback" && bbox != null && types.length > 0,
    queryFn: async () => {
      return await postJson<{ items: SnapshotItem[] }>("/viewport/snapshot", {
        bbox,
        types,
        atTs: playbackTs,
        windowMs: 10 * 60_000,
        limit: 3000,
      });
    },
    refetchInterval: isPlaying ? 1000 : false,
  });

  const timelineRange = useQuery({
    queryKey: ["timeline-range"],
    queryFn: async () => getJson<any>("/timeline/range"),
    refetchInterval: 30_000,
  });

  const playbackBounds = useMemo(() => {
    // Prefer bucketed telemetry for playback range because playback renders from telemetry_buckets.
    const tb = timelineRange.data?.telemetry_buckets;
    if (!tb || typeof tb.minTs !== "number" || typeof tb.maxTs !== "number") return null;
    return { minTs: tb.minTs, maxTs: tb.maxTs };
  }, [timelineRange.data]);

  // When entering playback, jump to latest available time.
  useEffect(() => {
    if (mode !== "playback") return;
    if (!playbackBounds) return;
    setPlaybackTs(playbackBounds.maxTs);
  }, [mode, playbackBounds?.maxTs]);

  // Playback clock tick.
  useEffect(() => {
    if (!isPlaying || mode !== "playback") return;
    const id = window.setInterval(() => {
      setPlaybackTs((t) => t + playSpeed * 60_000); // minutes per second
    }, 1000);
    return () => window.clearInterval(id);
  }, [isPlaying, mode, playSpeed]);

  // Clamp/wrap playback time to available range.
  useEffect(() => {
    if (mode !== "playback") return;
    if (!playbackBounds) return;
    const { minTs, maxTs } = playbackBounds;

    if (playbackTs > maxTs) {
      // Wrap to start when playing; otherwise clamp.
      if (isPlaying) setPlaybackTs(minTs);
      else setPlaybackTs(maxTs);
    } else if (playbackTs < minTs) {
      setPlaybackTs(minTs);
    }
  }, [mode, playbackTs, isPlaying, timelineRange.data]);

  const viewportItems: ViewportItem[] = useMemo(() => {
    if (mode === "live") return viewportLiveQuery.data?.items ?? [];
    const snap = viewportSnapshotQuery.data?.items ?? [];
    return snap.map((s) => ({ asset: s.asset, telemetry: s.telemetryAt }));
  }, [mode, viewportLiveQuery.data, viewportSnapshotQuery.data]);

  const queryTsWindow = useMemo(() => {
    const atTs = mode === "playback" ? playbackTs : Date.now();
    const windowMs = 30 * 60_000;
    return { tsStart: atTs - windowMs, tsEnd: atTs + windowMs };
  }, [mode, playbackTs]);

  const actionsQueryTsWindow = useMemo(() => {
    const atTs = mode === "playback" ? playbackTs : Date.now();
    // Actions are comparatively sparse; use a much wider window so demo events
    // remain visible in live mode instead of disappearing after ~30 minutes.
    const windowMs = mode === "playback" ? 6 * 60 * 60_000 : 24 * 60 * 60_000;
    return { tsStart: atTs - windowMs, tsEnd: atTs + 30 * 60_000 };
  }, [mode, playbackTs]);

  const timelineEventsWindow = useMemo(() => {
    const atTs = mode === "playback" ? playbackTs : Date.now();
    const windowMs = timelineWindowHours * 60 * 60_000;
    return { tsStart: atTs - windowMs, tsEnd: atTs + 10 * 60_000 };
  }, [mode, playbackTs, timelineWindowHours]);

  const gpsJamming = useQuery({
    queryKey: ["events", "gps_jamming", bbox, queryTsWindow.tsStart, queryTsWindow.tsEnd, showGpsJamming],
    enabled: showGpsJamming && bbox != null,
    queryFn: async () => {
      return await postJson<{ events: GpsJammingEvent[] }>("/events/query", {
        bbox,
        tsStart: queryTsWindow.tsStart,
        tsEnd: queryTsWindow.tsEnd,
        kinds: ["gps_jamming"],
        limit: 2000,
      });
    },
    refetchInterval: mode === "live" ? 10_000 : 3_000,
  });

  const actions = useQuery({
    queryKey: ["events", "actions", bbox, actionsQueryTsWindow.tsStart, actionsQueryTsWindow.tsEnd, showActions],
    enabled: showActions && bbox != null,
    queryFn: async () => {
      return await postJson<{ events: ActionEvent[] }>("/events/query", {
        bbox,
        tsStart: actionsQueryTsWindow.tsStart,
        tsEnd: actionsQueryTsWindow.tsEnd,
        kinds: ["action_us", "action_iran", "strike", "airspace_closure"],
        limit: 500,
      });
    },
    refetchInterval: mode === "live" ? 10_000 : 3_000,
  });

  const timelineEvents = useQuery({
    queryKey: ["events", "timeline", bbox, timelineEventsWindow.tsStart, timelineEventsWindow.tsEnd, showActions, showGpsJamming],
    enabled: bbox != null && (showActions || showGpsJamming),
    queryFn: async () => {
      const kinds: string[] = [];
      if (showGpsJamming) kinds.push("gps_jamming");
      if (showActions) kinds.push("action_us", "action_iran", "strike", "airspace_closure", "maritime_disruption");
      return await postJson<{ events: ActionEvent[] }>("/events/query", {
        bbox,
        tsStart: timelineEventsWindow.tsStart,
        tsEnd: timelineEventsWindow.tsEnd,
        kinds,
        limit: 500,
      });
    },
    refetchInterval: mode === "live" ? 15_000 : 8_000,
  });

  const selectedAsset = useQuery({
    queryKey: ["asset", selectedAssetKey],
    enabled: selectedAssetKey != null,
    queryFn: async () => getJson<{ asset: any; telemetry: any }>(`/assets/${selectedAssetKey}`),
  });

  const selectedTrail = useQuery({
    queryKey: ["trail", selectedAssetKey],
    enabled: selectedAssetKey != null,
    queryFn: async () =>
      getJson<{ points: Array<{ geometry: { coordinates: [number, number] }; altitudeM?: number }> }>(
        `/assets/${selectedAssetKey}/trail?sinceTs=${(mode === "playback" ? playbackTs : Date.now()) - trackWindow * 60_000}&limit=2000`,
      ),
    refetchInterval: 5000,
  });

  const trailPositions = useMemo(() => {
    const pts = selectedTrail.data?.points ?? [];
    return pts.map((p) => Cesium.Cartesian3.fromDegrees(p.geometry.coordinates[0], p.geometry.coordinates[1], p.altitudeM ?? 0));
  }, [selectedTrail.data]);

  const viewportTracks = useQuery({
    queryKey: ["viewport-tracks", showTracks, mode, playbackTs, trackWindow, viewportItems.map((x) => x.telemetry.assetKey).slice(0, 200).join(",")],
    enabled: showTracks && viewportItems.length > 0,
    queryFn: async () => {
      const endTs = mode === "playback" ? playbackTs : Date.now();
      const assetKeys = viewportItems.slice(0, 200).map((x) => x.telemetry.assetKey);
      return await postJson<{ tracks: Array<{ assetKey: string; points: any[] }> }>("/viewport/tracks", {
        assetKeys,
        endTs,
        windowMs: trackWindow * 60_000,
        maxPointsPerAsset: Math.min(120, trackWindow * 2),
      });
    },
    refetchInterval: mode === "live" ? 10_000 : isPlaying ? 2_000 : 5_000,
  });

  const onPick = useCallback((assetKey: string) => setSelectedAssetKey(assetKey), []);

  const runDemo = useCallback(async (label: string, fn: () => Promise<unknown>) => {
    setDemoStatus(null);
    try {
      await fn();
      setDemoStatus({ kind: "ok", text: `${label} OK` });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setDemoStatus({
        kind: "error",
        text: `${label} failed. API at ${API_URL}\n${msg}`,
      });
    }
  }, []);

  const baseLayer = useMemo(() => {
    const provider = new Cesium.UrlTemplateImageryProvider({
      // Satellite imagery base.
      url: "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      credit: "Tiles © Esri",
    });
    const layer = new Cesium.ImageryLayer(provider, {
      alpha: 1.0,
      brightness: 1.08,
      contrast: 1.08,
      saturation: 1.12,
      gamma: 1.0,
    });
    return layer;
  }, []);

  const labelsLayer = useMemo(() => {
    // Labels/boundaries overlay for satellite imagery.
    const provider = new Cesium.UrlTemplateImageryProvider({
      url: "https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
      credit: "Labels © Esri",
    });
    return new Cesium.ImageryLayer(provider, {
      alpha: 0.9,
      brightness: 1.0,
      contrast: 1.05,
      gamma: 1.0,
    });
  }, []);

  return (
    <div className="h-dvh w-dvw overflow-hidden">
      <div className="absolute left-4 top-4 z-10 w-[320px] rounded-lg border border-white/10 bg-black/70 p-4 text-sm text-white backdrop-blur">
        <div className="text-base font-semibold">WorldView-Arango</div>
        <div className="mt-1 text-xs text-white/70">Viewport-driven globe backed by ArangoDB</div>

        <div className="mt-4 flex gap-2 text-xs">
          <button
            className={`rounded-md px-3 py-1.5 ${mode === "live" ? "bg-white/15" : "bg-white/5 hover:bg-white/10"}`}
            onClick={() => {
              setMode("live");
              setIsPlaying(false);
            }}
          >
            LIVE
          </button>
          <button
            className={`rounded-md px-3 py-1.5 ${mode === "playback" ? "bg-white/15" : "bg-white/5 hover:bg-white/10"}`}
            onClick={() => {
              setMode("playback");
              setIsPlaying(false);
              setPlaybackTs(playbackBounds?.maxTs ?? Date.now());
            }}
          >
            PLAYBACK
          </button>
        </div>

        {mode === "playback" && (
          <div className="mt-3 space-y-2">
            {!playbackBounds && (
              <div className="rounded-md border border-white/10 bg-white/5 p-2 text-xs text-white/70">
                No telemetry history yet (aircraft/satellites/vessels). Start the ingest workers (or click “Seed vessels”) and
                wait ~30s, then reopen Playback.
              </div>
            )}
            <input
              type="range"
              min={playbackBounds?.minTs ?? Date.now() - 24 * 60 * 60_000}
              max={playbackBounds?.maxTs ?? Date.now()}
              value={playbackTs}
              onChange={(e) => setPlaybackTs(Number(e.target.value))}
              className="w-full"
              disabled={!playbackBounds}
            />
            <div className="flex items-center justify-between text-xs text-white/70">
              <div>{new Date(playbackTs).toLocaleString()}</div>
              <div className="flex items-center gap-2">
                <select
                  className="rounded-md bg-white/5 px-2 py-1"
                  value={playSpeed}
                  onChange={(e) => setPlaySpeed(Number(e.target.value) as any)}
                  disabled={!playbackBounds}
                >
                  <option value={1}>1m/s</option>
                  <option value={5}>5m/s</option>
                  <option value={15}>15m/s</option>
                  <option value={60}>60m/s</option>
                </select>
                <button
                  className="rounded-md bg-white/10 px-2 py-1 hover:bg-white/15"
                  onClick={() => setIsPlaying((p) => !p)}
                  disabled={!playbackBounds}
                >
                  {isPlaying ? "Pause" : "Play"}
                </button>
              </div>
            </div>

            {/* Region-first marker strip aligned to the time slider */}
            <TimelineStrip
              events={timelineEvents.data?.events ?? []}
              tsStart={timelineEventsWindow.tsStart}
              tsEnd={timelineEventsWindow.tsEnd}
              onSelect={(e) => {
                setMode("playback");
                setPlaybackTs(e.tsStart);
                setFlyToTarget(e);
              }}
            />
            <div className="flex items-center justify-between text-[11px] text-white/60">
              <span>Markers: {timelineEvents.data?.events?.length ?? 0}</span>
              <select
                className="rounded-md bg-white/5 px-2 py-1"
                value={timelineWindowHours}
                onChange={(e) => setTimelineWindowHours(Number(e.target.value) as any)}
              >
                <option value={3}>3h</option>
                <option value={6}>6h</option>
                <option value={12}>12h</option>
              </select>
            </div>
          </div>
        )}

        <div className="mt-4 space-y-2">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={showAircraft} onChange={(e) => setShowAircraft(e.target.checked)} />
            <span>Aircraft</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={showSatellites} onChange={(e) => setShowSatellites(e.target.checked)} />
            <span>Satellites</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={showVessels} onChange={(e) => setShowVessels(e.target.checked)} />
            <span>Vessels</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={showGpsJamming} onChange={(e) => setShowGpsJamming(e.target.checked)} />
            <span>GPS jamming tiles</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={showActions} onChange={(e) => setShowActions(e.target.checked)} />
            <span>Actions / strikes / closures</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={showTracks} onChange={(e) => setShowTracks(e.target.checked)} />
            <span>Tracks (max 200)</span>
          </label>
          {showTracks && (
            <label className="flex items-center justify-between gap-2 text-xs text-white/80">
              <span>Track length</span>
              <select
                className="rounded-md bg-white/5 px-2 py-1"
                value={trackWindow}
                onChange={(e) => setTrackWindow(Number(e.target.value) as any)}
              >
                <option value={15}>15m</option>
                <option value={30}>30m</option>
                <option value={60}>60m</option>
                <option value={180}>3h</option>
              </select>
            </label>
          )}
        </div>

        <div className="mt-4 space-y-1 text-xs text-white/70">
          <div>Items: {viewportItems.length}</div>
          <div>BBox: {bbox ? bbox.map((n) => n.toFixed(2)).join(", ") : "—"}</div>
        </div>

        <div className="mt-4 border-t border-white/10 pt-3 text-xs">
          <div className="text-white/70">Demo data</div>
          {demoStatus && (
            <div
              className={`mt-2 whitespace-pre-wrap rounded-md border px-2 py-1 text-[11px] ${
                demoStatus.kind === "ok"
                  ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
                  : "border-rose-400/30 bg-rose-400/10 text-rose-100"
              }`}
            >
              {demoStatus.text}
            </div>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              className="rounded-md bg-white/10 px-2 py-1 hover:bg-white/15"
              onClick={async () => {
                await runDemo("Seed jamming", () => postJson("/events/seed-demo-gps-jamming", {}));
              }}
            >
              Seed jamming
            </button>
            <button
              className="rounded-md bg-white/10 px-2 py-1 hover:bg-white/15"
              onClick={async () => {
                await runDemo("Seed aircraft", () => postJson("/demo/seed-aircraft", {}));
              }}
            >
              Seed aircraft
            </button>
            <button
              className="rounded-md bg-white/10 px-2 py-1 hover:bg-white/15"
              onClick={async () => {
                await runDemo("Seed actions", () => postJson("/events/seed-demo-actions", {}));
              }}
            >
              Seed actions
            </button>
            <button
              className="rounded-md bg-white/10 px-2 py-1 hover:bg-white/15"
              onClick={async () => {
                await runDemo("Seed vessels", () => postJson("/demo/seed-vessels", {}));
              }}
            >
              Seed vessels
            </button>
          </div>
        </div>

        <div className="mt-4 border-t border-white/10 pt-3">
          <div className="text-xs font-semibold text-white/80">Selected</div>
          <div className="mt-1 text-xs text-white/70">{selectedAssetKey ?? "—"}</div>
          {selectedAsset.data?.asset && (
            <div className="mt-2 text-xs">
              <div className="font-medium">{selectedAsset.data.asset.name ?? selectedAsset.data.asset._key}</div>
              <div className="text-white/70">{selectedAsset.data.asset.type}</div>
            </div>
          )}
          {selectedAssetKey && (
            <button
              className="mt-3 w-full rounded-md bg-white/10 px-3 py-2 text-xs hover:bg-white/15"
              onClick={() => setSelectedAssetKey(null)}
            >
              Clear selection
            </button>
          )}
        </div>

      </div>

      <Viewer
        full
        animation={false}
        timeline={false}
        homeButton={false}
        baseLayerPicker={false}
        geocoder={false}
        sceneModePicker={false}
        navigationHelpButton={false}
        infoBox={false}
        selectionIndicator={false}
        shouldAnimate={true}
        // Resium uses Cesium Viewer "baseLayer" (NOT "imageryProvider") for custom imagery.
        baseLayer={baseLayer}
      >
        <SceneTweaks />
        <ImageryOverlay layer={labelsLayer} />
        <FlyToEventEffect event={flyToTarget} onDone={() => setFlyToTarget(null)} />
        <CameraControls />
        {/* Updates bbox whenever the camera move ends */}
        <ViewportTracker onBbox={setBbox} />

        {(gpsJamming.data?.events ?? []).map((e) => {
          const coords = e.geometry.coordinates?.[0];
          if (!coords || coords.length < 4) return null;
          const sev = typeof e.severity === "number" ? e.severity : 0.5;
          // A smoother, less "ugly tiles" look:
          // render each cell as a soft, ground-clamped ellipse instead of hard-edged hexes.
          const base = sev >= 0.85 ? Cesium.Color.fromCssColorString("#FF1744") : sev >= 0.6 ? Cesium.Color.fromCssColorString("#FF9100") : Cesium.Color.fromCssColorString("#FFEA00");
          const alpha = Math.min(0.42, 0.16 + sev * 0.22);

          // Centroid (simple ring-average is fine for these small convex demo cells).
          const n = coords.length - 1; // last repeats first
          let lngSum = 0;
          let latSum = 0;
          for (let i = 0; i < n; i++) {
            lngSum += coords[i]![0];
            latSum += coords[i]![1];
          }
          const lng = lngSum / Math.max(1, n);
          const lat = latSum / Math.max(1, n);
          const center = Cesium.Cartesian3.fromDegrees(lng, lat, 0);

          // Approximate cell radius in meters from max vertex distance to centroid.
          const vertexCarts = coords.slice(0, n).map(([x, y]) => Cesium.Cartesian3.fromDegrees(x, y, 0));
          let r = 12_000;
          for (const v of vertexCarts) r = Math.max(r, Cesium.Cartesian3.distance(center, v));

          return (
            <Entity key={e._key} name={e.title ?? e._key} position={center}>
              <EllipseGraphics
                semiMajorAxis={r * 1.05}
                semiMinorAxis={r * 1.05}
                material={base.withAlpha(alpha)}
                height={0}
                heightReference={Cesium.HeightReference.CLAMP_TO_GROUND}
                outline={false}
              />
            </Entity>
          );
        })}

        {(actions.data?.events ?? []).map((e) => {
          const sev = typeof e.severity === "number" ? e.severity : 0.6;
          const color =
            e.kind === "strike"
              ? Cesium.Color.RED
              : e.kind === "action_iran"
                ? Cesium.Color.MAGENTA
                : e.kind === "action_us"
                  ? Cesium.Color.AQUA
                  : Cesium.Color.ORANGE;

          if (e.geometry?.type === "Point") {
            const [lng, lat] = e.geometry.coordinates as [number, number];
            const pos = Cesium.Cartesian3.fromDegrees(lng, lat, 0);
            return (
              <Entity key={e._key} name={e.title ?? e._key} position={pos}>
                <PointGraphics
                  pixelSize={16}
                  color={color.withAlpha(0.95)}
                  outlineColor={Cesium.Color.WHITE.withAlpha(0.95)}
                  outlineWidth={3}
                  disableDepthTestDistance={1.0e7}
                />
                <LabelGraphics
                  text={e.title ?? e.kind}
                  font="13px sans-serif"
                  fillColor={Cesium.Color.WHITE}
                  outlineColor={Cesium.Color.BLACK}
                  outlineWidth={2}
                  pixelOffset={new Cesium.Cartesian2(10, -10)}
                  showBackground={true}
                  backgroundColor={Cesium.Color.BLACK.withAlpha(0.55)}
                  scale={1.0}
                  disableDepthTestDistance={1.0e7}
                />
              </Entity>
            );
          }

          if (e.geometry?.type === "Polygon") {
            const coords = e.geometry.coordinates?.[0];
            if (!coords || coords.length < 4) return null;
            // "No-fly zone" look: transparent interior + low 3D fence at boundary.
            // For now, we treat `airspace_closure` polygons as no-fly zones.
            const isNoFlyZone = e.kind === "airspace_closure";

            // If a zone is specified by jurisdiction, prefer the country boundary over whatever
            // coarse polygon might be attached to the event (e.g. demo rectangles).
            const jurisdictionRing =
              isNoFlyZone && e.jurisdiction === "IRN"
                ? (IranBoundary as any)?.features?.[0]?.geometry?.coordinates?.[0]
                : null;

            const ring = (jurisdictionRing ?? coords) as Array<[number, number]>;
            const positions = ring.map(([lng, lat]) => Cesium.Cartesian3.fromDegrees(lng, lat));
            const fenceHeightM = 8_000; // low wall (visually clear without becoming a skyscraper)

            // Satellite imagery has lots of warm/brown terrain; orange blends in.
            // Use neon, "synthetic" colors + glow to keep zones legible everywhere.
            const nfzFill = Cesium.Color.fromCssColorString("#00E5FF").withAlpha(0.14); // cyan
            const nfzEdge = Cesium.Color.fromCssColorString("#FF2FD6").withAlpha(0.95); // hot magenta
            const nfzEdgeGlow = Cesium.Color.WHITE.withAlpha(0.85);
            return (
              <Entity key={e._key} name={e.title ?? e._key}>
                <PolygonGraphics
                  hierarchy={positions}
                  material={
                    isNoFlyZone
                      ? nfzFill
                      : color.withAlpha(0.12 + Math.min(0.25, sev * 0.2))
                  }
                  outline={true}
                  outlineColor={(isNoFlyZone ? Cesium.Color.BLACK : color).withAlpha(isNoFlyZone ? 0.95 : 0.9)}
                />
                {isNoFlyZone && (
                  <WallGraphics
                    positions={positions}
                    minimumHeights={positions.map(() => 0)}
                    maximumHeights={positions.map(() => fenceHeightM)}
                    material={
                      new Cesium.StripeMaterialProperty({
                        evenColor: nfzEdge.withAlpha(0.65),
                        oddColor: nfzFill.withAlpha(0.45),
                        repeat: 48,
                        offset: 0,
                      })
                    }
                    outline={true}
                    outlineColor={Cesium.Color.BLACK.withAlpha(0.85)}
                  />
                )}
                {isNoFlyZone && (
                  <PolylineGraphics
                    positions={positions}
                    width={4}
                    material={
                      new Cesium.PolylineGlowMaterialProperty({
                        color: nfzEdgeGlow,
                        glowPower: 0.22,
                      })
                    }
                    clampToGround={true}
                  />
                )}
                {isNoFlyZone && (
                  <PolylineGraphics
                    positions={positions}
                    width={2}
                    material={nfzEdge}
                    clampToGround={true}
                  />
                )}
              </Entity>
            );
          }

          return null;
        })}

        {(viewportTracks.data?.tracks ?? []).map((t) => {
          if (!t.points || t.points.length < 2) return null;
          const safe = (t.points as any[])
            .filter((p) => p && p.geometry && Array.isArray(p.geometry.coordinates) && p.geometry.coordinates.length === 2)
            .map((p) => {
              const [lng, lat] = p.geometry.coordinates as [number, number];
              const alt = p.altitudeM ?? 0;
              return Cesium.Cartesian3.fromDegrees(lng, lat, alt);
            });
          if (safe.length < 2) return null;

          // Color by asset type (we can infer from key prefix)
          const isSat = t.assetKey.startsWith("sat_");
          const isVessel = t.assetKey.startsWith("vessel_");
          const color = isVessel
            ? Cesium.Color.LIME.withAlpha(0.35)
            : isSat
              ? Cesium.Color.CYAN.withAlpha(0.4)
              : Cesium.Color.WHITE.withAlpha(0.25);

          return (
            <Entity key={`track_${t.assetKey}`} name={`track_${t.assetKey}`}>
              <PolylineGraphics positions={safe} width={1.5} material={color} />
            </Entity>
          );
        })}

        {viewportItems.map((it) => {
          const [lng, lat] = it.telemetry.geometry.coordinates;
          const alt = it.telemetry.altitudeM ?? 0;
          const pos = Cesium.Cartesian3.fromDegrees(lng, lat, alt);
          const isSelected = selectedAssetKey === it.telemetry.assetKey;
          const isSat = it.telemetry.type === "satellite";
          const isVessel = it.telemetry.type === "vessel";
          const icon = isVessel ? "/icons/vessel.svg" : isSat ? "/icons/satellite.svg" : "/icons/aircraft.svg";
          const color = isVessel
            ? Cesium.Color.LIME
            : isSat
              ? Cesium.Color.CYAN
              : Cesium.Color.WHITE;
          const rotationRad =
            !isVessel && !isSat && typeof it.telemetry.headingDeg === "number"
              ? Cesium.Math.toRadians(it.telemetry.headingDeg)
              : 0;

          return (
            <Entity
              key={it.telemetry.assetKey}
              name={it.asset.name ?? it.telemetry.assetKey}
              position={pos}
              onClick={() => onPick(it.telemetry.assetKey)}
            >
              {/* halo for readability */}
              <PointGraphics
                pixelSize={isVessel ? (isSelected ? 22 : 18) : isSelected ? 14 : 11}
                color={Cesium.Color.BLACK.withAlpha(0.35)}
                disableDepthTestDistance={1.0e7}
              />
              {isVessel && (
                <PointGraphics
                  pixelSize={isSelected ? 14 : 11}
                  color={Cesium.Color.LIME.withAlpha(0.95)}
                  outlineColor={Cesium.Color.WHITE.withAlpha(0.95)}
                  outlineWidth={2}
                  disableDepthTestDistance={1.0e7}
                />
              )}
              <BillboardGraphics
                image={icon}
                scale={isVessel ? (isSelected ? 0.95 : 0.8) : isSelected ? 0.7 : 0.55}
                scaleByDistance={new Cesium.NearFarScalar(1.0e6, 0.6, 4.0e7, 0.22)}
                translucencyByDistance={new Cesium.NearFarScalar(1.0e6, 1.0, 4.0e7, 0.35)}
                color={color}
                rotation={rotationRad}
                alignedAxis={Cesium.Cartesian3.UNIT_Z}
                disableDepthTestDistance={1.0e7}
                verticalOrigin={Cesium.VerticalOrigin.CENTER}
                horizontalOrigin={Cesium.HorizontalOrigin.CENTER}
              />
              {isSelected && (
                <LabelGraphics
                  text={it.asset.name ?? it.telemetry.assetKey}
                  font="14px sans-serif"
                  fillColor={Cesium.Color.WHITE}
                  outlineColor={Cesium.Color.BLACK}
                  outlineWidth={2}
                  pixelOffset={new Cesium.Cartesian2(12, -12)}
                  showBackground={true}
                  backgroundColor={Cesium.Color.BLACK.withAlpha(0.6)}
                />
              )}
              {isVessel && !isSelected && (
                <LabelGraphics
                  text={it.asset.name ?? it.telemetry.assetKey}
                  font="12px sans-serif"
                  fillColor={Cesium.Color.WHITE}
                  outlineColor={Cesium.Color.BLACK}
                  outlineWidth={2}
                  pixelOffset={new Cesium.Cartesian2(10, -10)}
                  showBackground={true}
                  backgroundColor={Cesium.Color.BLACK.withAlpha(0.45)}
                  scale={0.85}
                  disableDepthTestDistance={1.0e7}
                />
              )}
            </Entity>
          );
        })}

        {selectedAssetKey && trailPositions.length > 1 && (
          <Entity name="trail">
            <PolylineGraphics positions={trailPositions} width={2} material={Cesium.Color.ORANGE.withAlpha(0.8)} />
          </Entity>
        )}
      </Viewer>
    </div>
  );
}

function SceneTweaks() {
  const { viewer } = useCesium();

  // Reduce atmospheric wash so political borders/labels are more legible.
  // (Purely visual; does not affect data overlays.)
  useEffect(() => {
    if (!viewer) return;
    viewer.scene.globe.enableLighting = false;
    viewer.scene.globe.showGroundAtmosphere = false;
    if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = false;
    viewer.scene.fog.enabled = false;

    // Make tiles a bit sharper (more detail when zooming in).
    viewer.scene.globe.maximumScreenSpaceError = 1.5;

    // Explicitly enable and tune zoom controls.
    // This also makes trackpad scroll and pinch-zoom feel more responsive.
    const c = viewer.scene.screenSpaceCameraController;
    c.enableZoom = true;
    c.enableLook = true;
    c.enableRotate = true;
    c.enableTilt = true;
    c.enableTranslate = true;
    c.zoomEventTypes = [
      Cesium.CameraEventType.WHEEL,
      Cesium.CameraEventType.PINCH,
      Cesium.CameraEventType.RIGHT_DRAG,
    ];
    c.minimumZoomDistance = 50; // meters (lets you get close to the ground)
    c.maximumZoomDistance = 50_000_000; // meters (lets you zoom far out)
    c.inertiaZoom = 0.8;
    c.zoomFactor = 2.0;

    const canvas = viewer.scene.canvas as HTMLCanvasElement;
    canvas.style.touchAction = "none";

    // Desktop trackpad pinch is often intercepted by the browser instead of being
    // forwarded to Cesium. Handle the browser-level gesture/wheel variants here.
    let lastGestureScale = 1;
    const zoomByFraction = (direction: 1 | -1, strength: number) => {
      const height = viewer.camera.positionCartographic.height;
      const amount = Math.max(250, height * strength);
      if (direction > 0) viewer.camera.zoomIn(amount);
      else viewer.camera.zoomOut(amount);
    };

    const onGestureStart = (evt: Event) => {
      evt.preventDefault();
      lastGestureScale = (evt as Event & { scale?: number }).scale ?? 1;
    };

    const onGestureChange = (evt: Event) => {
      evt.preventDefault();
      const scale = (evt as Event & { scale?: number }).scale ?? 1;
      const ratio = scale / Math.max(0.001, lastGestureScale);
      if (ratio > 1.01) zoomByFraction(1, Math.min(0.18, (ratio - 1) * 0.35));
      else if (ratio < 0.99) zoomByFraction(-1, Math.min(0.18, (1 - ratio) * 0.35));
      lastGestureScale = scale;
    };

    const onWheel = (evt: WheelEvent) => {
      // macOS pinch often arrives as ctrl+wheel. Prevent page zoom and map it to camera zoom.
      if (!evt.ctrlKey) return;
      evt.preventDefault();
      if (evt.deltaY < 0) zoomByFraction(1, Math.min(0.2, Math.abs(evt.deltaY) * 0.0025));
      else if (evt.deltaY > 0) zoomByFraction(-1, Math.min(0.2, Math.abs(evt.deltaY) * 0.0025));
    };

    canvas.addEventListener("gesturestart", onGestureStart as EventListener, { passive: false });
    canvas.addEventListener("gesturechange", onGestureChange as EventListener, { passive: false });
    canvas.addEventListener("wheel", onWheel, { passive: false });

    // Default camera focus: Iran / Persian Gulf region (matches your current interests).
    // Only run once per page load.
    const anyWindow = window as any;
    if (!anyWindow.__WORLDVIEW_DID_FLYTO) {
      anyWindow.__WORLDVIEW_DID_FLYTO = true;
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(52.0, 30.5, 2_500_000),
        duration: 1.2,
      });
    }

    return () => {
      canvas.removeEventListener("gesturestart", onGestureStart as EventListener);
      canvas.removeEventListener("gesturechange", onGestureChange as EventListener);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, [viewer]);

  return null;
}

function ImageryOverlay({ layer }: { layer: Cesium.ImageryLayer }) {
  const { viewer } = useCesium();

  useEffect(() => {
    if (!viewer) return;
    // Capture the viewer reference used to add the layer so cleanup doesn't
    // accidentally run against a newer (or already-destroyed) viewer instance.
    const v = viewer;
    v.imageryLayers.add(layer);
    return () => {
      try {
        // During hot reload/unmount, Cesium can destroy the Viewer before React runs cleanups.
        if (typeof (v as any).isDestroyed === "function" && (v as any).isDestroyed()) return;
        v.imageryLayers.remove(layer, false);
      } catch {
        // ignore teardown errors
      }
    };
  }, [viewer, layer]);

  return null;
}

function TimelineStrip({
  events,
  tsStart,
  tsEnd,
  onSelect,
}: {
  events: ActionEvent[];
  tsStart: number;
  tsEnd: number;
  onSelect: (e: ActionEvent) => void;
}) {
  const span = Math.max(1, tsEnd - tsStart);
  const markers = events
    .filter((e) => typeof e.tsStart === "number" && e.tsStart >= tsStart && e.tsStart <= tsEnd)
    .slice()
    .sort((a, b) => a.tsStart - b.tsStart)
    .slice(0, 200);

  const colorForKind = (kind: string) => {
    switch (kind) {
      case "gps_jamming":
        return "bg-red-500/80";
      case "strike":
        return "bg-rose-500/80";
      case "airspace_closure":
        return "bg-orange-400/80";
      case "action_iran":
        return "bg-fuchsia-400/80";
      case "action_us":
        return "bg-cyan-300/80";
      case "maritime_disruption":
        return "bg-lime-300/80";
      default:
        return "bg-white/70";
    }
  };

  return (
    <div className="mt-2">
      <div className="relative h-4 w-full rounded bg-white/10">
        {markers.map((e) => {
          const pct = ((e.tsStart - tsStart) / span) * 100;
          const cls = colorForKind(e.kind);
          const title = `${new Date(e.tsStart).toLocaleString()} — ${e.kind}: ${e.title ?? e._key}`;
          return (
            <button
              key={e._key}
              className={`absolute top-0 h-4 w-[6px] -translate-x-1/2 rounded ${cls} hover:brightness-125`}
              style={{ left: `${pct}%` }}
              title={title}
              onClick={() => onSelect(e)}
            />
          );
        })}
      </div>
    </div>
  );
}

function flyToEvent(viewer: Cesium.Viewer | null, e: ActionEvent) {
  if (!viewer) return;
  const g = e.geometry;
  if (!g) return;

  try {
    if (g.type === "Point" && Array.isArray(g.coordinates) && g.coordinates.length === 2) {
      const [lng, lat] = g.coordinates as [number, number];
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(lng, lat, 1_250_000),
        duration: 0.9,
      });
      return;
    }

    if (g.type === "Polygon" && Array.isArray(g.coordinates) && Array.isArray(g.coordinates[0])) {
      const ring = g.coordinates[0] as Array<[number, number]>;
      const lons = ring.map((p) => p[0]);
      const lats = ring.map((p) => p[1]);
      if (lons.length === 0 || lats.length === 0) return;
      const rect = Cesium.Rectangle.fromDegrees(
        Math.min(...lons),
        Math.min(...lats),
        Math.max(...lons),
        Math.max(...lats),
      );
      viewer.camera.flyTo({ destination: rect, duration: 0.9 });
    }
  } catch {
    // ignore flyTo failures
  }
}

function FlyToEventEffect({
  event,
  onDone,
}: {
  event: ActionEvent | null;
  onDone: () => void;
}) {
  const { viewer } = useCesium();

  useEffect(() => {
    if (!event) return;
    flyToEvent(viewer ?? null, event);
    onDone();
  }, [event, viewer, onDone]);

  return null;
}

function CameraControls() {
  const { viewer } = useCesium();

  const act = (fn: (v: Cesium.Viewer) => void) => {
    if (!viewer) return;
    try {
      fn(viewer);
    } catch {
      // ignore camera control failures
    }
  };

  return (
    <div className="pointer-events-none absolute bottom-4 right-4 z-10 flex flex-col gap-2">
      <div className="pointer-events-auto rounded-lg border border-white/10 bg-black/60 p-2 text-xs text-white backdrop-blur">
        <div className="grid grid-cols-2 gap-2">
          <button
            className="rounded-md bg-white/10 px-2 py-1 hover:bg-white/15"
            onClick={() => act((v) => v.camera.zoomIn(250_000))}
            title="Zoom in"
          >
            +
          </button>
          <button
            className="rounded-md bg-white/10 px-2 py-1 hover:bg-white/15"
            onClick={() => act((v) => v.camera.zoomOut(250_000))}
            title="Zoom out"
          >
            –
          </button>
          <button
            className="rounded-md bg-white/10 px-2 py-1 hover:bg-white/15"
            onClick={() => act((v) => v.camera.rotateUp(Cesium.Math.toRadians(6)))}
            title="Tilt up"
          >
            Tilt↑
          </button>
          <button
            className="rounded-md bg-white/10 px-2 py-1 hover:bg-white/15"
            onClick={() => act((v) => v.camera.rotateDown(Cesium.Math.toRadians(6)))}
            title="Tilt down"
          >
            Tilt↓
          </button>
          <button
            className="col-span-2 rounded-md bg-white/10 px-2 py-1 hover:bg-white/15"
            onClick={() =>
              act((v) =>
                v.camera.flyTo({
                  destination: Cesium.Cartesian3.fromDegrees(52.0, 30.5, 2_500_000),
                  duration: 0.9,
                }),
              )
            }
            title="Focus Iran/Persian Gulf"
          >
            Focus Iran
          </button>
          <button
            className="col-span-2 rounded-md bg-white/10 px-2 py-1 hover:bg-white/15"
            onClick={() =>
              act((v) =>
                v.camera.flyTo({
                  destination: Cesium.Cartesian3.fromDegrees(54.8, 26.6, 1_100_000),
                  duration: 0.9,
                }),
              )
            }
            title="Focus Persian Gulf / Strait of Hormuz"
          >
            Focus Gulf
          </button>
          <button
            className="col-span-2 rounded-md bg-white/10 px-2 py-1 hover:bg-white/15"
            onClick={() => act((v) => v.camera.setView({ orientation: { heading: 0, pitch: v.camera.pitch, roll: 0 } }))}
            title="Reset north-up"
          >
            North up
          </button>
        </div>
        <div className="mt-2 text-[11px] text-white/60">
          Trackpad: 2-finger scroll zoom • pinch zoom • click-drag rotate
        </div>
      </div>
    </div>
  );
}

