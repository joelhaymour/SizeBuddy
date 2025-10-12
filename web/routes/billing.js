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
    const sub = await db.get('SELECT plan, status FROM subscriptions WHERE shop = ?', [session.shop]);
    let plan = sub?.plan || 'Free';
    let status = sub?.status || 'active';

    // Try to detect the current Shopify-managed plan and reconcile immediately
    try {
      const gql = new shopify.api.clients.Graphql({ session });
      const query = `#graphql
        query AppInstallPlan { currentAppInstallation { activeSubscriptions { name status } } }
      `;
      const resp = await gql.request(query);
      const subs = resp?.body?.data?.currentAppInstallation?.activeSubscriptions || [];
      const name = (subs[0]?.name || '').toString();
      const n = name.toLowerCase();
      const shopifyPlan = n.includes('premium') ? 'Premium' : n.includes('pro') ? 'Pro' : (name ? 'Free' : null);
      if (shopifyPlan && shopifyPlan !== plan) {
        plan = shopifyPlan;
        status = 'active';
        await db.run(
          `INSERT INTO subscriptions (shop, plan, status, updated_at)
           VALUES (?, ?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(shop) DO UPDATE SET plan = EXCLUDED.plan, status = EXCLUDED.status, updated_at = CURRENT_TIMESTAMP`,
          [session.shop, plan, status]
        );
      }
    } catch (_) { /* ignore Shopify lookup errors */ }
    const totalRow = await db.get('SELECT COUNT(*) as cnt FROM size_charts WHERE shop_domain = ?', [session.shop]);
    let unlockedCharts = 0;
    try {
      // Ensure locked column exists on legacy DBs
      if (process.env.DATABASE_URL) {
        await db.run('ALTER TABLE size_charts ADD COLUMN IF NOT EXISTS locked BOOLEAN DEFAULT FALSE');
      } else {
        await db.run('ALTER TABLE size_charts ADD COLUMN IF NOT EXISTS locked INTEGER DEFAULT 0');
      }
      const unlockedRow = await db.get('SELECT COUNT(*) as cnt FROM size_charts WHERE shop_domain = ? AND COALESCE(locked, 0) = 0', [session.shop]);
      unlockedCharts = unlockedRow?.cnt || 0;
    } catch (_) {
      // Fallback if locked doesn't exist yet
      unlockedCharts = totalRow?.cnt || 0;
    }
    const totalCharts = totalRow?.cnt || 0;
    const planLimit = plan === 'Premium' ? null : (plan === 'Pro' ? 5 : 2);

    // If plan was downgraded and we have more unlocked than allowed, lock immediately (newest first)
    if (planLimit !== null && typeof planLimit === 'number' && unlockedCharts > planLimit) {
      try {
        // Unlock all first, then lock overflow newest first
        await db.run(`UPDATE size_charts SET locked = 0 WHERE shop_domain = ?`, [session.shop]);
        await db.run(
          `UPDATE size_charts
           SET locked = 1
           WHERE shop_domain = ? AND id IN (
             SELECT id FROM size_charts
             WHERE shop_domain = ?
             ORDER BY created_at DESC, id DESC
             LIMIT (SELECT MAX(0, COUNT(*) - ?) FROM size_charts WHERE shop_domain = ?)
           )`,
          [session.shop, session.shop, planLimit, session.shop]
        );
        const unlockedRow2 = await db.get('SELECT COUNT(*) as cnt FROM size_charts WHERE shop_domain = ? AND COALESCE(locked, 0) = 0', [session.shop]);
        unlockedCharts = unlockedRow2?.cnt || planLimit;
      } catch (e) {
        console.warn('Immediate lock reconciliation failed:', e.message || e);
      }
    }
    res.json({ plan, status, usage: { totalCharts, unlockedCharts, planLimit } });
  } catch (e) {
    console.error('billing/status error:', e);
    res.status(500).json({ error: 'failed' });
  }
});

// Optional: detect Shopify-managed pricing selection (pending plan changes)
router.get('/api/billing/pending-status', validateAuthenticatedSession, async (req, res) => {
  try {
    const session = res.locals.shopify.session;
    const gql = new shopify.api.clients.Graphql({ session });
    const query = `#graphql
      query AppInstallPlan {
        currentAppInstallation {
          activeSubscriptions { name status }
        }
      }
    `;
    let shopifyPlan = null;
    try {
      const resp = await gql.request(query);
      const subs = resp?.body?.data?.currentAppInstallation?.activeSubscriptions || [];
      const name = (subs[0]?.name || '').toString();
      const n = name.toLowerCase();
      if (n.includes('premium')) shopifyPlan = 'Premium';
      else if (n.includes('pro')) shopifyPlan = 'Pro';
      else if (name) shopifyPlan = 'Free';
    } catch (_) {}

    const db = await getDb();
    const row = await db.get('SELECT plan FROM subscriptions WHERE shop = ?', [session.shop]);
    const storedPlan = row?.plan || 'Free';
    const limitFor = (p) => (p === 'Premium' ? Infinity : (p === 'Pro' ? 5 : 2));
    const limits = { stored: limitFor(storedPlan), prospective: shopifyPlan ? limitFor(shopifyPlan) : null };
    res.json({ storedPlan, shopifyPlan, limits });
  } catch (e) {
    console.error('pending-status error:', e);
    res.status(500).json({ error: 'failed' });
  }
});

// Create or redirect to a subscription approval URL
// Managed pricing is now used; keep endpoint for backward compat but instruct client to use Admin path
router.post('/api/billing/redirect', async (req, res) => {
  return res.status(410).json({ error: 'Managed pricing enabled. Use /charges/:app_handle/pricing_plans in Admin.' });
});

router.get('/api/billing/redirect', async (req, res) => {
  return res.status(410).json({ error: 'Managed pricing enabled. Use /charges/:app_handle/pricing_plans in Admin.' });
});

/*
// Previous manual billing flow (kept for reference if switching back):
router.post('/api/billing/redirect', async (req, res) => {
  try {
    // Resolve shop robustly from session, query, headers, or referer
    const sessionFromMiddleware = res.locals?.shopify?.session || {};
    let resolvedShop = sessionFromMiddleware.shop || req.query.shop || req.headers['x-shopify-shop-domain'];
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
    // Ensure we have a session with an access token (fallback to offline session by shop)
    let sessionForAdmin = sessionFromMiddleware && sessionFromMiddleware.accessToken ? sessionFromMiddleware : null;
    if (!sessionForAdmin) {
      try {
        const sessions = await shopify.sessionStorage.findSessionsByShop(resolvedShop);
        sessionForAdmin = (sessions || []).find(s => s && s.accessToken) || null;
      } catch {}
    }
    if (!sessionForAdmin) {
      // Signal App Bridge to reauthorize
      if (resolvedShop) {
        res.setHeader('X-Shopify-API-Request-Failure-Reauthorize', '1');
        res.setHeader('X-Shopify-API-Request-Failure-Reauthorize-Url', `/api/auth?shop=${encodeURIComponent(resolvedShop)}`);
      }
      return res.status(401).json({ error: 'No session token for admin API' });
    }
    const gqlClient = new shopify.api.clients.Graphql({ session: sessionForAdmin });
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
    return res.json({ url });
  } catch (e) {
    console.error('Billing redirect error:', e);
    return res.status(500).json({ error: 'Billing redirect failed' });
  }
});

router.get('/api/billing/redirect', async (req, res) => {
  // Delegate to POST logic then perform 302 to the URL, for non-embedded fallbacks
  try {
    req.method = 'POST';
    const fakeRes = {
      status: (code) => ({ json: (body) => res.status(code).json(body) }),
      json: (body) => {
        if (body && body.url) return res.redirect(body.url);
        return res.status(500).json({ error: 'Billing redirect failed' });
      }
    };
    return router.handle(req, fakeRes);
  } catch (e) {
    console.error('Billing redirect (GET) error:', e);
    return res.status(500).json({ error: 'Billing redirect failed' });
  }
});
*/

export default router;


