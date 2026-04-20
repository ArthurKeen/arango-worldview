// Must be evaluated before Cesium tries to resolve workers/assets.
if (typeof window !== "undefined") {
  (window as any).CESIUM_BASE_URL = "/cesium";
}

