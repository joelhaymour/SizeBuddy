import { Router } from 'express';
import shopify, { validateAuthenticatedSession } from "../shopify.js";
import { requireActiveSubscription } from './billing.js';

const router = Router();

// Use a simple middleware to add CORS headers instead of authentication
router.use('/api/size-recommendations', (req, res, next) => {
  // Add CORS headers
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  next();
});

// Get all size recommendations
router.get('/api/size-recommendations', async (req, res) => {
  const { shop } = req.query;
  
  if (!shop) {
    console.log('Missing shop parameter in request:', req.query);
    return res.status(400).json({ error: "Missing shop parameter" });
  }

  console.log(`Fetching size recommendations for shop: ${shop}`);

  try {
    const recommendations = await req.app.locals.db.all(
      `SELECT * FROM size_charts WHERE shop_domain = ? ORDER BY created_at DESC`,
      [shop]
    );

    // For each recommendation, get the associated products
    for (const recommendation of recommendations) {
      try {
        // Parse chart_data from JSON string to object
        if (recommendation.chart_data && typeof recommendation.chart_data === 'string') {
          try {
            recommendation.chart_data = JSON.parse(recommendation.chart_data);
          } catch (parseError) {
            console.error(`Error parsing chart_data for recommendation ${recommendation.id}:`, parseError);
            // Keep it as a string if parsing fails
          }
        }
        
        const products = await req.app.locals.db.all(
          `SELECT * FROM product_charts WHERE chart_id = ?`,
          [recommendation.id]
        );
        recommendation.products = products;
      } catch (err) {
        console.error(`Error fetching products for recommendation ${recommendation.id}:`, err);
        recommendation.products = [];
      }
    }

    res.json(recommendations);
  } catch (error) {
    console.error('Error fetching size recommendations:', error);
    res.status(500).json({ error: "Error fetching size recommendations" });
  }
});

// Get a single size recommendation
router.get('/api/size-recommendations/:id', async (req, res) => {
  const recommendationId = req.params.id;
  const { shop } = req.query;

  if (!shop) {
    return res.status(400).send({ error: "Missing shop parameter" });
  }

  try {
    const recommendation = await req.app.locals.db.get(
      `SELECT * FROM size_charts WHERE id = ? AND shop_domain = ?`,
      [recommendationId, shop]
    );

    if (!recommendation) {
      return res.status(404).send({ error: "Size recommendation not found" });
    }

    // Parse chart_data and optional_measurements from JSON strings to objects
    let chartData = {};
    let optionalMeasurements = {};

    try {
      if (recommendation.chart_data) {
        chartData = JSON.parse(recommendation.chart_data);
      }
      if (recommendation.optional_measurements) {
        optionalMeasurements = JSON.parse(recommendation.optional_measurements);
      }
    } catch (parseError) {
      console.error(`Error parsing data for recommendation ${recommendation.id}:`, parseError);
    }

    // Combine the data
    const responseData = {
      ...recommendation,
      chart_data: {
        ...chartData,
        optional_measurements: optionalMeasurements
      }
    };

    // Get associated products
    const products = await req.app.locals.db.all(
      `SELECT * FROM product_charts WHERE chart_id = ?`,
      [recommendationId]
    );
    
    responseData.products = products;
    res.json(responseData);
  } catch (error) {
    console.error('Error fetching size recommendation:', error);
    res.status(500).send({ error: "Error fetching size recommendation" });
  }
});

// Create a new size recommendation
router.post('/api/size-recommendations', validateAuthenticatedSession, requireActiveSubscription, async (req, res) => {
  const {
    shop,
    chart_name,
    chart_data,
    category,
    subcategory,
    fit_type,
    products,
  } = req.body;

  const sessionShop = res.locals?.shopify?.session?.shop;
  const resolvedShop = shop || sessionShop;

  if (!resolvedShop || !chart_name || !chart_data || !category || !fit_type) {
    return res.status(400).send({ error: "Missing required fields" });
  }

  // Debug the incoming products data
  console.log('Creating/updating recommendation with products:', products);

  try {
    // Enforce plan limits (Free: 2, Pro: 4, Premium: unlimited)
    const sub = await req.app.locals.db.get('SELECT plan FROM subscriptions WHERE shop = ?', [resolvedShop]);
    const plan = (sub?.plan || 'Free');
    const existingCountRow = await req.app.locals.db.get('SELECT COUNT(*) as cnt FROM size_charts WHERE shop_domain = ?', [resolvedShop]);
    const cnt = existingCountRow?.cnt || 0;
    const limit = plan === 'Premium' ? Infinity : (plan === 'Pro' ? 4 : 2);
    if (cnt >= limit) {
      return res.status(403).json({ error: `Plan limit reached. Your plan (${plan}) allows ${plan === 'Premium' ? 'unlimited' : limit} charts.` });
    }
    // Ensure chart_data is a JSON string
    const chartDataString = typeof chart_data === 'string' 
      ? chart_data 
      : JSON.stringify(chart_data);
    
    // Insert the size recommendation
    const result = await req.app.locals.db.run(
      `INSERT INTO size_charts (name, chart_data, category, subcategory, fit_type, shop_domain, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      [chart_name, chartDataString, category, subcategory || "", fit_type, resolvedShop]
    );

    const recommendationId = result.lastID;

    // Insert associated products if any
    if (products && products.length > 0) {
      console.log(`Saving ${products.length} products for recommendation ${recommendationId}`);
      
      const stmt = await req.app.locals.db.prepare(
        `INSERT INTO product_charts (chart_id, product_id, product_title, product_handle, product_image, shop_domain)
         VALUES (?, ?, ?, ?, ?, ?)`
      );

      for (const product of products) {
        console.log('Saving product with image:', {
          title: product.title, 
          handle: product.handle, 
          image: product.image
        });
        
        await stmt.run(
          recommendationId,
          product.id,
          product.title,
          product.handle,
          product.image,
          shop
        );
      }

      await stmt.finalize();
    }

    res.status(201).json({ 
      id: recommendationId, 
      message: "Size recommendation created successfully" 
    });
  } catch (error) {
    console.error('Error creating size recommendation:', error);
    res.status(500).send({ error: `Error creating size recommendation: ${error.message}` });
  }
});

// Update a size recommendation
router.put('/api/size-recommendations/:id', validateAuthenticatedSession, requireActiveSubscription, async (req, res) => {
  const recommendationId = req.params.id;
  const {
    shop,
    chart_name,
    chart_data,
    category,
    subcategory,
    fit_type,
    products,
  } = req.body;

  const sessionShop = res.locals?.shopify?.session?.shop;
  const resolvedShop = shop || sessionShop;
  if (!resolvedShop || !chart_name || !chart_data || !category || !fit_type) {
    return res.status(400).send({ error: "Missing required fields" });
  }

  try {
    // Extract optional measurements from chart_data
    const optional_measurements = chart_data.optional_measurements || {};
    const optional_measurements_json = JSON.stringify(optional_measurements);

    // Update the size recommendation
    await req.app.locals.db.run(
      `UPDATE size_charts 
       SET name = ?, 
           chart_data = ?, 
           category = ?, 
           subcategory = ?, 
           fit_type = ?, 
           optional_measurements = ?,
           updated_at = datetime('now')
       WHERE id = ? AND shop_domain = ?`,
      [
        chart_name,
        JSON.stringify(chart_data),
        category,
        subcategory || "",
        fit_type,
        optional_measurements_json,
        recommendationId,
        resolvedShop
      ]
    );

    // Update associated products
    if (products && products.length > 0) {
      console.log(`Re-saving ${products.length} products for recommendation ${recommendationId}`);
      
      // First, delete existing product associations
      await req.app.locals.db.run(
        `DELETE FROM product_charts WHERE chart_id = ?`,
        [recommendationId]
      );

      // Then insert new ones
      const stmt = await req.app.locals.db.prepare(
        `INSERT INTO product_charts (chart_id, product_id, product_title, product_handle, product_image, shop_domain)
         VALUES (?, ?, ?, ?, ?, ?)`
      );

      for (const product of products) {
        console.log('Updating product with image:', {
          title: product.title,
          handle: product.handle,
          image: product.image
        });
        
        await stmt.run(
          recommendationId,
          product.id,
          product.title,
          product.handle,
          product.image,
          shop
        );
      }

      await stmt.finalize();
    }

    res.json({ message: "Size recommendation updated successfully" });
  } catch (error) {
    console.error('Error updating size recommendation:', error);
    res.status(500).send({ error: "Error updating size recommendation" });
  }
});

// Delete a size recommendation
router.delete('/api/size-recommendations/:id', async (req, res) => {
  const recommendationId = req.params.id;
  const { shop } = req.query;

  if (!shop) {
    return res.status(400).send({ error: "Missing shop parameter" });
  }

  try {
    // Check if the recommendation exists
    const recommendation = await req.app.locals.db.get(
      `SELECT id FROM size_charts WHERE id = ? AND shop_domain = ?`,
      [recommendationId, shop]
    );

    if (!recommendation) {
      return res.status(404).send({ error: "Size recommendation not found" });
    }

    // Delete the recommendation (product associations will be deleted via foreign key constraint)
    await req.app.locals.db.run(
      `DELETE FROM size_charts WHERE id = ? AND shop_domain = ?`,
      [recommendationId, shop]
    );

    res.json({ message: "Size recommendation deleted successfully" });
  } catch (error) {
    console.error('Error deleting size recommendation:', error);
    res.status(500).send({ error: `Error deleting size recommendation: ${error.message}` });
  }
});

// Fetch product image from Shopify Admin API
router.get("/api/fetch-product-image", async (req, res) => {
  try {
    const { product_id, shop } = req.query;
    
    if (!product_id || !shop) {
      return res.status(400).json({ error: 'Missing product_id or shop parameter' });
    }
    
    // This endpoint doesn't require authentication since it's called during product selection
    // We'll use a different approach - let the frontend handle the Shopify API call
    // For now, return a success response and let the frontend handle image fetching
    
    res.json({ 
      success: true, 
      message: 'Product image fetch request received',
      product_id: product_id,
      shop: shop
    });
  } catch (error) {
    console.error('Error in fetch-product-image:', error);
    res.status(500).json({ error: 'Failed to process product image request' });
  }
});

export default router; 