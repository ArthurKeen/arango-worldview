export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function nowMs() {
  return Date.now();
}

export function parseBbox(
  bbox?: string,
): { west: number; south: number; east: number; north: number } | null {
  if (!bbox) return null;
  const parts = bbox.split(",").map((x) => Number(x.trim()));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return null;
  const [west, south, east, north] = parts as [number, number, number, number];
  return { west, south, east, north };
}

