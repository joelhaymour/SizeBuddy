import { Router } from 'express';
import crypto from 'crypto';

const router = Router();

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

    // Get the size chart
    const sizeChart = await req.app.locals.db.get(
      `SELECT * FROM size_charts WHERE id = ? AND shop_domain = ?`,
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

    // Get widget customization
    const widgetCustomization = await req.app.locals.db.get(
      `SELECT * FROM widget_customization WHERE shop_id = ?`,
      [shop]
    );

    // Return the size chart and widget customization
    res.json({
      sizeChart,
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
    // Get the size chart
    const sizeChart = await req.app.locals.db.get(
      `SELECT * FROM size_charts WHERE id = ? AND shop_domain = ?`,
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
  const { shop, product_id, chart_id, recommended_size, measurements } = req.body;

  if (!shop || !product_id || !chart_id || !recommended_size) {
    return res.status(400).send({ error: "Missing required parameters" });
  }

  try {
    // Log the recommendation
    await req.app.locals.db.run(
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

    res.status(200).send({ success: true });
  } catch (error) {
    console.error('Error logging recommendation:', error);
    res.status(500).send({ error: "Error logging recommendation" });
  }
});

// Get size chart data for a product (main endpoint for widget)
router.get('/size-charts', verifyAppProxySignature, async (req, res) => {
  const { product_id } = req.query;
  // Derive shop from query or headers (Shopify app proxy often omits explicit shop param)
  const headerHost = req.headers['x-forwarded-host'] || req.headers['x-shopify-shop-domain'];
  const shop = req.query.shop || (typeof headerHost === 'string' ? headerHost : (Array.isArray(headerHost) ? headerHost[0] : undefined));
  
  console.log('App Proxy size-charts route hit:', {
    path: req.path,
    query: req.query,
    originalUrl: req.originalUrl
  });
  
  if (!product_id) {
    return res.status(400).json({ error: 'Missing product_id parameter' });
  }
  
  if (!shop) {
    return res.status(400).json({ error: 'Missing shop parameter' });
  }
  
  try {
    console.log(`Fetching size chart for product ${product_id} in shop ${shop}`);
    
    // Find charts associated with this product - get the most recent one
    const productChart = await req.app.locals.db.get(
      `SELECT * FROM product_charts WHERE product_id = ? AND shop_domain = ? ORDER BY created_at DESC LIMIT 1`,
      [product_id, shop]
    );
    
    console.log('Product chart query result:', { productChart });
    
    if (!productChart) {
      console.log(`No size chart found for product ${product_id}`);
      return res.json({ found: false, error: 'No size chart found for this product' });
    }
    
    // Get the chart details
    const chart = await req.app.locals.db.get(
      `SELECT * FROM size_charts WHERE id = ? AND shop_domain = ?`,
      [productChart.chart_id, shop]
    );
    
    if (!chart) {
      console.log(`Chart with ID ${productChart.chart_id} not found for shop ${shop}`);
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
    chartData.sizes = chartData.sizes.map(size => {
      // Always include both name and size properties
      const standardSize = {
        name: size.name || size.size,
        size: size.size || size.name
      };
      
      // Copy all other measurement properties
      Object.keys(size).forEach(key => {
        if (key !== 'name' && key !== 'size') {
          standardSize[key] = size[key];
        }
      });
      
      return standardSize;
    });
    
    // Prepare the response
    const response = {
      found: true,
      chart: {
        id: chart.id,
        name: chart.name,
        category: chart.category,
        subcategory: chart.subcategory,
        fit_type: chart.fit_type,
        sizes: chartData.sizes,
        measurements: chartData.measurements || [],
        chart_data: chartData,
        optional_measurements: chart.optional_measurements ? JSON.parse(chart.optional_measurements) : {}
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