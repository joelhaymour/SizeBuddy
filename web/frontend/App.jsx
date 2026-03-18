import { BrowserRouter } from "react-router-dom";
import { NavigationMenu } from "@shopify/app-bridge-react";
import { Provider } from "@shopify/app-bridge-react";
import Routes from "./Routes";

import {
  QueryProvider,
  PolarisProvider,
} from "./components/providers";

// Get URL params
const urlParams = new URLSearchParams(window.location.search);
let shop = urlParams.get('shop');
let host = urlParams.get('host');
// If embedded params are missing, attempt to restore from sessionStorage
if (!shop || !host) {
  const cached = sessionStorage.getItem('sb_session');
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      shop = shop || parsed.shop;
      host = host || parsed.host;
    } catch {}
  }
}
// Persist for subsequent navigations
if (shop && host) {
  sessionStorage.setItem('sb_session', JSON.stringify({ shop, host }));
}

const config = {
  apiKey: process.env.SHOPIFY_API_KEY,
  host: host,
  forceRedirect: true
};

export default function App() {
  // Any .tsx or .jsx files in /pages will become a route
  // See documentation for <Routes /> for more info
  const pages = import.meta.glob("./pages/**/!(*.test.[jt]sx)*.([jt]sx)", {
    eager: true,
  });

  // Ensure we have required parameters
  if (!config.apiKey || !shop || !host) {
    console.error('Required parameters missing:', { apiKey: config.apiKey, shop, host });
    // Try to resume auth
    const lastShop = sessionStorage.getItem('sb_last_shop');
    if (lastShop) {
      window.location.href = `/api/auth?shop=${encodeURIComponent(JSON.parse(lastShop))}`;
    }
    return <div>Loading...</div>;
  }
  sessionStorage.setItem('sb_last_shop', JSON.stringify(shop));

  return (
    <PolarisProvider>
      <BrowserRouter>
        <Provider config={config}>
          <QueryProvider>
            <NavigationMenu
              navigationLinks={[
                {
                  label: "Size Recommendations",
                  destination: `/?shop=${shop}&host=${host}`,
                },
                {
                  label: "Analytics",
                  destination: `/analytics?shop=${shop}&host=${host}`,
                },
                {
                  label: "Plans",
                  destination: `/plans?shop=${shop}&host=${host}`,
                },
              ]}
            />
            <Routes pages={pages} shopDomain={shop} />
          </QueryProvider>
        </Provider>
      </BrowserRouter>
    </PolarisProvider>
  );
}
