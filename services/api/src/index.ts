import Fastify from "fastify";
import cors from "@fastify/cors";
import { env } from "./env.js";
import { bootstrapDatabase } from "./db.js";
import { registerRoutes } from "./routes.js";

async function main() {
  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: true,
    credentials: false,
  });

  await bootstrapDatabase();
  await registerRoutes(app);

  await app.listen({ host: env.API_HOST, port: env.API_PORT });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});

