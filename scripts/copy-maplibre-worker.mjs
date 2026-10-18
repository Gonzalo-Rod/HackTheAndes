// MapLibre GL 6 ships its web worker as a separate ES module that bundlers do not emit.
// Copy it next to the public assets so the map can load it with setWorkerUrl().
import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const source = path.join(root, "node_modules", "maplibre-gl", "dist", "maplibre-gl-worker.mjs");
const targetDir = path.join(root, "public", "maplibre");

await fs.mkdir(targetDir, { recursive: true });
await fs.copyFile(source, path.join(targetDir, "maplibre-gl-worker.mjs"));
console.log("Copied maplibre-gl-worker.mjs to public/maplibre/");
