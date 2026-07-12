import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: false,
  sourcemap: true,
  clean: true,
  target: "node20",
  splitting: false,
  banner: { js: "#!/usr/bin/env node" },
  // Keep @changeguard/core (and its runtime deps like pino, which do not
  // survive bundling) external. They are resolved at runtime from node_modules
  // via the workspace symlink in dev and via the published dependency in prod.
  external: ["@changeguard/core"]
});
