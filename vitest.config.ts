import { resolve, dirname } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    {
      name: "resolve-ts-from-js",
      enforce: "pre",
      resolveId(id, importer) {
        if (id.startsWith(".") && id.endsWith(".js") && importer) {
          return resolve(dirname(importer), id.replace(/\.js$/, ".ts"));
        }
      },
    },
  ],
  test: {
    environment: "node",
    globals: false,
    reporters: ["verbose"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
    },
  },
});
