import './monaco-setup';
import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Notify the Tauri backend that the frontend has finished bootstrapping.
// This causes the main window to become visible and the splash screen to close.
if (typeof window !== "undefined" && (window as any).__TAURI__) {
  (window as any).__TAURI__.core.invoke("frontend_ready").catch(() => {});
}
