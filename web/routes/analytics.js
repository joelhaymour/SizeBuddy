import { Router } from "express";
import { validateAuthenticatedSession } from "../shopify.js";
import { getDb } from "../db.js";

const router = Router();
const dbPromise = getDb();

async function initializeAnalyticsTables() {
  const db = await dbPromise;

  await db.run(`CREATE TABLE IF NOT EXISTS analytics_events (
    id ${process.env.DATABASE_URL ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${process.env.DATABASE_URL ? '' : 'AUTOINCREMENT'},
    shop TEXT NOT NULL,
    event_type TEXT NOT NULL,
    event_data TEXT,
    created_at ${process.env.DATABASE_URL ? 'TIMESTAMPTZ' : 'DATETIME'} DEFAULT ${process.env.DATABASE_URL ? 'NOW()' : 'CURRENT_TIMESTAMP'}
  )`);
  await db.run(`CREATE INDEX IF NOT EXISTS idx_analytics_shop ON analytics_events(shop)`);
  await db.run(`CREATE INDEX IF NOT EXISTS idx_analytics_event_type ON analytics_events(event_type)`);
  await db.run(`CREATE INDEX IF NOT EXISTS idx_analytics_created_at ON analytics_events(created_at)`);

  await db.run(`CREATE TABLE IF NOT EXISTS size_buddy_purchase_analytics (
    id ${process.env.DATABASE_URL ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${process.env.DATABASE_URL ? '' : 'AUTOINCREMENT'},
    shop TEXT NOT NULL,
    order_id TEXT NOT NULL,
    order_name TEXT,
    line_item_id TEXT NOT NULL,
    recommendation_token TEXT NOT NULL,
    product_id TEXT,
    variant_id TEXT,
    recommended_size TEXT,
    quantity INTEGER DEFAULT 1,
    revenue_amount ${process.env.DATABASE_URL ? 'NUMERIC(12, 2)' : 'REAL'} DEFAULT 0,
    currency TEXT,
    created_at ${process.env.DATABASE_URL ? 'TIMESTAMPTZ' : 'DATETIME'} DEFAULT ${process.env.DATABASE_URL ? 'NOW()' : 'CURRENT_TIMESTAMP'}
  )`);
  await db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_size_buddy_purchase_order_line ON size_buddy_purchase_analytics(order_id, line_item_id)`);
  await db.run(`CREATE INDEX IF NOT EXISTS idx_size_buddy_purchase_shop_created ON size_buddy_purchase_analytics(shop, created_at)`);
  await db.run(`CREATE INDEX IF NOT EXISTS idx_size_buddy_purchase_reco_token ON size_buddy_purchase_analytics(recommendation_token)`);
}

initializeAnalyticsTables().catch(console.error);

function getDateRange(range) {
  if (range === 'all') return null;
  const now = new Date();
  switch (range) {
    case 'last30days':
      now.setDate(now.getDate() - 30);
      return now;
    case 'last90days':
      now.setDate(now.getDate() - 90);
      return now;
    case 'last365days':
      now.setDate(now.getDate() - 365);
      return now;
    case 'last7days':
    default:
      now.setDate(now.getDate() - 7);
      return now;
  }
}

function safeParseJson(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (_error) {
    return fallback;
  }
}

function toPercentage(numerator, denominator) {
  if (!denominator) return 0;
  return Number(((numerator / denominator) * 100).toFixed(1));
}

function hasTrackedRecommendationToken(recommendation) {
  const token = recommendation?.recommendation_token;
  return typeof token === 'string' ? token.trim().length > 0 : Boolean(token);
}

async function getLatestProducts(db, shop) {
  const rows = await db.all(
    `SELECT product_id, product_title, product_handle
     FROM product_charts
     WHERE shop_domain = ?
     ORDER BY created_at DESC, id DESC`,
    [shop]
  );

  const map = new Map();
  for (const row of rows) {
    if (!row?.product_id || map.has(String(row.product_id))) continue;
    map.set(String(row.product_id), {
      product_title: row.product_title || 'Unknown Product',
      product_handle: row.product_handle || '',
    });
  }
  return map;
}

async function getRecommendations(db, shop, startDate) {
  if (startDate) {
    return db.all(
      `SELECT id, product_id, chart_id, recommended_size, recommendation_token, availability_status, variant_id, added_to_cart_at, created_at
       FROM size_recommendation_analytics
       WHERE shop = ? AND created_at >= ?
       ORDER BY created_at DESC`,
      [shop, startDate.toISOString()]
    );
  }

  return db.all(
    `SELECT id, product_id, chart_id, recommended_size, recommendation_token, availability_status, variant_id, added_to_cart_at, created_at
     FROM size_recommendation_analytics
     WHERE shop = ?
     ORDER BY created_at DESC`,
    [shop]
  );
}

async function getPurchaseAttributions(db, shop, startDate) {
  if (startDate) {
    return db.all(
      `SELECT order_id, order_name, line_item_id, recommendation_token, product_id, variant_id, recommended_size, quantity, revenue_amount, currency, created_at
       FROM size_buddy_purchase_analytics
       WHERE shop = ? AND created_at >= ?
       ORDER BY created_at DESC`,
      [shop, startDate.toISOString()]
    );
  }

  return db.all(
    `SELECT order_id, order_name, line_item_id, recommendation_token, product_id, variant_id, recommended_size, quantity, revenue_amount, currency, created_at
     FROM size_buddy_purchase_analytics
     WHERE shop = ?
     ORDER BY created_at DESC`,
    [shop]
  );
}

async function getWidgetViews(db, shop, startDate) {
  if (startDate) {
    const row = await db.get(
      `SELECT COUNT(*) as count
       FROM analytics_events
       WHERE shop = ? AND event_type = ? AND created_at >= ?`,
      [shop, 'widget_view', startDate.toISOString()]
    );
    return Number(row?.count || 0);
  }

  const row = await db.get(
    `SELECT COUNT(*) as count
     FROM analytics_events
     WHERE shop = ? AND event_type = ?`,
    [shop, 'widget_view']
  );
  return Number(row?.count || 0);
}

function buildProductPerformance(recommendations, purchases, productLookup) {
  const productMap = new Map();
  for (const recommendation of recommendations) {
    const productId = recommendation?.product_id ? String(recommendation.product_id) : null;
    if (!productId) continue;

    if (!productMap.has(productId)) {
      const meta = productLookup.get(productId) || {};
      productMap.set(productId, {
        product_id: productId,
        product_title: meta.product_title || 'Unknown Product',
        product_handle: meta.product_handle || '',
        total_recommendations: 0,
        tracked_total_recommendations: 0,
        available_recommendations: 0,
        sold_out_recommendations: 0,
        unavailable_recommendations: 0,
        add_to_cart_total: 0,
        tracked_recommendation_tokens: new Set(),
        purchase_tokens: new Set(),
        revenue_generated: 0,
        sold_out_breakdown_map: new Map(),
      });
    }

    const bucket = productMap.get(productId);
    const availabilityStatus = String(recommendation?.availability_status || 'available');
    const recommendationToken = hasTrackedRecommendationToken(recommendation)
      ? String(recommendation.recommendation_token)
      : null;
    bucket.total_recommendations += 1;

    if (recommendationToken) {
      bucket.tracked_total_recommendations += 1;
      bucket.tracked_recommendation_tokens.add(recommendationToken);
    }

    if (availabilityStatus === 'sold_out') {
      bucket.sold_out_recommendations += 1;
      const sizeLabel = recommendation?.recommended_size || 'Unknown Size';
      bucket.sold_out_breakdown_map.set(sizeLabel, (bucket.sold_out_breakdown_map.get(sizeLabel) || 0) + 1);
      continue;
    }

    if (availabilityStatus === 'size_not_available') {
      bucket.unavailable_recommendations += 1;
      continue;
    }

    if (!recommendationToken) {
      continue;
    }

    bucket.available_recommendations += 1;
    if (recommendation?.added_to_cart_at) {
      bucket.add_to_cart_total += 1;
    }
  }

  for (const purchase of purchases) {
    const productId = purchase?.product_id ? String(purchase.product_id) : null;
    const recommendationToken = purchase?.recommendation_token ? String(purchase.recommendation_token) : null;
    if (!productId || !recommendationToken || !productMap.has(productId)) continue;

    const bucket = productMap.get(productId);
    if (!bucket.tracked_recommendation_tokens.has(recommendationToken)) continue;

    bucket.purchase_tokens.add(recommendationToken);
    bucket.revenue_generated += Number(purchase?.revenue_amount || 0);
  }

  return Array.from(productMap.values())
    .map((bucket) => {
      const purchaseTotal = bucket.purchase_tokens.size;
      const soldOutBreakdown = Array.from(bucket.sold_out_breakdown_map.entries())
        .map(([size, count]) => ({ size, count }))
        .sort((left, right) => right.count - left.count || String(left.size).localeCompare(String(right.size)));

      return {
        product_id: bucket.product_id,
        product_title: bucket.product_title,
        product_handle: bucket.product_handle,
        total_recommendations: bucket.total_recommendations,
        tracked_total_recommendations: bucket.tracked_total_recommendations,
        available_recommendations: bucket.available_recommendations,
        sold_out_recommendations: bucket.sold_out_recommendations,
        unavailable_recommendations: bucket.unavailable_recommendations,
        add_to_cart_total: bucket.add_to_cart_total,
        rec_to_add_to_cart_rate: toPercentage(bucket.add_to_cart_total, bucket.available_recommendations),
        purchase_total: purchaseTotal,
        rec_to_purchase_rate: toPercentage(purchaseTotal, bucket.available_recommendations),
        revenue_generated: Number(bucket.revenue_generated.toFixed(2)),
        sold_out_breakdown: soldOutBreakdown,
      };
    })
    .sort((left, right) => {
      if (right.total_recommendations !== left.total_recommendations) {
        return right.total_recommendations - left.total_recommendations;
      }
      return String(left.product_title || '').localeCompare(String(right.product_title || ''));
    });
}

async function buildAnalyticsResponse(db, shop, range) {
  const startDate = getDateRange(range);
  const [recommendations, purchases, productLookup, totalViews] = await Promise.all([
    getRecommendations(db, shop, startDate),
    getPurchaseAttributions(db, shop, startDate),
    getLatestProducts(db, shop),
    getWidgetViews(db, shop, startDate),
  ]);

  const productPerformance = buildProductPerformance(recommendations, purchases, productLookup);
  const trackedRecommendations = recommendations.filter(hasTrackedRecommendationToken);
  const trackedAvailableRecommendations = trackedRecommendations.filter((item) => String(item?.availability_status || 'available') === 'available');
  const soldOutRecommendations = recommendations.filter((item) => String(item?.availability_status || 'available') === 'sold_out');
  const unavailableRecommendations = recommendations.filter((item) => String(item?.availability_status || 'available') === 'size_not_available');
  const addToCartCount = trackedAvailableRecommendations.filter((item) => !!item?.added_to_cart_at).length;
  const purchaseTokenSet = new Set(
    purchases
      .map((item) => item?.recommendation_token ? String(item.recommendation_token) : null)
      .filter(Boolean)
  );
  const purchasedRecommendationCount = trackedAvailableRecommendations.filter((item) => item?.recommendation_token && purchaseTokenSet.has(String(item.recommendation_token))).length;
  const totalRevenue = Number(
    purchases.reduce((sum, item) => sum + Number(item?.revenue_amount || 0), 0).toFixed(2)
  );

  return {
    range,
    totalViews,
    totalRecommendations: recommendations.length,
    summary: {
      totalRevenue,
      totalRecommendations: recommendations.length,
      trackedRecommendations: trackedRecommendations.length,
      availableRecommendations: trackedAvailableRecommendations.length,
      soldOutRecommendations: soldOutRecommendations.length,
      unavailableRecommendations: unavailableRecommendations.length,
      recommendationToAddToCartRate: toPercentage(addToCartCount, trackedAvailableRecommendations.length),
      recommendationToPurchaseRate: toPercentage(purchasedRecommendationCount, trackedAvailableRecommendations.length),
      currency: purchases.find((item) => item?.currency)?.currency || 'USD',
    },
    productPerformance,
  };
}

router.get('/api/analytics', validateAuthenticatedSession, async (req, res) => {
  try {
    const { shop, range = 'last7days' } = req.query;
    if (!shop) {
      return res.status(400).json({ error: 'Missing shop parameter' });
    }

    const db = await dbPromise;
    const analyticsData = await buildAnalyticsResponse(db, shop, range);
    res.status(200).json(analyticsData);
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ error: 'Failed to fetch analytics data' });
  }
});

router.post('/api/analytics/reset', validateAuthenticatedSession, async (req, res) => {
  try {
    const shop = req.body?.shop || req.query?.shop;
    if (!shop) {
      return res.status(400).json({ error: 'Missing shop parameter' });
    }

    const db = await dbPromise;
    await db.run('DELETE FROM analytics_events WHERE shop = ?', [shop]);
    await db.run('DELETE FROM size_recommendation_analytics WHERE shop = ?', [shop]);
    await db.run('DELETE FROM size_buddy_purchase_analytics WHERE shop = ?', [shop]);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error resetting analytics:', error);
    res.status(500).json({ error: 'Failed to reset analytics data' });
  }
});

router.post('/api/analytics/event', validateAuthenticatedSession, async (req, res) => {
  try {
    const { shop, eventType, eventData } = req.body;
    const db = await dbPromise;

    await db.run(
      'INSERT INTO analytics_events (shop, event_type, event_data) VALUES (?, ?, ?)',
      [shop, eventType, JSON.stringify(eventData || {})]
    );

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error recording analytics event:', error);
    res.status(500).json({ error: 'Failed to record analytics event' });
  }
});

router.post('/api/log-recommendation', async (req, res) => {
  try {
    const {
      shop,
      product_id,
      chart_id,
      recommended_size,
      measurements,
      recommendation_token,
      availability_status,
      variant_id,
    } = req.body;
    const db = await dbPromise;

    if (!shop || !product_id || !chart_id || !recommended_size) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    await db.run(
      `INSERT INTO size_recommendation_analytics
       (product_id, chart_id, recommended_size, measurements, recommendation_token, availability_status, variant_id, created_at, shop)
       VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)`,
      [
        product_id,
        chart_id,
        recommended_size,
        JSON.stringify(measurements || {}),
        recommendation_token || null,
        availability_status || 'available',
        variant_id || null,
        shop,
      ]
    );

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error logging recommendation:', error);
    res.status(500).json({ error: 'Error logging recommendation' });
  }
});

router.post('/api/log-add-to-cart', async (req, res) => {
  try {
    const { shop, recommendation_token, variant_id, product_id, chart_id, recommended_size } = req.body;
    const db = await dbPromise;

    if (!shop || !recommendation_token) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    let result = await db.run(
      `UPDATE size_recommendation_analytics
       SET added_to_cart_at = CURRENT_TIMESTAMP,
           variant_id = COALESCE(?, variant_id)
       WHERE shop = ? AND recommendation_token = ?`,
      [variant_id || null, shop, recommendation_token]
    );

    if ((!result?.changes || Number(result.changes) === 0) && product_id && chart_id && recommended_size) {
      result = await db.run(
        `UPDATE size_recommendation_analytics
         SET added_to_cart_at = CURRENT_TIMESTAMP,
             variant_id = COALESCE(?, variant_id),
             recommendation_token = COALESCE(recommendation_token, ?)
         WHERE id = (
           SELECT id FROM size_recommendation_analytics
           WHERE shop = ? AND product_id = ? AND chart_id = ? AND recommended_size = ?
           ORDER BY created_at DESC
           LIMIT 1
         )`,
        [variant_id || null, recommendation_token, shop, product_id, chart_id, recommended_size]
      );
    }

    res.status(200).json({ success: true, updated: Number(result?.changes || 0) });
  } catch (error) {
    console.error('Error logging add to cart:', error);
    res.status(500).json({ error: 'Error logging add to cart' });
  }
});

router.post('/api/log-widget-view', async (req, res) => {
  try {
    const { shop, product_id, chart_id } = req.body;
    const db = await dbPromise;

    if (!shop || !product_id || !chart_id) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    await db.run(
      'INSERT INTO analytics_events (shop, event_type, event_data) VALUES (?, ?, ?)',
      [shop, 'widget_view', JSON.stringify({ product_id, chart_id })]
    );

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error logging widget view:', error);
    res.status(500).json({ error: 'Error logging widget view' });
  }
});

router.get('/api/analytics/product/:productId', validateAuthenticatedSession, async (req, res) => {
  try {
    const { productId } = req.params;
    const { shop, range = 'last7days' } = req.query;
    if (!shop) {
      return res.status(400).json({ error: 'Missing shop parameter' });
    }

    const db = await dbPromise;
    const analytics = await buildAnalyticsResponse(db, shop, range);
    const product = analytics.productPerformance.find((item) => String(item.product_id) === String(productId));

    if (!product) {
      return res.status(404).json({ error: 'Product analytics not found' });
    }

    const recommendationRows = analytics.productPerformance;
    res.status(200).json({
      product,
      analytics: analytics.summary,
      relatedProducts: recommendationRows,
    });
  } catch (error) {
    console.error('Error fetching product analytics:', error);
    res.status(500).json({ error: 'Failed to fetch product analytics' });
  }
});

router.get('/api/analytics/debug', async (req, res) => {
  try {
    const { shop, range = 'all' } = req.query;
    if (!shop) {
      return res.status(400).json({ error: 'Missing shop parameter' });
    }

    const db = await dbPromise;
    const startDate = getDateRange(range);
    const [recommendations, purchases] = await Promise.all([
      getRecommendations(db, shop, startDate),
      getPurchaseAttributions(db, shop, startDate),
    ]);

    res.json({
      range,
      recommendations,
      purchases,
    });
  } catch (error) {
    console.error('Error in analytics debug endpoint:', error);
    res.status(500).json({ error: 'Failed to get debug data' });
  }
});

router.get('/api/analytics/debug-product', async (req, res) => {
  try {
    const { shop, product_id, range = 'all' } = req.query;
    if (!shop || !product_id) {
      return res.status(400).json({ error: 'Missing shop or product_id parameter' });
    }

    const db = await dbPromise;
    const startDate = getDateRange(range);
    const recommendations = (await getRecommendations(db, shop, startDate)).filter((item) => String(item.product_id) === String(product_id));
    const purchases = (await getPurchaseAttributions(db, shop, startDate)).filter((item) => String(item.product_id) === String(product_id));

    res.json({
      product_id,
      recommendation_count: recommendations.length,
      purchase_count: purchases.length,
      recommendations,
      purchases,
    });
  } catch (error) {
    console.error('Error in debug-product endpoint:', error);
    res.status(500).json({ error: 'Failed to get debug data' });
  }
});

router.get('/api/analytics/debug-recommendations', async (req, res) => {
  try {
    const { shop, range = 'all' } = req.query;
    if (!shop) {
      return res.status(400).json({ error: 'Missing shop parameter' });
    }

    const db = await dbPromise;
    const recommendations = await getRecommendations(db, shop, getDateRange(range));
    res.json({
      total_recommendations: recommendations.length,
      recommendations,
    });
  } catch (error) {
    console.error('Error in debug-recommendations endpoint:', error);
    res.status(500).json({ error: 'Failed to get recommendations data' });
  }
});

export default router;
