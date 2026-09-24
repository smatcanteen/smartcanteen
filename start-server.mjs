// cPanel Node.js / Passenger entry — starts the Nitro production server.
// Built by: NITRO_PRESET=node-server npm run build
import { pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const entry = join(root, ".output", "server", "index.mjs");

if (!existsSync(entry)) {
  console.error(
    "Missing build output at .output/server/index.mjs. Run: NITRO_PRESET=node-server npm run build",
  );
  process.exit(1);
}

await import(pathToFileURL(entry).href);
