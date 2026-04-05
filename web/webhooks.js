import { DeliveryMethod } from "@shopify/shopify-api";
import PrivacyWebhookHandlers from "./privacy.js";
import { getDb } from './db.js';
import {
  clearPendingPixelPurchase,
  getPendingPixelPurchase,
} from "./utils/buyNowPixel.js";

function getLineItemProperty(lineItem, key) {
  const props = lineItem?.properties;
  if (Array.isArray(props)) {
    const match = props.find((item) => item && item.name === key);
    return match ? match.value : null;
  }
  if (props && typeof props === 'object') {
    return props[key] || null;
  }
  return null;
}

function getLineItemRevenue(lineItem) {
  const quantity = Number(lineItem?.quantity || 1);
  const price = Number(lineItem?.price || 0);
  const totalDiscount = Number(lineItem?.total_discount || 0);
  const raw = (price * quantity) - totalDiscount;
  return Number.isFinite(raw) ? Math.max(0, Number(raw.toFixed(2))) : 0;
}

async function buildAttributedItem(payload, lineItem, shop) {
  const orderId = String(payload?.id || '');
  const productId = lineItem?.product_id ? String(lineItem.product_id) : null;
  const variantId = lineItem?.variant_id ? String(lineItem.variant_id) : null;
  const recommendationToken = getLineItemProperty(lineItem, '_size_buddy_recommendation_token');

  if (recommendationToken) {
    return {
      orderId,
      orderName: payload?.name || payload?.order_number || null,
      lineItemId: String(lineItem?.id || `${payload?.id || 'order'}-${lineItem?.variant_id || lineItem?.product_id || Math.random()}`),
      recommendationToken,
      productId,
      variantId,
      recommendedSize: getLineItemProperty(lineItem, '_size_buddy_recommended_size') || null,
      quantity: Number(lineItem?.quantity || 1),
      revenueAmount: getLineItemRevenue(lineItem),
      currency: payload?.currency || null,
      usedPendingPixelFallback: false,
      pendingVariantId: null,
    };
  }

  if (!orderId || !productId) {
    return null;
  }

  const pendingPixelPurchase = await getPendingPixelPurchase({
    shop,
    orderId,
    productId,
    variantId,
  });

  if (!pendingPixelPurchase?.recommendation_token) {
    return null;
  }

  return {
    orderId,
    orderName: payload?.name || payload?.order_number || null,
    lineItemId: String(lineItem?.id || `${payload?.id || 'order'}-${lineItem?.variant_id || lineItem?.product_id || Math.random()}`),
    recommendationToken: pendingPixelPurchase.recommendation_token,
    productId,
    variantId,
    recommendedSize: pendingPixelPurchase.recommended_size || null,
    quantity: Number(lineItem?.quantity || 1),
    revenueAmount: getLineItemRevenue(lineItem),
    currency: payload?.currency || null,
    usedPendingPixelFallback: true,
    pendingVariantId: pendingPixelPurchase.variant_id || "",
  };
}

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
        const inferredPlan = sub?.name || sub?.line_items?.[0]?.plan?.name || null;
        const db = await getDb();

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

        const planRow = await db.get('SELECT plan FROM subscriptions WHERE shop = ?', [shop]);
        const newPlan = planRow?.plan || 'Free';
        const limit = newPlan === 'Premium' ? Infinity : (newPlan === 'Pro' ? 5 : 2);

        if (limit !== Infinity) {
          const lockedCheck = process.env.DATABASE_URL ? 'FALSE' : '0';
          const countRow = await db.get(`SELECT COUNT(*) as cnt FROM size_charts WHERE shop_domain = ? AND (locked IS NULL OR locked = ${lockedCheck})`, [shop]);
          const unlocked = countRow?.cnt || 0;

          if (unlocked > limit) {
            console.log(`Downgrade detected for ${shop}: ${newPlan} allows ${limit}, currently ${unlocked} unlocked. Locking excess.`);
            const unlockedVal = process.env.DATABASE_URL ? 'FALSE' : '0';
            await db.run(`UPDATE size_charts SET locked = ${unlockedVal} WHERE shop_domain = ?`, [shop]);
            if (process.env.DATABASE_URL) {
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
          console.log(`Upgrade to Premium for ${shop}: unlocking all charts.`);
          const unlockedVal = process.env.DATABASE_URL ? 'FALSE' : '0';
          await db.run(`UPDATE size_charts SET locked = ${unlockedVal} WHERE shop_domain = ?`, [shop]);
        }
      } catch (e) {
        console.error('APP_SUBSCRIPTIONS_UPDATE handler error:', e);
      }
    },
  },
  ORDERS_CREATE: {
    deliveryMethod: DeliveryMethod.Http,
    callbackUrl: "/api/webhooks",
    callback: async (_topic, shop, body) => {
      try {
        const payload = JSON.parse(body || '{}');
        const lineItems = Array.isArray(payload?.line_items) ? payload.line_items : [];
        if (!lineItems.length) return;

        const attributedItems = [];
        for (const lineItem of lineItems) {
          const attributedItem = await buildAttributedItem(payload, lineItem, shop);
          if (attributedItem) {
            attributedItems.push(attributedItem);
          }
        }

        if (!attributedItems.length) return;

        const db = await getDb();
        for (const item of attributedItems) {
          await db.run(
            `INSERT INTO size_buddy_purchase_analytics
             (shop, order_id, order_name, line_item_id, recommendation_token, product_id, variant_id, recommended_size, quantity, revenue_amount, currency, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
             ON CONFLICT(order_id, line_item_id) DO NOTHING`,
            [
              shop,
              item.orderId,
              item.orderName,
              item.lineItemId,
              item.recommendationToken,
              item.productId,
              item.variantId,
              item.recommendedSize,
              item.quantity,
              item.revenueAmount,
              item.currency,
            ]
          );

          if (item.usedPendingPixelFallback) {
            await clearPendingPixelPurchase({
              shop,
              orderId: item.orderId,
              productId: item.productId,
              variantId: item.pendingVariantId,
            });
          }
        }
      } catch (e) {
        console.error('ORDERS_CREATE handler error:', e);
      }
    },
  },
};

export default CustomWebhookHandlers;
