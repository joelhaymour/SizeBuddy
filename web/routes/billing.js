import express from 'express';
import shopify, { validateAuthenticatedSession } from "../shopify.js";
import { withShopifyRateLimit } from '../utils/rateLimit.js';
import { getDb } from '../db.js';

const router = express.Router();

// DB provided by adapter (SQLite in dev, Postgres in prod)

// Guard: ensure an active subscription before accessing protected routes
export async function requireActiveSubscription(req, res, next) {
  try {
    const session = res.locals?.shopify?.session;
    const shop = session?.shop;
    if (!shop) return res.status(401).json({ error: 'No session' });
    const db = await getDb();
    let sub = await db.get('SELECT plan, status FROM subscriptions WHERE shop = ?', [shop]);
    // Default to Free/active if no row yet so merchants can start immediately
    if (!sub) {
      await db.run(
        'INSERT INTO subscriptions (shop, plan, status, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(shop) DO UPDATE SET plan=excluded.plan, status=excluded.status, updated_at=excluded.updated_at',
        [shop, 'Free', 'active']
      );
      sub = { plan: 'Free', status: 'active' };
    }
    if (sub && sub.status === 'active') return next();
    return res.status(402).json({ error: 'Subscription required', redirect: '/api/billing/redirect' });
  } catch (e) {
    console.error('Billing guard error:', e);
    return res.status(500).json({ error: 'Billing check failed' });
  }
}

// Get current subscription and usage summary
router.get('/api/billing/status', validateAuthenticatedSession, async (req, res) => {
  try {
    const session = res.locals.shopify.session;
    const db = await getDb();
    const sub = await db.get('SELECT plan, status, subscription_id FROM subscriptions WHERE shop = ?', [session.shop]);
    const countRow = await db.get('SELECT COUNT(*) as cnt FROM size_charts WHERE shop_domain = ?', [session.shop]);
    const cnt = countRow?.cnt || 0;
    res.json({ plan: sub?.plan || 'Free', status: sub?.status || 'active', usage: { charts: cnt } });
  } catch (e) {
    console.error('billing/status error:', e);
    res.status(500).json({ error: 'failed' });
  }
});

// Create or redirect to a subscription approval URL
router.get('/api/billing/redirect', validateAuthenticatedSession, async (req, res) => {
  try {
    const session = res.locals?.shopify?.session || {};
    // Resolve shop robustly from session, query, headers, or referer
    let resolvedShop = session.shop || req.query.shop || req.headers['x-shopify-shop-domain'];
    if (!resolvedShop && req.get('referer')) {
      try { const u = new URL(req.get('referer')); const qs = new URLSearchParams(u.search); resolvedShop = qs.get('shop') || resolvedShop; } catch {}
    }
    if (!resolvedShop) return res.status(401).json({ error: 'No session' });

    const planName = (req.query.plan || 'Pro').toString();
    const returnUrl = `${process.env.HOST}`; // after approval, Shopify redirects back here
    const mutation = `#graphql
      mutation AppSubscriptionCreate($name: String!, $returnUrl: URL!, $lineItems: [AppSubscriptionLineItemInput!]!) {
        appSubscriptionCreate(name: $name, returnUrl: $returnUrl, lineItems: $lineItems) {
          userErrors { field message }
          confirmationUrl
          appSubscription { id status }
        }
      }
    `;
    // Pricing per request: Free (0), Pro 12.99, Premium 24.99
    const amount = planName === 'Free' ? 0 : planName === 'Premium' ? 24.99 : 12.99;
    if (amount === 0) {
      const db = await getDb();
      await db.run(
        `INSERT INTO subscriptions (shop, plan, status, subscription_id, updated_at)
         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(shop) DO UPDATE SET
           plan = EXCLUDED.plan,
           status = EXCLUDED.status,
           updated_at = CURRENT_TIMESTAMP`,
        [resolvedShop, 'Free', 'active', null]
      );
      return res.redirect(`${process.env.HOST}`);
    }
    // Persist the merchant's intended plan as pending approval before redirecting
    const db = await getDb();
    await db.run(
      `INSERT INTO subscriptions (shop, plan, status, updated_at)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(shop) DO UPDATE SET
         plan = EXCLUDED.plan,
         status = EXCLUDED.status,
         updated_at = CURRENT_TIMESTAMP`,
      [resolvedShop, planName, 'pending_approval']
    );
    const gqlClient = new shopify.api.clients.Graphql({ session });
    const resp = await withShopifyRateLimit(() => gqlClient.request({
      data: {
        query: mutation,
        variables: {
          name: `${planName} plan`,
          returnUrl,
          lineItems: [
            { plan: { appRecurringPricingDetails: { interval: 'EVERY_30_DAYS', price: { amount, currencyCode: 'USD' } } } }
          ]
        }
      }
    }));
    const url = resp?.body?.data?.appSubscriptionCreate?.confirmationUrl;
    if (!url) return res.status(500).json({ error: 'No confirmation url', resp });
    return res.redirect(url);
  } catch (e) {
    console.error('Billing redirect error:', e);
    return res.status(500).json({ error: 'Billing redirect failed' });
  }
});

export default router;


