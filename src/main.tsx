import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { App } from "./presentation/App";
import { initializePersonalizationTheme } from "./presentation/hooks/usePersonalizationPreferences";

initializePersonalizationTheme();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
