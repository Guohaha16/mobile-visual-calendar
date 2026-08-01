import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { PwaUpdateToast } from "./components/PwaUpdateToast";
import "./styles/tokens.css";
import "./styles/global.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
    <PwaUpdateToast />
  </StrictMode>
);
