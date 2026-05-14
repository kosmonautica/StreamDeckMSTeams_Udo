import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";

const sdPlugin = "com.kosmonautica.teams-control.sdPlugin";

/**
 * Emits a `package.json` next to the bundle declaring `"type": "module"`.
 *
 * The bundle is ESM, but once the .sdPlugin folder is linked into Stream Deck's
 * plugins directory it no longer sits under the project's package.json. Without
 * this marker Node treats `bin/plugin.js` as CommonJS and crashes on `import`.
 */
const emitEsmMarker = {
  name: "emit-esm-marker",
  generateBundle() {
    this.emitFile({
      type: "asset",
      fileName: "package.json",
      source: JSON.stringify({ type: "module" }, null, 2) + "\n",
    });
  },
};

export default {
  input: "src/plugin.ts",
  output: {
    file: `${sdPlugin}/bin/plugin.js`,
    format: "es",
    sourcemap: true,
  },
  plugins: [
    typescript(),
    nodeResolve({ browser: false, exportConditions: ["node"], preferBuiltins: true }),
    commonjs(),
    emitEsmMarker,
  ],
};
