import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cep, type CepOptions, runAction } from "vite-cep-plugin";
import cepConfig from "./cep.config";
import path from "path";
import { extendscriptConfig } from "./vite.es.config";

const extensions = [".js", ".ts", ".tsx"];

const devDist = "dist";
const cepDist = "cep";

const src = path.resolve(__dirname, "src");
const root = path.resolve(src, "js");
const outDir = path.resolve(__dirname, "dist", cepDist);

const debugReact = process.env.DEBUG_REACT === "true";
const isProduction = process.env.NODE_ENV === "production";
const isMetaPackage = process.env.ZIP_PACKAGE === "true";
const isPackage = process.env.ZXP_PACKAGE === "true" || isMetaPackage;
const isServe = process.env.SERVE_PANEL === "true";
// Playwright runs the panel in a plain browser against the mock bridge; skip the CEP and ExtendScript builds.
const isBrowserOnly = process.env.BROWSER_ONLY === "true";
const action = process.env.BOLT_ACTION;

const input: { [key: string]: string } = {};
cepConfig.panels.forEach((panel) => {
  input[panel.name] = path.resolve(root, panel.mainPath);
});

const config: CepOptions = {
  cepConfig,
  isProduction,
  isPackage,
  isMetaPackage,
  isServe,
  debugReact,
  dir: `${__dirname}/${devDist}`,
  cepDist: cepDist,
  zxpOutput: `${__dirname}/${devDist}/zxp/${cepConfig.id}`,
  zipOutput: `${__dirname}/${devDist}/zip/${cepConfig.displayName}_${cepConfig.version}`,
  packages: cepConfig.installModules || [],
};

if (action) runAction(config, action);

// https://vitejs.dev/config/
export default defineConfig({
  plugins: isBrowserOnly ? [react()] : [react(), cep(config)],
  root,
  clearScreen: false,
  server: {
    port: cepConfig.port,
  },
  preview: {
    port: cepConfig.servePort,
  },
  worker: {
    format: "iife",
  },
  build: {
    sourcemap: isPackage ? cepConfig.zxp.sourceMap : cepConfig.build?.sourceMap,
    watch: {
      include: "src/jsx/**",
    },
    rollupOptions: {
      input,
      output: {
        manualChunks: {},
        preserveModules: false,
        format: "cjs",
        entryFileNames: "assets/[name]-[hash].cjs",
        chunkFileNames: "assets/[name]-[hash].cjs",
      },
    },
    // CEP 12 (AE 2025) embeds Chromium 99.
    target: "chrome99",
    chunkSizeWarningLimit: 6000,
    outDir,
  },
});

// rollup es3 build
if (!isBrowserOnly) {
  const outPathExtendscript = path.join("dist", cepDist, "jsx", "index.js");
  extendscriptConfig(
    `src/jsx/index.ts`,
    outPathExtendscript,
    cepConfig,
    extensions,
    isProduction,
    isPackage,
  );
}
