export type AssetType = "aircraft" | "satellite" | "vessel" | "facility" | "event_source";

export type GeoJsonPoint = {
  type: "Point";
  coordinates: [number, number]; // [lng, lat]
};

export type Asset = {
  _key: string;
  type: AssetType;
  name?: string;
  callsign?: string;
  icao24?: string;
  noradId?: number;
  operator?: string;
  country?: string;
  tags?: string[];
  createdAt: number;
  updatedAt: number;
};

export type TelemetryLatest = {
  assetKey: string;
  type: AssetType;
  ts: number;
  geometry: GeoJsonPoint;
  altitudeM?: number;
  velocityMS?: number;
  headingDeg?: number;
  source: string;
};

export type TelemetryPoint = TelemetryLatest;

export type ViewportQueryRequest = {
  bbox: [number, number, number, number]; // [west,south,east,north]
  types: AssetType[];
  minTs?: number;
  limit?: number;
};

export type ViewportQueryResponseItem = {
  asset: Asset;
  telemetry: TelemetryLatest;
};

export type ViewportQueryResponse = {
  items: ViewportQueryResponseItem[];
};

