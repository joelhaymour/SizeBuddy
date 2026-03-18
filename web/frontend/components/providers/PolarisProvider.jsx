import React from "react";
import { AppProvider } from "@shopify/polaris";
import en from "@shopify/polaris/locales/en.json";
import "@shopify/polaris/build/esm/styles.css";
import "../../global-overrides.css";

export function PolarisProvider({ children }) {
  return (
    <AppProvider i18n={en}>
      {children}
    </AppProvider>
  );
}


