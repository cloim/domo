import { buildApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { createDb, runMigrations } from "./db/client.ts";
import { generateRecurring } from "./routes/recurring.ts";

const config = loadConfig();
const { db } = createDb(config.databaseUrl);
await runMigrations(db);
const app = await buildApp({ db, config });
await app.listen({ port: config.port, host: "0.0.0.0" });

// 고정지출: 기동 시 놓친 달을 채우고, 이후 10분마다 결제일이 된 항목을 만든다.
const RECURRING_INTERVAL_MS = 10 * 60 * 1000;
const runRecurring = () =>
  generateRecurring(db)
    .then((n) => n > 0 && app.log.info({ created: n }, "고정지출 기록 생성"))
    .catch((err) => app.log.error(err, "고정지출 생성 실패"));
await runRecurring();
setInterval(runRecurring, RECURRING_INTERVAL_MS);
