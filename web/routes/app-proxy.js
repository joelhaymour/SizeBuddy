import { Router } from 'express';
import crypto from 'crypto';
import { readFileSync } from 'fs';
import path from 'path';
import shopify from '../shopify.js';
import { fileURLToPath } from 'url';
import { fetchProductVariantsForStorefront } from '../utils/productVariants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = Router();

function normalizeAndFilterChartSizes(sizes = []) {
  if (!Array.isArray(sizes)) return [];

  return sizes
    .map((size) => ({
      ...size,
      name: size.name || size.size,
      size: size.size || size.name,
      enabled: size.enabled !== false,
    }))
    .filter((size) => size.enabled !== false);
}

// Verify the app proxy signature
const verifyAppProxySignature = (req, res, next) => {
  const { signature, ...params } = req.query;
  
  console.log('App Proxy Request:', {
    path: req.path,
    query: req.query,
    fullUrl: req.originalUrl
  });
  
  if (!signature) {
    return res.status(401).send({ error: 'Signature missing' });
  }

  // Get the app's API secret from environment variables
  const secret = process.env.SHOPIFY_API_SECRET;
  
  if (!secret) {
    console.error('SHOPIFY_API_SECRET is not set in environment variables');
    return res.status(500).send({ error: 'Server configuration error' });
  }

  // Sort the parameters
  const sortedParams = Object.keys(params)
    .sort()
    .reduce((acc, key) => {
      acc[key] = params[key];
      return acc;
    }, {});

  // Create a string of key=value pairs
  const queryString = Object.keys(sortedParams)
    .map(key => `${key}=${sortedParams[key]}`)
    .join('');

  // Calculate the HMAC
  const hmac = crypto
    .createHmac('sha256', secret)
    .update(queryString)
    .digest('hex');

  // Compare the calculated HMAC with the provided signature
  if (hmac !== signature) {
    return res.status(401).send({ error: 'Invalid signature' });
  }

  // If the signature is valid, proceed to the next middleware
  next();
};

// Simple test endpoint that logs all information (development only)
if (process.env.NODE_ENV === 'development') {
router.get('/test', async (req, res) => {
  console.log('App Proxy Test Route Hit:', {
    path: req.path,
    query: req.query,
    headers: req.headers,
    originalUrl: req.originalUrl
  });
  
  return res.json({
    success: true,
    message: 'App proxy test route hit successfully',
    query: req.query
  });
});
}

// Serve widget script via app proxy – no signature check so the script always loads (script is public; data endpoints still require signature)
router.get('/widget.js', (req, res) => {
  const scriptPath = path.join(__dirname, '..', '..', 'extensions', 'size-buddy-widget', 'assets', 'size-buddy-v4.js');
  try {
    const script = readFileSync(scriptPath, 'utf8');
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(script);
  } catch (err) {
    console.error('Error serving widget.js via app proxy:', err);
    res.status(500).send('Error loading widget script');
  }
});

// Get size recommendation for a product
router.get('/api/proxy/size-recommendation', verifyAppProxySignature, async (req, res) => {
  const { shop, productId } = req.query;

  if (!shop) {
    return res.status(400).send({ error: "Missing shop parameter" });
  }

  if (!productId) {
    return res.status(400).send({ error: "Missing productId parameter" });
  }

  try {
    // Find the chart associated with this product - get the most recent one
    const productChart = await req.app.locals.db.get(
      `SELECT * FROM product_charts WHERE shop_domain = ? AND product_id = ? ORDER BY created_at DESC LIMIT 1`,
      [shop, productId]
    );

    if (!productChart) {
      console.log(`No size chart found for product ${productId} in shop ${shop}`);
      return res.status(404).send({ error: "No size chart found for this product" });
    }

    console.log(`Found chart ID ${productChart.chart_id} for product ${productId}`);

    // Get the size chart (skip locked charts)
    const lockedCheck = process.env.DATABASE_URL ? 'FALSE' : '0';
    const sizeChart = await req.app.locals.db.get(
      `SELECT * FROM size_charts WHERE id = ? AND shop_domain = ? AND (locked IS NULL OR locked = ${lockedCheck})`,
      [productChart.chart_id, shop]
    );

    if (!sizeChart) {
      console.log(`Chart with ID ${productChart.chart_id} not found for shop ${shop}`);
      return res.status(404).send({ error: "Size chart not found" });
    }

    // Parse chart_data from JSON string to object
    if (sizeChart.chart_data && typeof sizeChart.chart_data === 'string') {
      try {
        sizeChart.chart_data = JSON.parse(sizeChart.chart_data);
      } catch (parseError) {
        console.error(`Error parsing chart_data for chart ${sizeChart.id}:`, parseError);
        return res.status(500).send({ 
          error: "Error parsing size chart data",
          details: parseError.message
        });
      }
    }

    // Make sure the chart data is complete
    if (!sizeChart.chart_data || !sizeChart.chart_data.sizes || sizeChart.chart_data.sizes.length === 0) {
      console.log(`Chart ${sizeChart.id} has invalid or empty data`);
      return res.status(400).send({ error: "Chart data is invalid or empty" });
    }

    sizeChart.chart_data.sizes = normalizeAndFilterChartSizes(sizeChart.chart_data.sizes);
    if (sizeChart.chart_data.sizes.length === 0) {
      return res.status(404).send({ error: "No enabled sizes are available for this chart" });
    }

    const productVariants = await fetchProductVariantsForStorefront(shop, productId);
    const customSizeChartImage = sizeChart.custom_size_chart_image || null;
    if (sizeChart.chart_data && typeof sizeChart.chart_data === 'object') {
      sizeChart.chart_data = {
        ...sizeChart.chart_data,
        custom_size_chart_image: customSizeChartImage
      };
    }
    sizeChart.custom_size_chart_image = customSizeChartImage;

    // Get widget customization
    const widgetCustomization = await req.app.locals.db.get(
      `SELECT * FROM widget_customization WHERE shop_id = ?`,
      [shop]
    );

    // Return the size chart and widget customization
    res.json({
      sizeChart,
      product_variants: productVariants,
      widgetCustomization: widgetCustomization || {}
    });
  } catch (error) {
    console.error('Error fetching size recommendation:', error);
    res.status(500).send({ error: "Error fetching size recommendation" });
  }
});

// Get size recommendation based on measurements
router.post('/api/proxy/get-size-recommendation', verifyAppProxySignature, async (req, res) => {
  const { shop, chartId, measurements } = req.body;

  console.log('Size recommendation request received:', { 
    shop, chartId, measurements,
    body: req.body
  });

  if (!shop) {
    return res.status(400).send({ error: "Missing shop parameter" });
  }

  if (!chartId) {
    return res.status(400).send({ error: "Missing chartId parameter" });
  }

  if (!measurements || Object.keys(measurements).length === 0) {
    return res.status(400).send({ error: "Missing measurements" });
  }

  try {
    // Get the size chart (skip locked charts)
    const lockedCheck = process.env.DATABASE_URL ? 'FALSE' : '0';
    const sizeChart = await req.app.locals.db.get(
      `SELECT * FROM size_charts WHERE id = ? AND shop_domain = ? AND (locked IS NULL OR locked = ${lockedCheck})`,
      [chartId, shop]
    );

    if (!sizeChart) {
      console.log(`Chart with ID ${chartId} not found for shop ${shop}`);
      return res.status(404).send({ error: "Size chart not found" });
    }

    console.log(`Found chart: ${sizeChart.name} (ID: ${sizeChart.id})`);

    // Parse chart_data from JSON string to object
    let chartData;
    if (sizeChart.chart_data && typeof sizeChart.chart_data === 'string') {
      try {
        chartData = JSON.parse(sizeChart.chart_data);
        console.log('Successfully parsed chart_data');
      } catch (parseError) {
        console.error(`Error parsing chart_data for chart ${sizeChart.id}:`, parseError);
        return res.status(500).send({ error: "Error parsing size chart data" });
      }
    } else {
      chartData = sizeChart.chart_data;
    }

    if (!chartData) {
      console.log('No chart data found');
      return res.status(400).send({ error: "Chart data not found" });
    }

    // Ensure chartData has a sizes array
    if (!chartData.sizes || !Array.isArray(chartData.sizes) || chartData.sizes.length === 0) {
      console.log('Chart has no sizes array or it is empty');
      return res.status(400).send({ error: "Chart has no size information" });
    }

    chartData.sizes = normalizeAndFilterChartSizes(chartData.sizes);
    if (chartData.sizes.length === 0) {
      return res.status(404).send({ error: "No enabled sizes are available for this chart" });
    }
    
    // =========== CRITICAL BUGFIX FOR SIZING ===========
    // First check if any measurement is exactly at a range boundary
    // This is critical for cases like 30" which is exactly at the upper boundary of XS (28-30")
    console.log("BUGFIX APPLIED - Checking for exact boundary matches");
    
    const boundaryMatches = [];
    let hasBoundaryMatch = false;
    
    // Check each size for boundary matches
    chartData.sizes.forEach(size => {
      const sizeName = size.name || size.size;
      
      // For each user measurement, check if it's exactly at a range boundary
      Object.entries(measurements).forEach(([key, userValue]) => {
        const sizeValue = size[key];
        
        if (!sizeValue) return;
        
        // Process range values like "28-30"
        if (typeof sizeValue === 'string' && sizeValue.includes('-')) {
          const [min, max] = sizeValue.split('-').map(v => parseFloat(v.trim()));
          
          if (!isNaN(min) && !isNaN(max)) {
            // Check if user value is EXACTLY at min or max boundary
            if (userValue === min || userValue === max) {
              console.log(`BOUNDARY MATCH: ${userValue} is exactly at ${userValue === min ? 'min' : 'max'} boundary of range ${min}-${max} for size ${sizeName}`);
              
              boundaryMatches.push({
                size: sizeName,
                key,
                value: userValue,
                isMax: userValue === max,
                range: `${min}-${max}`
              });
              
              hasBoundaryMatch = true;
            }
          }
        }
      });
    });
    
    // If we have boundary matches, use special logic for recommendation
    if (hasBoundaryMatch) {
      console.log('Found boundary matches:', boundaryMatches);
      
      // Count boundary matches by size
      const sizeMatches = {};
      boundaryMatches.forEach(match => {
        sizeMatches[match.size] = sizeMatches[match.size] || { 
          count: 0, 
          maxBoundaries: 0 
        };
        sizeMatches[match.size].count++;
        
        // Count how many are at the MAX boundary
        if (match.isMax) {
          sizeMatches[match.size].maxBoundaries++;
        }
      });
      
      console.log('Boundary matches by size:', sizeMatches);
      
      // For values at MAX boundary, prioritize the smaller size
      // (e.g., for 30" at MAX boundary of XS (28-30"), recommend XS)
      let recommendedSize = null;
      let bestScore = -1;
      
      Object.keys(sizeMatches).forEach(sizeName => {
        const { count, maxBoundaries } = sizeMatches[sizeName];
        // Give extra weight to sizes where the measurement is at the MAX boundary
        const score = count + (maxBoundaries * 2);
        
        if (score > bestScore) {
          bestScore = score;
          recommendedSize = sizeName;
        }
      });
      
      if (recommendedSize) {
        console.log(`Selected ${recommendedSize} based on boundary matches with score ${bestScore}`);
        return res.json({ recommendedSize });
      }
    }
    
    // If no boundary matches, proceed with regular algorithm
    // Calculate the recommended size based on measurements
    const recommendedSize = calculateRecommendedSize(chartData, measurements);
    
    console.log(`Recommended size: ${recommendedSize}`);

    // Return the recommended size
    res.json({ recommendedSize });
  } catch (error) {
    console.error('Error calculating size recommendation:', error);
    res.status(500).send({ error: "Error calculating size recommendation" });
  }
});

// Helper function to calculate the recommended size
function calculateRecommendedSize(chartData, userMeasurements) {
  console.log('Calculating size recommendation with data:', { 
    chartSizes: chartData.sizes, 
    userMeasurements 
  });
  
  const { sizes, measurements: chartMeasurements } = chartData;
  
  // Initialize scores for each size
  const sizeScores = {};
  sizes.forEach(size => {
    sizeScores[size.name || size.size] = 0;
  });

  // Calculate score for each size based on how well measurements match
  Object.keys(userMeasurements).forEach(measurementKey => {
    const userValue = parseFloat(userMeasurements[measurementKey]);
    
    if (isNaN(userValue)) {
      console.log(`Skipping ${measurementKey} because value is not a number: ${userMeasurements[measurementKey]}`);
      return;
    }
    
    console.log(`Processing measurement ${measurementKey} with user value ${userValue}`);
    
    // Find the measurement in the chart
    const chartMeasurement = chartMeasurements ? 
      chartMeasurements.find(m => m.name === measurementKey) : null;
    
    // For each size, calculate how well the measurement fits
    sizes.forEach(size => {
      // Use either name or size property
      const sizeName = size.name || size.size;

      // Get the size's value for this measurement (could be in values object or directly on size)
      let sizeValue = size.values ? size.values[measurementKey] : size[measurementKey];
      
      // Skip if this size doesn't have a value for this measurement
      if (!sizeValue) {
        console.log(`Size ${sizeName} has no value for ${measurementKey}`);
        return;
      }
      
      console.log(`Comparing size ${sizeName} with value ${sizeValue} against user value ${userValue}`);
      
      let score = 0;
      
      // Handle range values like "28-30"
      if (typeof sizeValue === 'string' && sizeValue.includes('-')) {
        const [min, max] = sizeValue.split('-').map(v => parseFloat(v.trim()));
        
        if (!isNaN(min) && !isNaN(max)) {
          // Perfect score if user's measurement is in the range (inclusive of boundaries)
          // Critically important: userValue <= max (not <) to include the upper boundary
          if (userValue >= min && userValue <= max) {
            score = 1.0;
            console.log(`EXACT MATCH: ${userValue} is within range ${min}-${max} for size ${sizeName}`);
          } else {
            // Partial score based on how close to the range
            const rangeWidth = max - min;
            const distanceFromRange = userValue < min ? min - userValue : userValue - max;
            
            // Make tolerance smaller to avoid boundary issues - only 30% of range width
            const tolerance = rangeWidth * 0.3; 
            score = Math.max(0, 1 - (distanceFromRange / tolerance));
            console.log(`PARTIAL: ${userValue} is outside range ${min}-${max} for size ${sizeName}, score: ${score.toFixed(2)}`);
          }
        }
      } else {
        // For non-range values, calculate based on difference
        const parsedValue = parseFloat(sizeValue);
        if (!isNaN(parsedValue)) {
          const difference = Math.abs(userValue - parsedValue);
          const maxDifference = chartMeasurement?.tolerance || 5; // Default to 5 if no tolerance defined
          
          score = Math.max(0, 1 - (difference / maxDifference));
          console.log(`NUMERIC: ${userValue} compared to ${parsedValue} for size ${sizeName}, score: ${score.toFixed(2)}`);
        }
      }
      
      // Add to the size's total score
      sizeScores[sizeName] = (sizeScores[sizeName] || 0) + score;
      console.log(`Updated score for ${sizeName}: ${sizeScores[sizeName].toFixed(2)}`);
    });
  });
  
  // Find the size with the highest score
  let bestSize = null;
  let bestScore = -1;
  
  Object.keys(sizeScores).forEach(sizeName => {
    console.log(`Final score for size ${sizeName}: ${sizeScores[sizeName].toFixed(2)}`);
    if (sizeScores[sizeName] > bestScore) {
      bestScore = sizeScores[sizeName];
      bestSize = sizeName;
    }
  });
  
  console.log(`Best matching size: ${bestSize} with score ${bestScore.toFixed(2)}`);
  return bestSize;
}

// New endpoint to log size recommendations for analytics
router.post('/api/proxy/log-recommendation', verifyAppProxySignature, async (req, res) => {
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

  if (!shop || !product_id || !chart_id || !recommended_size) {
    return res.status(400).send({ error: "Missing required parameters" });
  }

  try {
    await req.app.locals.db.run(
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

    res.status(200).send({ success: true });
  } catch (error) {
    console.error('Error logging recommendation:', error);
    res.status(500).send({ error: "Error logging recommendation" });
  }
});

router.post('/api/proxy/log-add-to-cart', verifyAppProxySignature, async (req, res) => {
  const { shop, recommendation_token, variant_id, product_id, chart_id, recommended_size } = req.body;

  if (!shop || !recommendation_token) {
    return res.status(400).send({ error: "Missing required parameters" });
  }

  try {
    let result = await req.app.locals.db.run(
      `UPDATE size_recommendation_analytics
       SET added_to_cart_at = CURRENT_TIMESTAMP,
           variant_id = COALESCE(?, variant_id)
       WHERE shop = ? AND recommendation_token = ?`,
      [variant_id || null, shop, recommendation_token]
    );

    if ((!result?.changes || Number(result.changes) === 0) && product_id && chart_id && recommended_size) {
      result = await req.app.locals.db.run(
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

    res.status(200).send({ success: true, updated: Number(result?.changes || 0) });
  } catch (error) {
    console.error('Error logging add to cart:', error);
    res.status(500).send({ error: "Error logging add to cart" });
  }
});

// Optional signature verification: skip for GET size-charts when product_id + shop are present (storefront often gets 400 otherwise)
const optionalAppProxySignature = (req, res, next) => {
  const hasProductId = !!req.query.product_id;
  const hasShop = !!(Array.isArray(req.query.shop) ? req.query.shop[0] : req.query.shop);
  if (req.method === 'GET' && hasProductId && hasShop) {
    return next(); // allow through without signature so storefront works
  }
  return verifyAppProxySignature(req, res, next);
};

// Get size chart data for a product (main endpoint for widget)
router.get('/size-charts', optionalAppProxySignature, async (req, res) => {
  const { product_id } = req.query;
  const normalizeHeaderHost = (value) => {
    const raw = Array.isArray(value) ? value[0] : value;
    return typeof raw === 'string' ? raw.split(',')[0].trim() : undefined;
  };
  // Shop: Shopify adds it to query when proxying; fallbacks: forwarded headers, then Referer host
  const forwardedHost = normalizeHeaderHost(req.headers['x-forwarded-host']);
  const shopifyShopDomain = normalizeHeaderHost(req.headers['x-shopify-shop-domain']);
  let shop = (Array.isArray(req.query.shop) ? req.query.shop[0] : req.query.shop) || shopifyShopDomain || forwardedHost;
  
  if (!shop && req.headers['referer']) {
    try {
      const refererUrl = new URL(req.headers['referer']);
      const host = refererUrl.hostname || refererUrl.host;
      if (host && (host.endsWith('.myshopify.com') || host.includes('myshopify.com'))) {
        shop = host;
      } else if (host) {
        shop = host; // custom domain – use as-is for DB lookup
      }
    } catch (e) {
      // ignore
    }
  }
  
  console.log('App Proxy size-charts route hit:', {
    path: req.path,
    query: req.query,
    'x-forwarded-host': forwardedHost,
    'x-shopify-shop-domain': shopifyShopDomain,
    referer: req.headers['referer'],
    resolvedShop: shop
  });
  
  if (!product_id) {
    return res.status(400).json({ error: 'Missing product_id parameter' });
  }
  
  if (!shop) {
    return res.status(400).json({ error: 'Missing shop parameter (ensure app proxy URL includes /app-proxy and request is proxied by Shopify)' });
  }
  
  const shopDomain = shop.includes('.myshopify.com') ? shop : shop.replace(/^https?:\/\//, '').split('/')[0];
  
  try {
    // Find charts associated with this product - get the most recent one
    const productChart = await req.app.locals.db.get(
      `SELECT * FROM product_charts WHERE product_id = ? AND shop_domain = ? ORDER BY created_at DESC LIMIT 1`,
      [product_id, shopDomain]
    );
    
    console.log('Product chart query result:', { productChart });
    
    if (!productChart) {
      console.log(`No size chart found for product ${product_id}`);
      return res.json({ found: false, error: 'No size chart found for this product' });
    }
    
    // Get the chart details (skip locked charts)
    const lockedCheck = process.env.DATABASE_URL ? 'FALSE' : '0';
    const chart = await req.app.locals.db.get(
      `SELECT * FROM size_charts WHERE id = ? AND shop_domain = ? AND (locked IS NULL OR locked = ${lockedCheck})`,
      [productChart.chart_id, shopDomain]
    );
    
    if (!chart) {
      console.log(`Chart with ID ${productChart.chart_id} not found for shop ${shopDomain}`);
      return res.json({ found: false, error: 'Size chart not found' });
    }
    
    console.log('Found size chart:', {
      id: chart.id,
      name: chart.name,
      category: chart.category
    });
    
    // Get the chart data from the chart_data column
    let chartData = null;
    
    if (chart.chart_data) {
      try {
        // Parse the chart_data JSON if it's a string
        chartData = typeof chart.chart_data === 'string' 
          ? JSON.parse(chart.chart_data) 
          : chart.chart_data;
        
        console.log('Successfully parsed chart_data');
      } catch (parseError) {
        console.error('Error parsing chart_data:', parseError);
        return res.json({ 
          found: false, 
          error: 'Error parsing chart data', 
          details: parseError.message 
        });
      }
    }
    
    if (!chartData || !chartData.sizes || chartData.sizes.length === 0) {
      console.log('No valid chart data found, checking chart_sizes table as fallback');
      
      // Fallback: Use the chart_sizes table
      const chartSizes = await req.app.locals.db.all(
        `SELECT * FROM chart_sizes WHERE chart_id = ? ORDER BY display_order`,
        [chart.id]
      );
      
      if (!chartSizes || chartSizes.length === 0) {
        console.log('No sizes found in chart_sizes table either');
        return res.json({ found: false, error: 'No sizes found for this chart' });
      }
      
      // Create a chart data structure from the chart_sizes table
      chartData = {
        name: chart.name,
        sizes: chartSizes.map(size => {
          // Convert each size row to a proper size object
          const sizeObj = { 
            size: size.size,
            name: size.size
          };
          
          // Add all measurements
          ['waist', 'chest', 'hip', 'inseam', 'score', 'height', 'weight'].forEach(field => {
            if (size[field] !== null) {
              sizeObj[field] = size[field];
            }
          });
          
          return sizeObj;
        }),
        // Create a basic measurements array based on what's found in the first size
        measurements: []
      };
      
      // Add measurements based on available fields in the first size
      const firstSize = chartSizes[0];
      ['waist', 'chest', 'hip', 'inseam', 'height', 'weight'].forEach(field => {
        if (firstSize[field] !== null) {
          chartData.measurements.push({
            name: field,
            label: field.charAt(0).toUpperCase() + field.slice(1),
            unit: 'in'
          });
        }
      });
      
      console.log('Created chart data from chart_sizes table:', chartData);
    } else {
      console.log('Using chart data from chart_data column:', {
        name: chartData.name,
        sizeCount: chartData.sizes.length,
        sizes: chartData.sizes.map(s => s.size || s.name)
      });
    }
    
    // For each size, ensure it has consistent name/size properties
    chartData.sizes = normalizeAndFilterChartSizes(chartData.sizes);
    if (chartData.sizes.length === 0) {
      return res.json({ found: false, error: 'No enabled sizes are available for this chart' });
    }
    
    // Prepare the response
    const productVariants = await fetchProductVariantsForStorefront(shopDomain, product_id);
    const customSizeChartImage = chart.custom_size_chart_image || null;
    const response = {
      found: true,
      product_variants: productVariants,
      chart: {
        id: chart.id,
        name: chart.name,
        category: chart.category,
        subcategory: chart.subcategory,
        fit_type: chart.fit_type,
        custom_size_chart_image: customSizeChartImage,
        sizes: chartData.sizes,
        measurements: chartData.measurements || [],
        chart_data: {
          ...chartData,
          custom_size_chart_image: customSizeChartImage
        },
        optional_measurements: chart.optional_measurements ? JSON.parse(chart.optional_measurements) : {},
        product_variants: productVariants
      }
    };
    
    console.log('Sending response with chart containing', chartData.sizes.length, 'sizes');
    res.json(response);
  } catch (error) {
    console.error('Error fetching size chart:', error);
    res.status(500).json({ error: 'Server error', message: error.message });
  }
});

export default router; 
