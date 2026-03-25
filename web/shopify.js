import { BillingInterval, LATEST_API_VERSION } from "@shopify/shopify-api";
import { shopifyApp } from "@shopify/shopify-app-express";
import { SQLiteSessionStorage } from "@shopify/shopify-app-session-storage-sqlite";
import { RedisSessionStorage } from "@shopify/shopify-app-session-storage-redis";
import { restResources } from "@shopify/shopify-api/rest/admin/2025-01";
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Debug logging
console.log('Environment variables loaded:');
console.log('API_KEY:', process.env.SHOPIFY_API_KEY);
console.log('HOST:', process.env.HOST);
console.log('SCOPES:', process.env.SCOPES);

const DB_PATH = `${process.cwd()}/database.sqlite`;

// Define scopes explicitly
const SCOPES = [
  'write_products',
  'read_products',
  'write_customers',
  'read_customers',
  'read_orders',
  'read_themes',
  'write_themes'
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
  ? new RedisSessionStorage(process.env.REDIS_URL, { ttl: 60 * 60 * 24 * 14 })
  : new SQLiteSessionStorage(DB_PATH);

const shopify = shopifyApp({
  api: {
    apiKey: process.env.SHOPIFY_API_KEY,
    apiSecretKey: process.env.SHOPIFY_API_SECRET,
    apiVersion: LATEST_API_VERSION,
    hostName: process.env.HOST.replace(/https?:\/\//, ''),
    scopes: SCOPES,
    isEmbeddedApp: true,
    restResources,
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
  sessionStorage,
  useOnlineTokens: true
});

// Debug logging
console.log('Shopify configuration:');
console.log('API Version:', LATEST_API_VERSION);
console.log('Host Name:', process.env.HOST.replace(/https?:\/\//, ''));
console.log('Auth Path:', shopify.config.auth.path);
console.log('Callback Path:', shopify.config.auth.callbackPath);
console.log('Configured Scopes:', shopify.api.config.scopes);

// Add session validation middleware
const validateAuthenticatedSession = async (req, res, next) => {
  try {
    const session = await shopify.validateAuthenticatedSession(req, res);
    res.locals.shopify = { session };
    next();
  } catch (error) {
    if (error instanceof Error) {
      res.status(401).send(error.message);
    } else {
      res.status(401).send('Unauthorized');
    }
  }
};

export { validateAuthenticatedSession };
export default shopify;
