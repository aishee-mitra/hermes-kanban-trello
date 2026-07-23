// Build the plugin frontend: dashboard/src/*.tsx -> dashboard/dist/index.js
// Plain esbuild bundle. The dashboard host provides React + the Hermes plugin
// SDK at runtime via window.__HERMES_PLUGIN_SDK__, so React is marked external.
import { build } from "esbuild";
import { mkdirSync, watch as fsWatch } from "node:fs";

const OUT = "dashboard/dist";
mkdirSync(OUT, { recursive: true });

/** @type {import('esbuild').BuildOptions} */
const opts = {
  entryPoints: ["dashboard/src/index.tsx"],
  outfile: `${OUT}/index.js`,
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["es2020"],
  logLevel: "info",
  jsx: "transform",
  jsxFactory: "h",
  jsxFragment: "React.Fragment",
  // React comes from the host SDK at runtime (SDK.React), pulled into a local
  // `const React` inside the bundle — we do NOT import or externalize "react".
  loader: { ".tsx": "tsx", ".ts": "ts" },
};

async function run() {
  await build(opts);
  console.log(`built -> ${OUT}/index.js`);
}

const watch = process.argv.includes("--watch");
if (watch) {
  fsWatch("dashboard/src", { recursive: true }, () => {
    run().catch((e) => console.error(e));
  });
  console.log("watching dashboard/src ...");
  await run();
} else {
  await run();
}
