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
const shop = urlParams.get('shop');
const host = urlParams.get('host');

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
    return <div>Loading...</div>;
  }

  return (
    <PolarisProvider>
      <BrowserRouter>
        <Provider config={config}>
          <QueryProvider>
            <NavigationMenu
              navigationLinks={[
                {
                  label: "Product Groups",
                  destination: `/?shop=${shop}&host=${host}`,
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
