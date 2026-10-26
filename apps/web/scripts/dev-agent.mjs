import { spawn } from "node:child_process";

const child = spawn("pnpm", ["exec", "vite", "--host", "127.0.0.1"], {
  cwd: process.cwd(),
  env: { ...process.env, DOMO_AGENT_TEST_DB: "true" },
  stdio: "inherit",
  shell: process.platform === "win32",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}
child.on("exit", (code) => { process.exitCode = code ?? 1; });
