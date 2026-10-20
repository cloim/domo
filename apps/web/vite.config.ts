import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import pkg from "../../package.json" with { type: "json" };

export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  server: {
    port: 5173,
    // 개발 API(4310, domo_dev DB)로 보낸다. 운영 서버(4300)로 보내지 않는다.
    proxy: { "/api": "http://localhost:4310" },
  },
});
