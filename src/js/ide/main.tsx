import React from "react";
import ReactDOM from "react-dom/client";
import { initPanel } from "../bridge/panel";
import "./editor/monaco";
import "./styles.css";
import { App } from "./App";
import { useIde } from "./store";

initPanel();
// In a plain browser (mock AE), expose the store for debugging and tests.
if (!window.cep) (window as unknown as { __ide: typeof useIde }).__ide = useIde;

ReactDOM.createRoot(document.getElementById("app") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
