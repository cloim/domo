import { buildApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { createDb, runMigrations } from "./db/client.ts";

const config = loadConfig();
const { db } = createDb(config.databaseUrl);
await runMigrations(db);
const app = await buildApp({ db, config });
await app.listen({ port: config.port, host: "0.0.0.0" });
