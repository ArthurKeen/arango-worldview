import { env } from "./env.js";
import { sleep } from "./util.js";
import { ingestOpenSkyOnce } from "./opensky.js";
import { ingestCelesTrakTleSnapshot, tickSatellitesFromAssets } from "./celestrak.js";

async function main() {
  // Initial TLE snapshot so satellites exist.
  try {
    const { upserted } = await ingestCelesTrakTleSnapshot();
    // eslint-disable-next-line no-console
    console.log(`[sat] upserted assets: ${upserted}`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[sat] initial TLE snapshot failed", err);
  }

  // Main loop: poll OpenSky + tick satellites
  // (If OpenSky rate limits, this loop will throw; caller can restart or we can add backoff later.)
  while (true) {
    const started = Date.now();
    try {
      const { ingested } = await ingestOpenSkyOnce();
      // eslint-disable-next-line no-console
      console.log(`[air] ingested: ${ingested}`);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[air] ingest failed", err);
    }

    try {
      const { updated } = await tickSatellitesFromAssets();
      // eslint-disable-next-line no-console
      console.log(`[sat] tick updated: ${updated}`);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[sat] tick failed", err);
    }

    const elapsed = Date.now() - started;
    const wait = Math.max(1000, env.INGEST_TICK_MS - elapsed);
    await sleep(wait);
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});

