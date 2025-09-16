import { Router } from "express";
import { validateAuthenticatedSession } from "../shopify.js";
import shopify from "../shopify.js";
import { getDb } from "../db.js";

const router = Router();

// Test endpoint to verify analytics router is working
if (process.env.NODE_ENV === 'development') {
router.get("/api/analytics-test", (req, res) => {
  console.log('Analytics test endpoint reached!');
  res.json({ message: 'Analytics router is working' });
});
}

// Initialize database connection
const dbPromise = getDb();

// Create analytics tables if they don't exist
async function initializeAnalyticsTables() {
  const db = await dbPromise;
  
  // Use run for portability (SQLite/Postgres)
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
}

initializeAnalyticsTables().catch(console.error);

// Helper function to get date range
function getDateRange(range) {
  const now = new Date();
  switch (range) {
    case 'last7days':
      return new Date(now.setDate(now.getDate() - 7));
    case 'last30days':
      return new Date(now.setDate(now.getDate() - 30));
    case 'last90days':
      return new Date(now.setDate(now.getDate() - 90));
    default:
      return new Date(now.setDate(now.getDate() - 7));
  }
}

// Get analytics data
router.get("/api/analytics", validateAuthenticatedSession, async (req, res) => {
  try {
    const { shop, range = 'last7days', metric = 'views' } = req.query;
    const db = await dbPromise;
    
    const startDate = getDateRange(range);
    
    // Get total recommendations from size_recommendation_analytics
    const recommendationsResult = await db.get(
      'SELECT COUNT(*) as count FROM size_recommendation_analytics WHERE created_at >= ? AND shop = ?',
      [startDate.toISOString(), shop]
    );
    const totalRecommendations = recommendationsResult.count || 0;
    
    // Get total views from analytics_events
    const viewsResult = await db.get(
      'SELECT COUNT(*) as count FROM analytics_events WHERE event_type = ? AND created_at >= ?',
      ['widget_view', startDate.toISOString()]
    );
    const totalViews = viewsResult.count || 0;
    
    // Get top products by recommendations
    const topProductsByRecommendations = await db.all(`
      SELECT 
        sra.product_id,
        (
          SELECT product_title FROM product_charts pc
          WHERE pc.product_id = sra.product_id 
          AND pc.shop_domain = ?
          ORDER BY pc.id DESC
          LIMIT 1
        ) as product_title,
        (
          SELECT product_handle FROM product_charts pc
          WHERE pc.product_id = sra.product_id 
          AND pc.shop_domain = ?
          ORDER BY pc.id DESC
          LIMIT 1
        ) as product_handle,
        COUNT(sra.id) as recommendation_count
      FROM size_recommendation_analytics sra
      WHERE sra.created_at >= ?
        AND sra.shop = ?
      GROUP BY sra.product_id
      ORDER BY recommendation_count DESC
      LIMIT 10
    `, [shop, shop, startDate.toISOString(), shop]);
    
    // Get top products by views (from analytics_events)
    const topProductsByViews = await db.all(`
      SELECT 
        json_extract(ae.event_data, '$.product_id') as product_id,
        (
          SELECT product_title FROM product_charts pc
          WHERE pc.product_id = json_extract(ae.event_data, '$.product_id') 
          AND pc.shop_domain = ?
          ORDER BY pc.id DESC
          LIMIT 1
        ) as product_title,
        (
          SELECT product_handle FROM product_charts pc
          WHERE pc.product_id = json_extract(ae.event_data, '$.product_id') 
          AND pc.shop_domain = ?
          ORDER BY pc.id DESC
          LIMIT 1
        ) as product_handle,
        COUNT(ae.id) as view_count
      FROM analytics_events ae
      WHERE ae.event_type = 'widget_view' 
        AND ae.created_at >= ? 
        AND ae.shop = ?
      GROUP BY json_extract(ae.event_data, '$.product_id')
      ORDER BY view_count DESC
      LIMIT 10
    `, [shop, shop, startDate.toISOString(), shop]);

    const analyticsData = {
      totalViews: totalViews || 0,
      totalRecommendations: totalRecommendations || 0,
      topProductsByRecommendations: topProductsByRecommendations || [],
      topProductsByViews: topProductsByViews || []
    };

    res.status(200).json(analyticsData);
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ error: 'Failed to fetch analytics data' });
  }
});

// Record analytics event
router.post("/api/analytics/event", validateAuthenticatedSession, async (req, res) => {
  try {
    const { shop, eventType, eventData } = req.body;
    const db = await dbPromise;
    
    await db.run(
      'INSERT INTO analytics_events (shop, event_type, event_data) VALUES (?, ?, ?)',
      [shop, eventType, JSON.stringify(eventData)]
    );

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error recording analytics event:', error);
    res.status(500).json({ error: 'Failed to record analytics event' });
  }
});

// Log size recommendation (called from widget)
router.post("/api/log-recommendation", async (req, res) => {
  try {
    const { shop, product_id, chart_id, recommended_size, measurements } = req.body;
    const db = await dbPromise;
    
    if (!shop || !product_id || !chart_id || !recommended_size) {
      return res.status(400).json({ error: "Missing required parameters" });
    }

    // Log the recommendation ONLY (don't double-count as a view)
    await db.run(
      `INSERT INTO size_recommendation_analytics 
       (product_id, chart_id, recommended_size, measurements, created_at, shop) 
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?)`,
      [
        product_id,
        chart_id,
        recommended_size,
        JSON.stringify(measurements),
        shop
      ]
    );

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error logging recommendation:', error);
    res.status(500).json({ error: "Error logging recommendation" });
  }
});

// Log widget view (called when widget is first displayed/interacted with)
router.post("/api/log-widget-view", async (req, res) => {
  console.log('Widget view logging endpoint called with body:', req.body);
  try {
    const { shop, product_id, chart_id } = req.body;
    console.log('Extracted data:', { shop, product_id, chart_id });
    const db = await dbPromise;
    
    if (!shop || !product_id || !chart_id) {
      console.log('Missing required parameters');
      return res.status(400).json({ error: "Missing required parameters" });
    }

    console.log('Inserting widget view into database...');
    // Log the widget view
    await db.run(
      'INSERT INTO analytics_events (shop, event_type, event_data) VALUES (?, ?, ?)',
      [shop, 'widget_view', JSON.stringify({ product_id, chart_id })]
    );
    console.log('Widget view successfully logged to database');

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error logging widget view:', error);
    res.status(500).json({ error: "Error logging widget view" });
  }
});

// Get detailed analytics for a specific product
router.get("/api/analytics/product/:productId", validateAuthenticatedSession, async (req, res) => {
  try {
    const { productId } = req.params;
    const { shop, range = 'last7days' } = req.query;
    const db = await dbPromise;
    
    const startDate = getDateRange(range);
    
    // Get product details
    const productDetails = await db.get(
      'SELECT * FROM product_charts WHERE product_id = ? AND shop_domain = ?',
      [productId, shop]
    );
    
    if (!productDetails) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    // Get product analytics
    const analytics = await db.get(`
      SELECT 
        COUNT(ae.id) as total_views,
        COUNT(sra.id) as total_recommendations
      FROM product_charts pc
      LEFT JOIN analytics_events ae ON json_extract(ae.event_data, '$.product_id') = pc.product_id 
        AND ae.event_type = 'widget_view' 
        AND ae.created_at >= ?
        AND ae.shop = ?
      LEFT JOIN size_recommendation_analytics sra ON sra.product_id = pc.product_id 
        AND sra.created_at >= ?
        AND sra.shop = ?
      WHERE pc.product_id = ? AND pc.shop_domain = ?
    `, [startDate.toISOString(), shop, startDate.toISOString(), shop, productId, shop]);
    
    // Get size distribution
    const sizeDistribution = await db.all(`
      SELECT 
        recommended_size,
        COUNT(*) as count
      FROM size_recommendation_analytics
      WHERE product_id = ? AND created_at >= ? AND shop = ?
      GROUP BY recommended_size
      ORDER BY count DESC
    `, [productId, startDate.toISOString(), shop]);
    
    // Get daily activity
    const dailyActivity = await db.all(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as recommendations
      FROM size_recommendation_analytics
      WHERE product_id = ? AND created_at >= ? AND shop = ?
      GROUP BY DATE(created_at)
      ORDER BY date DESC
      LIMIT 30
    `, [productId, startDate.toISOString(), shop]);
    
    // Get recent recommendations with measurements
    const recentRecommendations = await db.all(`
      SELECT 
        recommended_size,
        measurements,
        created_at
      FROM size_recommendation_analytics
      WHERE product_id = ? AND created_at >= ? AND shop = ?
      ORDER BY created_at DESC
      LIMIT 20
    `, [productId, startDate.toISOString(), shop]);
    
    const productAnalytics = {
      product: productDetails,
      analytics: analytics || { total_views: 0, total_recommendations: 0 },
      sizeDistribution: sizeDistribution || [],
      dailyActivity: dailyActivity || [],
      recentRecommendations: recentRecommendations || []
    };
    
    res.status(200).json(productAnalytics);
  } catch (error) {
    console.error('Error fetching product analytics:', error);
    res.status(500).json({ error: 'Failed to fetch product analytics' });
  }
});

// Debug endpoint to check analytics data
router.get("/api/analytics/debug", async (req, res) => {
  try {
    const { shop } = req.query;
    const db = await dbPromise;
    
    // Get all widget_view events for this shop
    const events = await db.all(`
      SELECT 
        id,
        shop,
        event_type,
        event_data,
        created_at
      FROM analytics_events 
      WHERE shop = ? AND event_type = 'widget_view'
      ORDER BY created_at DESC
      LIMIT 50
    `, [shop]);
    
    // Get product details for these events
    const productEvents = events.map(event => {
      const eventData = JSON.parse(event.event_data);
      return {
        id: event.id,
        shop: event.shop,
        product_id: eventData.product_id,
        chart_id: eventData.chart_id,
        created_at: event.created_at
      };
    });
    
    res.json({
      total_events: events.length,
      events: productEvents
    });
  } catch (error) {
    console.error('Error in debug endpoint:', error);
    res.status(500).json({ error: 'Failed to get debug data' });
  }
});

// Debug endpoint to check product_charts data
router.get("/api/analytics/debug-product", async (req, res) => {
  try {
    const { shop, product_id } = req.query;
    const db = await dbPromise;
    
    // Get all product_charts entries for this product
    const productCharts = await db.all(`
      SELECT 
        id,
        chart_id,
        product_id,
        product_title,
        product_handle,
        product_image,
        shop_domain,
        created_at
      FROM product_charts 
      WHERE product_id = ? AND shop_domain = ?
      ORDER BY created_at DESC
    `, [product_id, shop]);
    
    // Get analytics events for this product
    const events = await db.all(`
      SELECT 
        id,
        shop,
        event_type,
        event_data,
        created_at
      FROM analytics_events 
      WHERE shop = ? AND event_type = 'widget_view' AND json_extract(event_data, '$.product_id') = ?
      ORDER BY created_at DESC
    `, [shop, product_id]);
    
    res.json({
      product_charts_count: productCharts.length,
      product_charts: productCharts,
      events_count: events.length,
      events: events
    });
  } catch (error) {
    console.error('Error in debug-product endpoint:', error);
    res.status(500).json({ error: 'Failed to get debug data' });
  }
});

// Debug endpoint to check size_recommendation_analytics data
router.get("/api/analytics/debug-recommendations", async (req, res) => {
  try {
    const { shop } = req.query;
    const db = await dbPromise;
    
    // Get all size recommendations
    const recommendations = await db.all(`
      SELECT 
        id,
        product_id,
        chart_id,
        recommended_size,
        measurements,
        created_at
      FROM size_recommendation_analytics 
      ORDER BY created_at DESC
      LIMIT 50
    `);
    
    res.json({
      total_recommendations: recommendations.length,
      recommendations: recommendations
    });
  } catch (error) {
    console.error('Error in debug-recommendations endpoint:', error);
    res.status(500).json({ error: 'Failed to get recommendations data' });
  }
});

export default router; 