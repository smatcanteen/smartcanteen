 // Standalone config for cPanel / Node hosting (no private @lovable.dev package).
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  server: {
    port: 3000,
  },
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
  plugins: [
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tailwindcss(),
    tanstackStart({
      // Use our SSR error wrapper at src/server.ts
      server: { entry: "server" },
    }),
    nitro({
      // Node HTTP server for cPanel Passenger / Node.js Selector
      preset: process.env.NITRO_PRESET || "node-server",
    }),
    viteReact(),
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
