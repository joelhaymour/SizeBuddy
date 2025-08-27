import { DeliveryMethod } from "@shopify/shopify-api";
import PrivacyWebhookHandlers from "./privacy.js";
import { getDb } from './db.js';

// DB provided by adapter

const CustomWebhookHandlers = {
  ...PrivacyWebhookHandlers,
  APP_UNINSTALLED: {
    deliveryMethod: DeliveryMethod.Http,
    callbackUrl: "/api/webhooks",
    callback: async (_topic, shop, _body) => {
      try {
        const db = await getDb();
        await db.run(`UPDATE subscriptions SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE shop = ?`, [shop]);
      } catch (e) {
        console.error('APP_UNINSTALLED handler error:', e);
      }
    },
  },
  APP_SUBSCRIPTIONS_UPDATE: {
    deliveryMethod: DeliveryMethod.Http,
    callbackUrl: "/api/webhooks",
    callback: async (_topic, shop, body) => {
      try {
        const payload = JSON.parse(body);
        const sub = payload?.app_subscription;
        if (!sub) return;
        const status = (sub.status || 'active').toLowerCase();
        const id = sub.id || null;
        // Try to infer plan name from line items or name if present
        const inferredPlan = sub?.name || sub?.line_items?.[0]?.plan?.name || null;
        const db = await getDb();
        await db.run(
          `INSERT OR REPLACE INTO subscriptions (shop, plan, status, subscription_id, updated_at)
           VALUES (
             ?,
             COALESCE(?, (SELECT plan FROM subscriptions WHERE shop = ?), 'Pro'),
             ?,
             ?,
             CURRENT_TIMESTAMP
           )`,
          [shop, inferredPlan, shop, status, id]
        );
      } catch (e) {
        console.error('APP_SUBSCRIPTIONS_UPDATE handler error:', e);
      }
    },
  },
};

export default CustomWebhookHandlers;


