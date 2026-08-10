import { ApiVersion, BillingInterval } from "@shopify/shopify-api";
import { shopifyApp } from "@shopify/shopify-app-express";
import { SQLiteSessionStorage } from "@shopify/shopify-app-session-storage-sqlite";
import { RedisSessionStorage } from "@shopify/shopify-app-session-storage-redis";
import dotenv from 'dotenv';
import { ensureBuyNowPixelInstalled } from "./utils/buyNowPixel.js";

// Load environment variables
dotenv.config();

// Debug logging
console.log('Environment variables loaded:');
console.log('API_KEY:', process.env.SHOPIFY_API_KEY);
console.log('HOST:', process.env.HOST);
console.log('SCOPES:', process.env.SCOPES);

const DB_PATH = `${process.cwd()}/database.sqlite`;
const API_VERSION = ApiVersion.January25;

// Define scopes explicitly
const SCOPES = [
  'write_products',
  'read_products',
  'write_customers',
  'read_customers',
  'read_orders',
  'read_customer_events',
  'read_themes',
  'write_themes',
  'write_pixels'
];

console.log('Using scopes:', SCOPES);

// The transactions with Shopify will always be marked as test transactions, unless NODE_ENV is production.
// See the ensureBilling helper to learn more about billing in this template.
const billingConfig = {
  "My Shopify One-Time Charge": {
    // This is an example configuration that would do a one-time charge for $5 (only USD is currently supported)
    amount: 5.0,
    currencyCode: "USD",
    interval: BillingInterval.OneTime,
  },
};

// Choose session storage based on env: Redis in prod if REDIS_URL provided, SQLite otherwise
const useRedis = !!process.env.REDIS_URL;
const sessionStorage = useRedis
  ? new RedisSessionStorage(process.env.REDIS_URL)
  : new SQLiteSessionStorage(DB_PATH);

const shopify = shopifyApp({
  api: {
    apiKey: process.env.SHOPIFY_API_KEY,
    apiSecretKey: process.env.SHOPIFY_API_SECRET,
    apiVersion: API_VERSION,
    hostName: process.env.HOST.replace(/https?:\/\//, ''),
    scopes: SCOPES,
    isEmbeddedApp: true,
    future: {
      customerAddressDefaultFix: true,
      lineItemBilling: true,
      unstable_managedPricingSupport: true,
    },
    billing: undefined,
  },
  auth: {
    path: "/api/auth",
    callbackPath: "/api/auth/callback",
    exitIframePath: "/api/auth/exit-iframe",
  },
  webhooks: {
    path: "/api/webhooks",
  },
  future: {
    expiringOfflineAccessTokens: true,
  },
  sessionStorage,
  useOnlineTokens: true
});

// Debug logging
console.log('Shopify configuration:');
console.log('API Version:', API_VERSION);
console.log('Host Name:', process.env.HOST.replace(/https?:\/\//, ''));
console.log('Auth Path:', shopify.config.auth.path);
console.log('Callback Path:', shopify.config.auth.callbackPath);
console.log('Configured Scopes:', shopify.api.config.scopes);

// Wrap Shopify's built-in session middleware so the session is populated
// in res.locals before we try to reconcile the Buy it now app pixel.
const validateAuthenticatedSession = (req, res, next) => {
  return shopify.validateAuthenticatedSession()(req, res, async () => {
    const session = res.locals.shopify?.session;
    try {
      await ensureBuyNowPixelInstalled(shopify, session);
    } catch (pixelError) {
      console.error('Failed to ensure Buy it now pixel during session validation:', pixelError);
    }
    next();
  });
};

export { validateAuthenticatedSession };
export default shopify;
