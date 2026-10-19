import React from "react";
import ReactDOM from "react-dom/client";
import { initPanel } from "../bridge/panel";
import "./editor/monaco";
import "./styles.css";
import { App } from "./App";

initPanel();

ReactDOM.createRoot(document.getElementById("app") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
