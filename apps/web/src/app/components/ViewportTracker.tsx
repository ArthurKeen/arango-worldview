"use client";

import { useCesium } from "resium";
import { useEffect } from "react";

function radToDeg(r: number) {
  return (r * 180) / Math.PI;
}

export function ViewportTracker({
  onBbox,
}: {
  onBbox: (bbox: [number, number, number, number] | null) => void;
}) {
  const { viewer } = useCesium();

  useEffect(() => {
    if (!viewer) return;

    const handle = () => {
      const rect = viewer.camera.computeViewRectangle(viewer.scene.globe.ellipsoid);
      if (!rect) {
        onBbox(null);
        return;
      }

      const west = radToDeg(rect.west);
      const south = radToDeg(rect.south);
      const east = radToDeg(rect.east);
      const north = radToDeg(rect.north);

      // Normalize to [-180, 180] where possible
      const norm = (x: number) => {
        let v = x;
        while (v > 180) v -= 360;
        while (v < -180) v += 360;
        return v;
      };

      onBbox([norm(west), south, norm(east), north]);
    };

    viewer.camera.moveEnd.addEventListener(handle);
    // Initial bbox
    handle();

    return () => {
      viewer.camera.moveEnd.removeEventListener(handle);
    };
  }, [viewer, onBbox]);

  return null;
}

