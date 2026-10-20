import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import pkg from "../../package.json" with { type: "json" };

export default defineConfig({
  plugins: [react(), {
    name: "domo-offline-shell",
    apply: "build",
    generateBundle(_options, bundle) {
      const files = Object.keys(bundle).filter((name) => /\.(js|css|woff2|svg|html)$/.test(name));
      const version = files.join("|").split("").reduce((hash, char) => Math.imul(hash, 31) + char.charCodeAt(0) | 0, 0).toString(16);
      this.emitFile({ type: "asset", fileName: "sw.js", source: `
const NAME = 'domo-shell-${version}';
const FILES = ${JSON.stringify(["/index.html", ...files.filter((name) => name !== "index.html").map((name) => `/${name}`)])};
self.addEventListener('install', event => event.waitUntil(caches.open(NAME).then(cache => cache.addAll(FILES))));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('domo-shell-') && key !== NAME).map(key => caches.delete(key))))));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (event.request.mode === 'navigate') event.respondWith(fetch(event.request).catch(() => caches.match('/index.html')));
  else if (FILES.includes(url.pathname)) event.respondWith(caches.match(event.request).then(saved => saved || fetch(event.request)));
});
` });
    },
  }],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  server: {
    port: 5173,
    // 개발 API(4310, domo_dev DB)로 보낸다. 운영 서버(4300)로 보내지 않는다.
    proxy: { "/api": "http://127.0.0.1:4310" },
  },
});
