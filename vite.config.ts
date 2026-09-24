import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  plugins: [
    VitePWA({
      strategies: "generateSW",
      registerType: "autoUpdate",
      filename: "service-worker.js",
      injectRegister: null,
      devOptions: { enabled: false },
      manifest: false,
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,woff2}"],
        additionalManifestEntries: [
          { url: "/", revision: null },
          { url: "/manifest.webmanifest", revision: null },
        ],
        navigateFallback: "/",
        navigateFallbackDenylist: [/^\/~oauth/, /^\/api\//, /^\/_serverFn\//],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ request, url }) =>
              url.origin === self.location.origin &&
              ["script", "style", "font", "image"].includes(request.destination),
            handler: "CacheFirst",
            options: {
              cacheName: "smartcanteen-assets",
              expiration: { maxEntries: 250, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\//,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "smartcanteen-fonts",
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
    }),
  ],
});
