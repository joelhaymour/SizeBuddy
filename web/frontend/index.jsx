import App from "./App";
import { createRoot } from "react-dom/client";
import { initI18n } from "./utils/i18nUtils";
import * as Sentry from '@sentry/react';

// Ensure that locales are loaded before rendering the app
// Initialize Sentry if DSN provided
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.2,
  });
}

initI18n().then(() => {
  const root = createRoot(document.getElementById("app"));
  root.render(<App />);
});
