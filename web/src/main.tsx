import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./App";
import { AuthProvider } from "./auth/session";
import { ToastProvider } from "./lib/toast";
// Self-hosted fonts (§10), so the app needs nothing from another site on the home network. The
// optical-size builds, so the display face tightens at title sizes as designed.
import "@fontsource-variable/bricolage-grotesque/opsz.css";
import "@fontsource-variable/dm-sans/opsz.css";
import "./styles/global.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root element missing");

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
);
