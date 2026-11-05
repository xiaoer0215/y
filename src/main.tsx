import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { LocaleSync } from "./lib/i18n";
import { ThemeProvider } from "./components/theme-provider";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider defaultTheme="dark" storageKey="ai-helper-theme">
      <LocaleSync />
      <App />
    </ThemeProvider>
  </React.StrictMode>,
);
