import type { CEP_Config } from "vite-cep-plugin";
import { version } from "./package.json";

// One extension, many panels: each Suite tool is an entry in `panels` and shares the bridge and host script.
const config: CEP_Config = {
  version,
  id: "com.expressionsuite.cep",
  displayName: "Expression Suite",
  symlink: "local",
  port: 3000,
  servePort: 5000,
  startingDebugPort: 8860,
  extensionManifestVersion: 6.0,
  // AE 2025 (25.x) ships CEP 12 (Chromium 99).
  requiredRuntimeVersion: 12.0,
  hosts: [{ name: "AEFT", version: "[25.0,99.9]" }],

  type: "Panel",
  // Light glyph for AE's dark UI, dark glyph for its light themes; copied by copyAssets.
  iconDarkNormal: "./icons/icon-light.png",
  iconNormal: "./icons/icon-dark.png",
  iconDarkNormalRollOver: "./icons/icon-light.png",
  iconNormalRollOver: "./icons/icon-dark.png",
  parameters: ["--v=0", "--enable-nodejs", "--mixed-context"],
  width: 900,
  height: 600,

  panels: [
    {
      mainPath: "./ide/index.html",
      name: "ide",
      panelDisplayName: "Expression IDE",
      autoVisible: true,
      width: 900,
      height: 600,
      minWidth: 320,
      minHeight: 200,
    },
  ],
  build: {
    jsxBin: "off",
    sourceMap: true,
  },
  zxp: {
    country: "GB",
    province: "London",
    org: "Expression Suite",
    password: "password",
    tsa: [
      "http://timestamp.digicert.com/", // Windows Only
      "http://timestamp.apple.com/ts01", // MacOS Only
    ],
    allowSkipTSA: false,
    sourceMap: false,
    jsxBin: "off",
  },
  installModules: [],
  copyAssets: ["icons"],
  copyZipAssets: [],
};
export default config;
