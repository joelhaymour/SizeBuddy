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
        
        // Upsert subscription (Postgres-compatible)
        await db.run(
          `INSERT INTO subscriptions (shop, plan, status, subscription_id, updated_at)
           VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(shop) DO UPDATE SET
             plan = COALESCE(EXCLUDED.plan, subscriptions.plan),
             status = EXCLUDED.status,
             subscription_id = EXCLUDED.subscription_id,
             updated_at = CURRENT_TIMESTAMP`,
          [shop, inferredPlan, status, id]
        );

        // Immediately lock excess charts on downgrade
        const planRow = await db.get('SELECT plan FROM subscriptions WHERE shop = ?', [shop]);
        const newPlan = planRow?.plan || 'Free';
        const limit = newPlan === 'Premium' ? Infinity : (newPlan === 'Pro' ? 5 : 2);
        
        if (limit !== Infinity) {
          // Count current unlocked charts
          const countRow = await db.get('SELECT COUNT(*) as cnt FROM size_charts WHERE shop_domain = ? AND COALESCE(locked,0) = 0', [shop]);
          const unlocked = countRow?.cnt || 0;
          
          if (unlocked > limit) {
            console.log(`Downgrade detected for ${shop}: ${newPlan} allows ${limit}, currently ${unlocked} unlocked. Locking excess.`);
            // Reset all to unlocked first, then lock oldest to enforce limit
            await db.run(`UPDATE size_charts SET locked = 0 WHERE shop_domain = ?`, [shop]);
            // Lock all except the N most recent (keep newest unlocked)
            if (process.env.DATABASE_URL) {
              // Postgres
              await db.run(
                `UPDATE size_charts SET locked = TRUE 
                 WHERE shop_domain = ? AND id NOT IN (
                   SELECT id FROM size_charts 
                   WHERE shop_domain = ? 
                   ORDER BY created_at DESC, id DESC 
                   LIMIT ?
                 )`,
                [shop, shop, limit]
              );
            } else {
              // SQLite
              await db.run(
                `UPDATE size_charts SET locked = 1 
                 WHERE shop_domain = ? AND id NOT IN (
                   SELECT id FROM size_charts 
                   WHERE shop_domain = ? 
                   ORDER BY created_at DESC, id DESC 
                   LIMIT ?
                 )`,
                [shop, shop, limit]
              );
            }
            console.log(`Locked excess charts for ${shop}.`);
          }
        } else {
          // Premium: unlock all
          console.log(`Upgrade to Premium for ${shop}: unlocking all charts.`);
          await db.run(`UPDATE size_charts SET locked = 0 WHERE shop_domain = ?`, [shop]);
        }
      } catch (e) {
        console.error('APP_SUBSCRIPTIONS_UPDATE handler error:', e);
      }
    },
  },
};

export default CustomWebhookHandlers;


