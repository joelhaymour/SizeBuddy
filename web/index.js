import { join } from "path";
import { readFileSync } from "fs";
import express from "express";
import serveStatic from "serve-static";
import dotenv from 'dotenv';
import { createProxyMiddleware } from 'http-proxy-middleware';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import cookieParser from "cookie-parser";
import * as shopifyApi from "@shopify/shopify-api";
const { Shopify } = shopifyApi;
import sqliteStorage from "@shopify/shopify-app-session-storage-sqlite";
const { SQLiteConnection } = sqliteStorage;
import runMigrations from './database-migrations.js';

import shopify from "./shopify.js";
import productCreator from "./product-creator.js";
import CustomWebhookHandlers from "./webhooks.js";
import analyticsRouter from "./routes/analytics.js";
import pixelAttributionRouter from "./routes/pixel-attribution.js";
import sizeRecommendationsRouter from "./routes/size-recommendations.js";
import widgetCustomizationRouter from "./routes/widget-customization.js";
import billingRouter from "./routes/billing.js";
import appProxyRouter from "./routes/app-proxy.js";
import GDPRWebhookHandlers from "./gdpr.js";
import { getDb } from './db.js';
import { ensureBuyNowPixelInstalled } from "./utils/buyNowPixel.js";


// Load environment variables
dotenv.config();

const PORT = parseInt(process.env.BACKEND_PORT || process.env.PORT || "3000", 10);
const FRONTEND_PORT = parseInt(process.env.FRONTEND_PORT || "5173", 10);

const STATIC_PATH =
  process.env.NODE_ENV === "production"
    ? `${process.cwd()}/frontend/dist`
    : `${process.cwd()}/frontend/`;

const app = express();

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

// Parse JSON for all endpoints EXCEPT the Shopify webhook path (raw body required)
app.use((req, res, next) => {
  if (req.path === (shopify.config?.webhooks?.path || '/api/webhooks')) {
    return next();
  }
  return express.json({ limit: '10mb' })(req, res, next);
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Add CORS configuration BEFORE any other middleware
app.use(cors({
  origin: function(origin, callback) {
    // For public endpoints (widget, app proxy), allow all origins
    // For admin endpoints, restrict to Shopify domains
    const allowedOrigins = [
      process.env.HOST,
      'https://admin.shopify.com',
      /\.myshopify\.com$/,
      /\.shopify\.com$/,
      /\.ngrok-free\.app$/,
      /\.ngrok\.app$/,
      /\.ngrok\.io$/,
      'null',  // Allow requests with no origin
      `http://localhost:${FRONTEND_PORT}`,
      `https://localhost:${FRONTEND_PORT}`,
      `http://localhost:${PORT}`,
      `https://localhost:${PORT}`,
      'http://localhost:8000',
      'https://localhost:8000'
    ];
    
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Allow all HTTPS origins for public widget endpoints (custom domains)
    // This is safe because we validate shop/product data server-side
    if (origin.startsWith('https://')) {
      return callback(null, true);
    }
    
    const isAllowed = allowedOrigins.some(allowedOrigin => {
      if (allowedOrigin instanceof RegExp) {
        return allowedOrigin.test(origin);
      }
      return allowedOrigin === origin;
    });
    
    callback(null, isAllowed);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Shopify-Access-Token', '*'],
  exposedHeaders: [
    'X-Shopify-API-Request-Failure-Reauthorize',
    'X-Shopify-API-Request-Failure-Reauthorize-Url'
  ]
}));

// Mount app proxy routes BEFORE any authentication middleware
// This is critical - app proxy routes use signature verification, not session auth
// Shopify can forward app proxy requests with the storefront prefix stripped,
// so mount the router at the root as well as the explicit proxy prefixes.
app.use(appProxyRouter);
app.use('/apps/size-buddy', appProxyRouter);
app.use('/app-proxy', appProxyRouter);
app.use('/api/proxy', appProxyRouter);

// Add analytics routes BEFORE authentication middleware
// This allows widget view logging to work without authentication
app.use(analyticsRouter);
app.use(pixelAttributionRouter);
app.use(billingRouter);

// Add a route to serve the widget script directly - NO AUTH REQUIRED
app.get('/widget-script', (req, res) => {
  const version = req.query.v;
  const scriptPath = join(process.cwd(), 'extensions/size-buddy-widget/assets/size-buddy-v4.js');
    
  console.log(`Serving widget script: ${scriptPath} for version ${version || 'default'}`);
  
  try {
    // Set proper content type and headers
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    
    // Read and serve the file directly
    let scriptContent = readFileSync(scriptPath, 'utf8');
    
    // Add critical slider styles at the beginning of the script
    const sliderStyles = `
      // Add critical slider styles
      const styleEl = document.createElement('style');
      styleEl.textContent = \`
        .slider-container {
          position: relative !important;
          height: 40px !important;
          width: 100% !important;
          touch-action: none !important;
          display: block !important;
          overflow: visible !important;
          margin: 0 !important;
          padding: 0 !important;
          background: transparent !important;
        }
        .slider-track {
          position: absolute !important;
          top: 50% !important;
          left: 0 !important;
          right: 0 !important;
          transform: translateY(-50%) !important;
          width: 100% !important;
          height: 6px !important;
          background-color: #e0e0e0 !important;
          border-radius: 3px !important;
          display: block !important;
        }
        .slider-filled {
          position: absolute !important;
          top: 50% !important;
          left: 0 !important;
          transform: translateY(-50%) !important;
          height: 6px !important;
          background-color: #4A90E2 !important;
          border-radius: 3px !important;
          display: block !important;
        }
        .slider-handle {
          position: absolute !important;
          top: 50% !important;
          transform: translate(-50%, -50%) !important;
          width: 22px !important;
          height: 22px !important;
          background-color: white !important;
          border: 2px solid #4A90E2 !important;
          border-radius: 50% !important;
          cursor: pointer !important;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1) !important;
          z-index: 2 !important;
          display: block !important;
          pointer-events: auto !important;
        }
      \`;
      document.head.appendChild(styleEl);
    `;
    
    // Insert the styles at the beginning of the script
    scriptContent = sliderStyles + '\n' + scriptContent;
    
    // Replace the slider HTML generation with more explicit styles
    const sliderHtmlPattern = /formHtml \+= '<div class="size-slider-container"[^>]*>([\s\S]*?)<\/div>';/g;
    const newSliderHtml = `formHtml += '<div class="size-slider-container" data-measurement="' + measurement.id + '" style="margin-bottom:25px !important;">' +
      '<div class="slider-label" style="display:flex !important;justify-content:space-between !important;align-items:center !important;margin-bottom:8px !important;">' +
        '<span style="font-weight:500 !important;color:#333 !important;font-size:15px !important;">' + measurement.name + (measurement.unit ? ' (' + measurement.unit + ')' : '') + '</span>' +
        '<div class="slider-value" id="size-buddy-value-' + measurement.id + '" style="color:#4A90E2 !important;font-weight:600 !important;background-color:#f1f8fe !important;padding:4px 8px !important;border-radius:4px !important;min-width:40px !important;text-align:center !important;">' + measurement.defaultValue + '</div>' +
      '</div>' +
      '<div class="slider-container" data-min="' + (measurement.id === 'height' ? 
        (function() {
          // Get min height from the chart
          const heightValues = chart.sizes.map(size => {
            if (size.height && size.height.includes('-')) {
              const [min] = size.height.split('-').map(h => {
                const match = h.trim().match(/(\d+)'(\d+)"/);
                return match ? parseInt(match[1]) * 12 + parseInt(match[2]) : null;
              });
              return min;
            }
            if (size.height) {
              const match = size.height.match(/(\d+)'(\d+)"/);
              return match ? parseInt(match[1]) * 12 + parseInt(match[2]) : null;
            }
            return null;
          }).filter(Boolean);
          console.log('Height values from chart:', heightValues);
          return Math.min(...heightValues);
        })() : measurement.min) + '" ' +
      'data-max="' + (measurement.id === 'height' ? 
        (function() {
          // Get max height from the chart
          const heightValues = chart.sizes.map(size => {
            if (size.height && size.height.includes('-')) {
              const [_, max] = size.height.split('-').map(h => {
                const match = h.trim().match(/(\d+)'(\d+)"/);
                return match ? parseInt(match[1]) * 12 + parseInt(match[2]) : null;
              });
              return max;
            }
            if (size.height) {
              const match = size.height.match(/(\d+)'(\d+)"/);
              return match ? parseInt(match[1]) * 12 + parseInt(match[2]) : null;
            }
            return null;
          }).filter(Boolean);
          console.log('Height values from chart:', heightValues);
          return Math.max(...heightValues);
        })() : measurement.max) + '" ' +
      'style="position:relative !important;height:40px !important;width:100% !important;">' +
        '<div class="slider-track" style="position:absolute !important;top:50% !important;left:0 !important;right:0 !important;transform:translateY(-50%) !important;width:100% !important;height:6px !important;background-color:#e0e0e0 !important;border-radius:3px !important;"></div>' +
        '<div class="slider-filled" style="position:absolute !important;top:50% !important;left:0 !important;transform:translateY(-50%) !important;height:6px !important;background-color:#4A90E2 !important;border-radius:3px !important;width:' + initialPercent + '% !important;"></div>' +
        '<div class="slider-handle" style="position:absolute !important;top:50% !important;left:' + initialPercent + '% !important;transform:translate(-50%, -50%) !important;width:22px !important;height:22px !important;background-color:white !important;border:2px solid #4A90E2 !important;border-radius:50% !important;cursor:pointer !important;box-shadow:0 2px 4px rgba(0,0,0,0.1) !important;z-index:2 !important;"></div>' +
      '</div>' +
      '<div class="slider-labels" style="display:flex !important;justify-content:space-between !important;margin-top:5px !important;font-size:12px !important;color:#666 !important;">' + 
        (measurement.id === 'height' ? 
          (function() {
            // Get height values from the chart
            const heightValues = new Set();
            chart.sizes.forEach(size => {
              if (size.height && size.height.includes('-')) {
                const [min, max] = size.height.split('-').map(h => h.trim());
                heightValues.add(min);
                heightValues.add(max);
              } else if (size.height) {
                heightValues.add(size.height);
              }
            });
            
            // Convert to array and sort by actual height in inches
            const sortedHeights = Array.from(heightValues).sort((a, b) => {
              const aMatch = a.match(/(\d+)'(\d+)"/);
              const bMatch = b.match(/(\d+)'(\d+)"/);
              if (aMatch && bMatch) {
                const aInches = parseInt(aMatch[1]) * 12 + parseInt(aMatch[2]);
                const bInches = parseInt(bMatch[1]) * 12 + parseInt(bMatch[2]);
                return aInches - bInches;
              }
              return 0;
            });
            
            // Use the actual height values from the chart
            return sortedHeights.map(value => '<span>' + value + '</span>').join('');
          })()
          : labelsHtml) + 
      '</div>' +
    '</div>';`;
    
    // Replace the slider HTML in the script
    scriptContent = scriptContent.replace(sliderHtmlPattern, newSliderHtml);
    
    // Add the slider interaction code
    const sliderInteractionCode = `
      // Make sliders interactive
      document.querySelectorAll('.slider-container').forEach(slider => {
        const track = slider.querySelector('.slider-track');
        const filled = slider.querySelector('.slider-filled');
        const handle = slider.querySelector('.slider-handle');
        const container = slider.closest('.size-slider-container');
        const valueDisplay = container.querySelector('.slider-value');
        
        const minValue = parseFloat(slider.getAttribute('data-min'));
        const maxValue = parseFloat(slider.getAttribute('data-max'));
        
        // Update value based on handle position
        function updateValue(percent) {
          percent = Math.max(0, Math.min(100, percent));
          const value = minValue + (percent / 100) * (maxValue - minValue);
          
          // For height values, format as feet and inches
          if (container.getAttribute('data-measurement') === 'height') {
            const totalInches = Math.round(value);
            const feet = Math.floor(totalInches / 12);
            const inches = Math.round(totalInches % 12);
            valueDisplay.textContent = feet + "'" + inches + '"';
          } else {
            valueDisplay.textContent = Math.round(value);
          }
          
          filled.style.width = percent + '%';
          handle.style.left = percent + '%';
        }
        
        // Handle mouse events
        let isDragging = false;
        
        handle.addEventListener('mousedown', (e) => {
          isDragging = true;
          handle.style.transform = 'translate(-50%, -50%) scale(1.1)';
          handle.style.boxShadow = '0 3px 8px rgba(0,0,0,0.2)';
          e.preventDefault();
        });
        
        document.addEventListener('mousemove', (e) => {
          if (!isDragging) return;
          const rect = slider.getBoundingClientRect();
          const percent = ((e.clientX - rect.left) / rect.width) * 100;
          updateValue(percent);
        });
        
        document.addEventListener('mouseup', () => {
          if (!isDragging) return;
          isDragging = false;
          handle.style.transform = 'translate(-50%, -50%)';
          handle.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
        });
        
        // Handle touch events
        handle.addEventListener('touchstart', (e) => {
          isDragging = true;
          handle.style.transform = 'translate(-50%, -50%) scale(1.1)';
          handle.style.boxShadow = '0 3px 8px rgba(0,0,0,0.2)';
          e.preventDefault();
        });
        
        document.addEventListener('touchmove', (e) => {
          if (!isDragging) return;
          const touch = e.touches[0];
          const rect = slider.getBoundingClientRect();
          const percent = ((touch.clientX - rect.left) / rect.width) * 100;
          updateValue(percent);
          e.preventDefault();
        });
        
        document.addEventListener('touchend', () => {
          if (!isDragging) return;
          isDragging = false;
          handle.style.transform = 'translate(-50%, -50%)';
          handle.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
        });
        
        // Handle click on track
        track.addEventListener('click', (e) => {
          const rect = slider.getBoundingClientRect();
          const percent = ((e.clientX - rect.left) / rect.width) * 100;
          updateValue(percent);
        });
      });
    `;
    
    // Add the interaction code after the form HTML generation
    scriptContent = scriptContent.replace(
      /contentDiv\.innerHTML = formHtml;/g,
      `contentDiv.innerHTML = formHtml;\n${sliderInteractionCode}`
    );
    
    res.send(scriptContent);
  } catch (error) {
    console.error('Error serving widget script:', error);
    res.status(500).send('Error loading widget script');
  }
});

// Add a route for the full widget (development only)
if (process.env.NODE_ENV === 'development') {
  app.get('/widget-script-full', (req, res) => {
    const scriptPath = join(process.cwd(), 'extensions/size-buddy-widget/assets/size-buddy-v4.js');
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.sendFile(scriptPath);
  });
}

// Add a direct test route that bypasses authentication (development only)
if (process.env.NODE_ENV === 'development') {
  app.get('/direct-test', (req, res) => {
    res.sendFile(join(process.cwd(), 'extensions/size-buddy-widget/assets/direct-test.html'));
  });
}

// Add a simple, unauthenticated ping endpoint
app.get("/ping", (req, res) => {
  res.json({ pong: true, timestamp: new Date().toISOString() });
});

// Public endpoint to fetch size chart data without Shopify session (used by storefront widget fallback)
// This does NOT modify data and only returns chart info scoped by shop + product_id
app.get('/public/size-charts', async (req, res) => {
  try {
    const { product_id, shop } = req.query;
    if (!product_id || !shop) {
      return res.status(400).json({ error: 'Missing product_id or shop parameter' });
    }

    const db = app.locals.db;
    const productChart = await db.get(
      `SELECT * FROM product_charts WHERE product_id = ? AND shop_domain = ? ORDER BY created_at DESC LIMIT 1`,
      [product_id, shop]
    );

    if (!productChart) {
      return res.json({ found: false, error: 'No size chart found for this product' });
    }

    const lockedCheck = process.env.DATABASE_URL ? 'FALSE' : '0';
    const chart = await db.get(
      `SELECT * FROM size_charts WHERE id = ? AND shop_domain = ? AND (locked IS NULL OR locked = ${lockedCheck})`,
      [productChart.chart_id, shop]
    );

    if (!chart) {
      return res.json({ found: false, error: 'Size chart not found' });
    }

    let chartData = null;
    if (chart.chart_data) {
      try {
        chartData = typeof chart.chart_data === 'string' ? JSON.parse(chart.chart_data) : chart.chart_data;
      } catch (e) {
        return res.json({ found: false, error: 'Error parsing chart data', details: e.message });
      }
    }

    if (!chartData || !chartData.sizes || chartData.sizes.length === 0) {
      const chartSizes = await db.all(
        `SELECT * FROM chart_sizes WHERE chart_id = ? ORDER BY display_order`,
        [chart.id]
      );
      if (!chartSizes || chartSizes.length === 0) {
        return res.json({ found: false, error: 'No sizes found for this chart' });
      }
      chartData = {
        name: chart.name,
        sizes: chartSizes.map(size => {
          const o = { size: size.size, name: size.size };
          ['waist','chest','hip','inseam','score','height','weight'].forEach(k => { if (size[k] !== null) o[k] = size[k]; });
          return o;
        }),
        measurements: []
      };
      const first = chartSizes[0];
      ['waist','chest','hip','inseam','height','weight'].forEach(k => {
        if (first[k] !== null) chartData.measurements.push({ name: k, label: k.charAt(0).toUpperCase()+k.slice(1), unit: 'in' });
      });
    }

    chartData.sizes = normalizeAndFilterChartSizes(chartData.sizes);
    if (chartData.sizes.length === 0) {
      return res.json({ found: false, error: 'No enabled sizes are available for this chart' });
    }

    const customSizeChartImage = chart.custom_size_chart_image || null;

    res.json({
      found: true,
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
        optional_measurements: chart.optional_measurements ? JSON.parse(chart.optional_measurements) : {}
      }
    });
  } catch (error) {
    console.error('Error in /public/size-charts:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Test endpoint to debug chart lookup (development only)
if (process.env.NODE_ENV === 'development') {
// Debug: list where size charts are stored and what's in the DB for a shop
app.get("/api/debug/size-charts-db", async (req, res) => {
  const { shop } = req.query;
  if (!shop) return res.status(400).json({ error: 'Add ?shop=sizemeup111.myshopify.com' });
  try {
    const db = req.app.locals.db;
    const dbPath = join(process.cwd(), 'database.sqlite');
    const sizeCharts = await db.all(`SELECT id, name, category, shop_domain, created_at FROM size_charts WHERE shop_domain = ?`, [shop]);
    const productCharts = await db.all(`SELECT * FROM product_charts WHERE shop_domain = ?`, [shop]);
    return res.json({
      message: 'Size charts for testing are stored in SQLite (dev) or Postgres (prod).',
      dbPath,
      shop,
      sizeChartsCount: sizeCharts.length,
      sizeCharts,
      productChartsCount: productCharts.length,
      productCharts
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

app.get("/test-chart-lookup", async (req, res) => {
  const { product_id, shop } = req.query;
  
  console.log('Test chart lookup:', { product_id, shop });
  
  try {
    const db = await initializeDatabase();
    
    // Step 1: Check product_charts table
    const productChart = await db.get(
      `SELECT * FROM product_charts WHERE product_id = ? AND shop_domain = ?`,
      [product_id, shop]
    );
    
    console.log('Product chart lookup result:', productChart);
    
    if (!productChart) {
      return res.json({ 
        found: false, 
        error: 'No chart found for this product',
        step: 'product_charts lookup'
      });
    }
    
    // Step 2: Check size_charts table
    const chart = await db.get(
      `SELECT * FROM size_charts WHERE id = ? AND shop_domain = ?`,
      [productChart.chart_id, shop]
    );
    
    console.log('Size chart lookup result:', chart);
    
    if (!chart) {
      return res.json({ 
        found: false, 
        error: 'Size chart not found',
        step: 'size_charts lookup',
        chart_id: productChart.chart_id
      });
    }
    
    // Success
    return res.json({
      found: true,
      product_chart: productChart,
      size_chart: {
        id: chart.id,
        name: chart.name,
        category: chart.category
      }
    });
  } catch (error) {
    console.error('Error in test-chart-lookup:', error);
    res.status(500).json({ error: 'Server error', message: error.message });
  }
});
}

// Direct size charts API with no authentication (development only)
if (process.env.NODE_ENV === 'development') {
app.get("/direct-charts", async (req, res) => {
  const { product_id, shop, chart_id } = req.query;
  
  console.log('Direct API request received:', {
    product_id, 
    shop,
    chart_id,
    query: req.query
  });
  
  if (!product_id && !chart_id) {
    return res.status(400).json({ error: 'Missing product_id or chart_id parameter' });
  }
  
  if (!shop) {
    return res.status(400).json({ error: 'Missing shop parameter' });
  }
  
  try {
    // Find charts associated with this product
    const db = await initializeDatabase();
    
    let targetChartId;
    
    // If chart_id is directly specified, use it
    if (chart_id) {
      targetChartId = chart_id;
      console.log('Using specified chart ID: ' + targetChartId);
    } else {
      // Otherwise look up the chart ID from product_charts
      const productChart = await db.get(
        `SELECT * FROM product_charts WHERE product_id = ? AND shop_domain = ? ORDER BY created_at DESC LIMIT 1`,
        [product_id, shop]
      );
      
      if (!productChart) {
        console.log('No chart found for product ' + product_id + ' in shop ' + shop);
        return res.json({ found: false, error: 'No chart found for this product' });
      }
      
      targetChartId = productChart.chart_id;
      console.log('Found chart ID ' + targetChartId + ' for product ' + product_id);
    }
    
    // Get the size chart details
    const chart = await db.get(
      `SELECT * FROM size_charts WHERE id = ? AND shop_domain = ?`,
      [targetChartId, shop]
    );
    
    if (!chart) {
      console.log('Chart with ID ' + targetChartId + ' not found for shop ' + shop);
      return res.json({ found: false, error: 'Size chart not found' });
    }
    
    console.log('Chart found:', {
      id: chart.id,
      name: chart.name,
      category: chart.category,
      subcategory: chart.subcategory
    });
    
    // Get the chart data from chart_data
    let chartData = null;
    
    if (chart.chart_data) {
      try {
        // Parse the chart_data JSON
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
    
    // If chart_data wasn't available or had no sizes, check chart_sizes table as fallback
    if (!chartData || !chartData.sizes || chartData.sizes.length === 0) {
      console.log('No valid chart data found, checking chart_sizes table as fallback');
      
      // Fallback: Get from chart_sizes table
      const chartSizes = await db.all(
        `SELECT * FROM chart_sizes WHERE chart_id = ? ORDER BY display_order`,
        [targetChartId]
      );
      
      console.log('Chart sizes from database:', chartSizes);
      
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
    
    // Ensure sizes have consistent format with string ranges (not numeric values)
    // This addresses any potential parsing issues with ranges
    chartData.sizes = chartData.sizes.map(size => {
      // Create a standardized size object with both name and size properties
      const standardSize = {
        name: size.name || size.size,
        size: size.size || size.name
      };
      
      // Copy and format all other measurement properties
      Object.keys(size).forEach(key => {
        if (key !== 'name' && key !== 'size') {
          // Ensure range values are properly formatted as strings
          if (typeof size[key] === 'string' && size[key].includes('-')) {
            standardSize[key] = size[key]; // Keep as is
          } else if (typeof size[key] === 'number' || !isNaN(parseFloat(size[key]))) {
            // If it's a single numeric value, keep as is
            standardSize[key] = size[key];
          } else {
            standardSize[key] = size[key];
          }
        }
      });
      
      return standardSize;
    });
    
    // Prepare response
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
        optional_measurements: chart.optional_measurements ? 
          JSON.parse(chart.optional_measurements) : 
          {}
      }
    };
    
    console.log('Sending response with chart containing' + chartData.sizes.length + ' sizes');
    res.json(response);
  } catch (error) {
    console.error('Error fetching size chart:', error);
    res.status(500).json({ error: 'Server error', message: error.message });
  }
});
}

// Add CSP headers (tightened for production)
app.use((req, res, next) => {
  const isDev = process.env.NODE_ENV === 'development';
  const host = process.env.HOST || '';
  const self = "'self'";
  // Polaris and App Bridge require some inline styles; allow in production
  const unsafeInline = " 'unsafe-inline'";
  const unsafeEval = isDev ? " 'unsafe-eval'" : '';
  const sources = [self, host, `https://admin.shopify.com`, `https://*.myshopify.com`, `https://cdn.shopify.com`].join(' ');

  const csp = [
    `default-src ${sources} data:`,
    `img-src ${sources} data: blob:`,
    `font-src ${sources} data:`,
    `style-src ${sources}${unsafeInline}`,
    `script-src ${sources}${unsafeEval} blob:`,
    `connect-src ${sources} wss://*`,
    // allow the app to open Shopify accounts/billing in top window
    `frame-ancestors https://admin.shopify.com https://*.myshopify.com`,
    `frame-src https://admin.shopify.com https://*.myshopify.com https://accounts.shopify.com https://*.shopify.com`,
  ].join('; ');

  res.setHeader('Content-Security-Policy', csp);
  // Security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer-when-downgrade');
  if (!isDev) {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }
  next();
});

// Serve frontend assets
if (process.env.NODE_ENV === 'development') {
  app.use('/images', express.static(join(process.cwd(), 'frontend/public/images')));
} else {
  app.use('/images', express.static(join(process.cwd(), 'frontend/dist/images')));
  app.use(express.static(join(process.cwd(), 'frontend/dist')));
}

// Set up Shopify authentication and webhook handling
app.get("/api/auth", shopify.auth.begin());
app.get(
  "/api/auth/callback",
  shopify.auth.callback(),
  async (_req, res, next) => {
    try {
      const session = res.locals.shopify?.session;
      if (session) {
        await ensureBuyNowPixelInstalled(shopify, session);
      }
    } catch (error) {
      console.error("Failed to ensure Buy it now pixel after auth callback:", error);
    }
    next();
  },
  shopify.redirectToShopifyOrAppRoot()
);
app.post(shopify.config.webhooks.path, shopify.processWebhooks({ webhookHandlers: CustomWebhookHandlers }));

// Add a permissive preflight handler for our API routes (Shopify OAuth redirects trigger OPTIONS)
app.options('*', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', process.env.HOST || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Shopify-Access-Token');
  res.status(204).end();
});

// Debug middleware (development only)
if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    console.log('Request Details:', {
      method: req.method,
      path: req.path,
      query: req.query,
      headers: req.headers
    });
    next();
  });
}

// Development mode: proxy requests to Vite dev server
if (process.env.NODE_ENV === "development") {
  console.log('Running in development mode - proxying frontend requests to Vite server');
  const viteDevServerUrl = `http://localhost:${FRONTEND_PORT}`;
  const viteProxy = createProxyMiddleware({
    target: viteDevServerUrl,
    changeOrigin: true,
    ws: true,
    xfwd: true,
  });
  
  const skipAuthPaths = [
    '/@vite',
    '/@react-refresh',
    '/@fs',
    '/node_modules',
    '/src',
    '/assets',
    '/vite.svg',
    '/__vite',
    '.js',
    '.css',
    '.jsx',
    '.mjs',
    '.html'
  ];

  // API routes require authentication EXCEPT size-recommendations
  app.use("/api/*", (req, res, next) => {
    // req.path is relative to the /api mount, so use originalUrl for the full request path.
    if (req.originalUrl.startsWith('/api/size-recommendations')) {
      const resolvedShop = req.query.shop || req.body?.shop;
      if (!resolvedShop) {
        return res.status(400).json({ error: "Missing shop parameter" });
      }
      console.log('Skipping auth for size-recommendations endpoint');
      return next();
    }
    
    // For all other API routes, use standard auth
    shopify.validateAuthenticatedSession()(req, res, next);
  });
  
  // For non-API routes in development
  app.use((req, res, next) => {
    console.log('Processing request:', req.path);
    
    if (req.path.startsWith('/api/')) {
      console.log('API request, proceeding to next middleware');
      return next();
    }

    // Proxy Vite dev assets directly
    if (skipAuthPaths.some(path => req.path.includes(path))) {
      console.log('Proxying dev asset to Vite:', req.path);
      return viteProxy(req, res, next);
    }
    
    // Embedded app requests should load through Vite in dev
    if (req.query.embedded === '1') {
      console.log('Proxying embedded app request to Vite:', req.path);
      return viteProxy(req, res, next);
    }
    
    // For all other frontend routes, ensure shop is installed first, then proxy to Vite
    console.log('Checking shop installation for path:', req.path);
    return shopify.ensureInstalledOnShop()(req, res, () => viteProxy(req, res, next));
  });
} else {
  // Production mode: serve static files
  app.use(shopify.cspHeaders());
  app.use(serveStatic(STATIC_PATH, { index: false }));
  
  // API routes require authentication EXCEPT size-recommendations
  app.use("/api/*", (req, res, next) => {
    // req.path is relative to the /api mount, so use originalUrl for the full request path.
    if (req.originalUrl.startsWith('/api/size-recommendations')) {
      const resolvedShop = req.query.shop || req.body?.shop;
      if (!resolvedShop) {
        return res.status(400).json({ error: "Missing shop parameter" });
      }
      console.log('Skipping auth for size-recommendations endpoint');
      return next();
    }
    
    // For all other API routes, use standard auth
    shopify.validateAuthenticatedSession()(req, res, next);
  });

  // Catch-all for non-API GETs only (serve frontend)
  app.get(/^\/(?!api\/).*$/, shopify.ensureInstalledOnShop(), async (_req, res) => {
    const indexFilePath = join(STATIC_PATH, "index.html");
    try {
      const indexContent = readFileSync(indexFilePath, 'utf8')
        .replace(/%SHOPIFY_API_KEY%/g, process.env.SHOPIFY_API_KEY || "");
      res.status(200).set("Content-Type", "text/html").send(indexContent);
    } catch (error) {
      console.error('Error serving index.html:', error);
      res.status(500).send('Error loading application');
    }
  });
}

app.get("/api/products/count", async (_req, res) => {
  const client = new shopify.api.clients.Graphql({ session: res.locals.shopify.session });
  try {
    const { withShopifyRateLimit } = await import('./utils/rateLimit.js');
    const countData = await withShopifyRateLimit(() => client.request(`
      query shopifyProductCount { productsCount { count } }
    `));
    res.status(200).send({ count: countData.data.productsCount.count });
  } catch (e) {
    console.log(`Failed to process products/create: ${e.message}`);
    res.status(500).send(e.message);
  }
});

app.post("/api/products", async (_req, res) => {
  let status = 200;
  let error = null;

  try {
    await productCreator(res.locals.shopify.session);
  } catch (e) {
    console.log(`Failed to process products/create: ${e.message}`);
    status = 500;
    error = e.message;
  }
  res.status(status).send({ success: status === 200, error });
});

// Database initialization function
async function initializeDatabase() {
  // In production with Postgres, rely on pre-provisioned schema
  if (process.env.DATABASE_URL) {
    const db = await getDb();
    // Ensure required tables exist (idempotent)
    try {
      await db.run(`CREATE TABLE IF NOT EXISTS size_charts (
        id SERIAL PRIMARY KEY,
        shop_domain TEXT NOT NULL,
        name TEXT NOT NULL,
        category TEXT CHECK (category IN ('tops','bottoms','bikinis','dresses','onepieces')) NOT NULL,
        subcategory TEXT,
        fit_type TEXT NOT NULL,
        chart_data TEXT NOT NULL,
        optional_measurements TEXT,
        custom_size_chart_image TEXT,
        locked BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )`);

      await db.run(`CREATE TABLE IF NOT EXISTS product_charts (
        id SERIAL PRIMARY KEY,
        chart_id INTEGER NOT NULL REFERENCES size_charts(id) ON DELETE CASCADE,
        product_id TEXT NOT NULL,
        product_title TEXT NOT NULL,
        product_handle TEXT NOT NULL,
        product_image TEXT,
        shop_domain TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT uq_chart_product UNIQUE(chart_id, product_id)
      )`);

      await db.run(`CREATE TABLE IF NOT EXISTS widget_customization (
        shop_id TEXT PRIMARY KEY,
        settings TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )`);

      await db.run(`CREATE TABLE IF NOT EXISTS size_recommendation_analytics (
        id SERIAL PRIMARY KEY,
        product_id TEXT NOT NULL,
        chart_id INTEGER NOT NULL REFERENCES size_charts(id) ON DELETE CASCADE,
        recommended_size TEXT NOT NULL,
        measurements TEXT NOT NULL,
        shop TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )`);

      await db.run(`CREATE TABLE IF NOT EXISTS chart_sizes (
        id SERIAL PRIMARY KEY,
        chart_id INTEGER NOT NULL REFERENCES size_charts(id) ON DELETE CASCADE,
        size TEXT NOT NULL,
        waist TEXT,
        chest TEXT,
        hip TEXT,
        inseam TEXT,
        height TEXT,
        weight TEXT,
        score TEXT,
        display_order INTEGER
      )`);

      await db.run(`CREATE TABLE IF NOT EXISTS subscriptions (
        shop TEXT PRIMARY KEY,
        plan TEXT NOT NULL,
        status TEXT NOT NULL,
        subscription_id TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ
      )`);

      // Helpful indexes for multi-tenant queries
      await db.run(`CREATE INDEX IF NOT EXISTS idx_size_charts_shop ON size_charts(shop_domain)`);
      await db.run(`CREATE INDEX IF NOT EXISTS idx_product_charts_shop ON product_charts(shop_domain)`);
      await db.run(`CREATE INDEX IF NOT EXISTS idx_reco_shop ON size_recommendation_analytics(shop)`);

      // Ensure category check constraint includes all supported chart categories
      try {
        await db.run(`ALTER TABLE size_charts DROP CONSTRAINT IF EXISTS size_charts_category_check`);
        await db.run(`ALTER TABLE size_charts ADD CONSTRAINT size_charts_category_check CHECK (category IN ('tops','bottoms','bikinis','dresses','onepieces'))`);
      } catch (e) {
        console.warn('Skipping category check constraint update:', e.message || e);
      }

      try {
        await db.run(`ALTER TABLE size_charts ADD COLUMN IF NOT EXISTS custom_size_chart_image TEXT`);
      } catch (e) {
        console.warn('Skipping custom_size_chart_image column update:', e.message || e);
      }

      try {
        await db.run(`ALTER TABLE size_recommendation_analytics ADD COLUMN IF NOT EXISTS recommendation_token TEXT`);
        await db.run(`ALTER TABLE size_recommendation_analytics ADD COLUMN IF NOT EXISTS availability_status TEXT`);
        await db.run(`ALTER TABLE size_recommendation_analytics ADD COLUMN IF NOT EXISTS variant_id TEXT`);
        await db.run(`ALTER TABLE size_recommendation_analytics ADD COLUMN IF NOT EXISTS added_to_cart_at TIMESTAMPTZ`);
      } catch (e) {
        console.warn('Skipping size_recommendation_analytics column updates:', e.message || e);
      }
    } catch (e) {
      console.error('Postgres schema init error:', e);
    }

    console.log('Database (Postgres) initialized successfully');
    return db;
  }

  // Development: SQLite with local schema
  const dbFile = join(process.cwd(), "database.sqlite");
  const db = await open({ filename: dbFile, driver: sqlite3.Database });
  await db.exec(`
    CREATE TABLE IF NOT EXISTS size_charts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_domain TEXT NOT NULL,
      name TEXT NOT NULL,
      category TEXT CHECK(category IN ('tops', 'bottoms', 'bikinis', 'dresses', 'onepieces')) NOT NULL,
      subcategory TEXT,
      fit_type TEXT NOT NULL,
      chart_data TEXT NOT NULL,
      optional_measurements TEXT,
      custom_size_chart_image TEXT,
      locked INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS product_charts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chart_id INTEGER NOT NULL,
      product_id TEXT NOT NULL,
      product_title TEXT NOT NULL,
      product_handle TEXT NOT NULL,
      product_image TEXT,
      shop_domain TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (chart_id) REFERENCES size_charts(id) ON DELETE CASCADE,
      UNIQUE(chart_id, product_id)
    );

    CREATE TABLE IF NOT EXISTS widget_customization (
      shop_id TEXT PRIMARY KEY,
      settings TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE TABLE IF NOT EXISTS size_recommendation_analytics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id TEXT NOT NULL,
      chart_id INTEGER NOT NULL,
      recommended_size TEXT NOT NULL,
      measurements TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (chart_id) REFERENCES size_charts(id) ON DELETE CASCADE
    );
    
    CREATE TABLE IF NOT EXISTS chart_sizes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chart_id INTEGER NOT NULL,
      size TEXT NOT NULL,
      waist TEXT,
      chest TEXT,
      hip TEXT,
      inseam TEXT,
      height TEXT,
      weight TEXT,
      score TEXT,
      display_order INTEGER,
      FOREIGN KEY (chart_id) REFERENCES size_charts(id) ON DELETE CASCADE
    );
  `);

  try {
    await runMigrations();
  } catch (err) {
    console.error('Failed to run migrations:', err);
  }

  console.log('Database (SQLite) initialized successfully');
  return db;
}

// Get widget customization settings
app.get("/api/widget-customization", shopify.validateAuthenticatedSession(), async (req, res) => {
  try {
    const session = res.locals.shopify.session;
    const shop = req.query.shop || (session && session.shop);
    const host = req.query.host;

    if (!shop || !host) {
      return res.status(400).json({ error: "Missing shop or host parameter" });
    }

    const settings = await app.locals.db.get(
      `SELECT settings FROM widget_customization WHERE shop_id = ?`,
      [shop]
    );

    // If no settings exist, return default settings
    if (!settings) {
      const defaultSettings = {
        appearance: {
          primaryColor: "#000000",
          secondaryColor: "#ffffff",
          buttonStyle: "rounded",
          fontFamily: "system-ui",
          fontSize: "16px"
        },
        behavior: {
          position: "bottom-right",
          showOnLoad: true,
          displayDelay: 0,
          animationStyle: "slide",
          persistUserData: true
        },
        content: {
          buttonText: "Find My Size",
          headerText: "Size Recommendation",
          descriptionText: "Get your perfect fit with our size calculator",
          successMessage: "We recommend size {size} for you"
        }
      };

      // Insert default settings
      await app.locals.db.run(
        `INSERT INTO widget_customization (shop_id, settings) VALUES (?, ?)`,
        [shop, JSON.stringify(defaultSettings)]
      );

      return res.status(200).json(defaultSettings);
    }

    res.status(200).json(JSON.parse(settings.settings));
  } catch (error) {
    console.error('Error fetching widget customization:', error);
    res.status(500).json({ 
      error: "Failed to fetch widget customization",
      details: error.message 
    });
  }
});

// Update widget customization settings
app.put("/api/widget-customization", shopify.validateAuthenticatedSession(), async (req, res) => {
  try {
    // Ensure database is initialized
    if (!app.locals.db) {
      app.locals.db = await initializeDatabase();
    }

    const session = res.locals.shopify.session;
    const shop = req.query.shop || (session && session.shop);
    const host = req.query.host;

    if (!shop || !host) {
      return res.status(400).json({ error: "Missing shop or host parameter" });
    }

    const { settings } = req.body;
    
    if (!settings) {
      return res.status(400).json({ error: "Missing settings in request body" });
    }
    
    await app.locals.db.run(
      `INSERT INTO widget_customization (shop_id, settings) 
       VALUES (?, ?)
       ON CONFLICT(shop_id) DO UPDATE SET 
       settings = ?,
       updated_at = CURRENT_TIMESTAMP`,
      [shop, JSON.stringify(settings), JSON.stringify(settings)]
    );

    res.status(200).json({ 
      success: true,
      message: "Widget customization updated successfully" 
    });
  } catch (error) {
    console.error('Error updating widget customization:', error);
    res.status(500).json({ 
      error: "Failed to update widget customization",
      details: error.message 
    });
  }
});

// Add analytics routes
app.use(sizeRecommendationsRouter);

// Serve theme app block assets
app.use('/assets', express.static(join(process.cwd(), 'extensions/size-buddy-widget/assets')));



// Serve the widget.js file for the storefront
app.get('/apps/size-buddy/widget.js', (req, res) => {
  // Set cache control headers
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  
  // Send the version 4 file
  res.sendFile(join(process.cwd(), 'extensions/size-buddy-widget/assets/size-buddy-v4.js'));
});

// API routes
app.use(widgetCustomizationRouter);



// Start the server
(async () => {
  try {
    // Initialize database before starting the server
    const db = await initializeDatabase();
    console.log('Database initialized successfully');

    // Share database connection with routes
    app.locals.db = db;

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
})();

// Health check
app.get('/health', (_req, res) => res.status(200).json({ ok: true }));

