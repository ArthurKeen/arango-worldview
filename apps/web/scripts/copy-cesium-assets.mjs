import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(process.cwd());
const destDir = path.join(projectRoot, "public", "cesium");

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  // In npm workspaces, dependencies may be hoisted to the repo root.
  // Resolve the installed Cesium package location instead of assuming node_modules layout.
  const cesiumPkgUrl = await import.meta.resolve?.("cesium/package.json");
  if (!cesiumPkgUrl) {
    throw new Error("Unable to resolve cesium/package.json");
  }

  const cesiumPkgPath = fileURLToPath(cesiumPkgUrl);
  const cesiumDir = path.dirname(cesiumPkgPath);
  const srcDir = path.join(cesiumDir, "Build", "Cesium");

  if (!(await exists(srcDir))) throw new Error(`Cesium build not found at ${srcDir}`);

  await fs.mkdir(destDir, { recursive: true });
  await fs.cp(srcDir, destDir, { recursive: true, force: true });
  // eslint-disable-next-line no-console
  console.log(`[cesium] copied assets to ${destDir}`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});

