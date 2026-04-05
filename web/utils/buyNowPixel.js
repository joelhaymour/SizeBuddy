import { getDb } from "../db.js";
import { withShopifyRateLimit } from "./rateLimit.js";

const BUY_NOW_PIXEL_EVENT_NAME = "size_buddy:recommendation_logged";
const PIXEL_RECOMMENDATION_WINDOW_MS = 24 * 60 * 60 * 1000;
const STALE_RECOMMENDATION_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const STALE_PENDING_PURCHASE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

let initializationPromise = null;

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function normalizeId(value) {
  const text = normalizeText(value);
  if (!text) return "";
  const match = text.match(/\/([0-9]+)(?:\?.*)?$/);
  return match ? match[1] : text;
}

function normalizeMoneyAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 0;
  return Math.max(0, Number(amount.toFixed(2)));
}

function normalizeQuantity(value) {
  const quantity = Number(value);
  if (!Number.isFinite(quantity) || quantity <= 0) return 1;
  return Math.round(quantity);
}

async function pruneBuyNowPixelState(db) {
  const staleRecommendationCutoff = new Date(Date.now() - STALE_RECOMMENDATION_WINDOW_MS).toISOString();
  const stalePendingPurchaseCutoff = new Date(Date.now() - STALE_PENDING_PURCHASE_WINDOW_MS).toISOString();

  await db.run(
    `DELETE FROM size_buddy_pixel_recommendations
     WHERE created_at < ?`,
    [staleRecommendationCutoff]
  );

  await db.run(
    `DELETE FROM size_buddy_pending_pixel_purchases
     WHERE created_at < ?`,
    [stalePendingPurchaseCutoff]
  );
}

async function upsertShopPixelRecord(db, shop, webPixelId) {
  const timestamp = nowIso();
  await db.run(
    `INSERT INTO size_buddy_web_pixels
     (shop, web_pixel_id, created_at, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(shop) DO UPDATE SET
       web_pixel_id = excluded.web_pixel_id,
       updated_at = excluded.updated_at`,
    [shop, webPixelId, timestamp, timestamp]
  );
}

async function getAttributablePixelRecommendation(db, {
  shop,
  clientId,
  productId,
  recommendationCutoff,
}) {
  return db.get(
    `SELECT recommendations.recommendation_token, recommendations.recommended_size
     FROM size_buddy_pixel_recommendations AS recommendations
     WHERE recommendations.shop = ?
       AND recommendations.client_id = ?
       AND recommendations.product_id = ?
       AND recommendations.created_at >= ?
       AND NOT EXISTS (
         SELECT 1
         FROM size_buddy_purchase_analytics AS purchases
         WHERE purchases.shop = ?
           AND purchases.recommendation_token = recommendations.recommendation_token
       )
     ORDER BY recommendations.created_at DESC
     LIMIT 1`,
    [
      shop,
      clientId,
      productId,
      recommendationCutoff,
      shop,
    ]
  );
}

export function getBuyNowPixelEventName() {
  return BUY_NOW_PIXEL_EVENT_NAME;
}

export function normalizeBuyNowOrderId(value) {
  return normalizeId(value);
}

export function normalizeBuyNowProductId(value) {
  return normalizeId(value);
}

export function normalizeBuyNowVariantId(value) {
  return normalizeId(value);
}

export async function initializeBuyNowPixelTables() {
  if (!initializationPromise) {
    initializationPromise = (async () => {
      const db = await getDb();

      await db.run(`CREATE TABLE IF NOT EXISTS size_buddy_web_pixels (
        shop TEXT PRIMARY KEY,
        web_pixel_id TEXT NOT NULL,
        created_at ${process.env.DATABASE_URL ? "TIMESTAMPTZ" : "TEXT"} NOT NULL,
        updated_at ${process.env.DATABASE_URL ? "TIMESTAMPTZ" : "TEXT"} NOT NULL
      )`);

      await db.run(`CREATE TABLE IF NOT EXISTS size_buddy_pixel_recommendations (
        id ${process.env.DATABASE_URL ? "SERIAL" : "INTEGER"} PRIMARY KEY ${process.env.DATABASE_URL ? "" : "AUTOINCREMENT"},
        shop TEXT NOT NULL,
        client_id TEXT NOT NULL,
        recommendation_token TEXT NOT NULL,
        product_id TEXT NOT NULL,
        chart_id TEXT,
        recommended_size TEXT,
        created_at ${process.env.DATABASE_URL ? "TIMESTAMPTZ" : "TEXT"} NOT NULL
      )`);
      await db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_size_buddy_pixel_recommendations_shop_token ON size_buddy_pixel_recommendations(shop, recommendation_token)`);
      await db.run(`CREATE INDEX IF NOT EXISTS idx_size_buddy_pixel_recommendations_lookup ON size_buddy_pixel_recommendations(shop, client_id, product_id, created_at)`);

      await db.run(`CREATE TABLE IF NOT EXISTS size_buddy_pending_pixel_purchases (
        id ${process.env.DATABASE_URL ? "SERIAL" : "INTEGER"} PRIMARY KEY ${process.env.DATABASE_URL ? "" : "AUTOINCREMENT"},
        shop TEXT NOT NULL,
        order_id TEXT NOT NULL,
        product_id TEXT NOT NULL,
        variant_id TEXT NOT NULL DEFAULT '',
        recommendation_token TEXT NOT NULL,
        recommended_size TEXT,
        created_at ${process.env.DATABASE_URL ? "TIMESTAMPTZ" : "TEXT"} NOT NULL
      )`);
      await db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_size_buddy_pending_pixel_purchases_order_product_variant ON size_buddy_pending_pixel_purchases(shop, order_id, product_id, variant_id)`);
      await db.run(`CREATE INDEX IF NOT EXISTS idx_size_buddy_pending_pixel_purchases_lookup ON size_buddy_pending_pixel_purchases(shop, order_id, product_id)`);
    })().catch((error) => {
      initializationPromise = null;
      throw error;
    });
  }

  return initializationPromise;
}

export async function ensureBuyNowPixelInstalled(shopify, session) {
  const shop = normalizeText(session?.shop);
  const backendUrl = normalizeText(process.env.HOST).replace(/\/$/, "");

  if (!shop || !backendUrl || !session?.accessToken) {
    return null;
  }

  await initializeBuyNowPixelTables();
  const db = await getDb();
  const existingPixel = await db.get(
    `SELECT web_pixel_id
     FROM size_buddy_web_pixels
     WHERE shop = ?`,
    [shop]
  );

  if (existingPixel?.web_pixel_id) {
    return existingPixel.web_pixel_id;
  }

  const gqlClient = new shopify.api.clients.Graphql({ session });
  const settings = JSON.stringify({
    backendUrl,
    shopDomain: shop,
  });

  try {
    const response = await withShopifyRateLimit(() =>
      gqlClient.request(
        `#graphql
          mutation CreateSizeBuddyBuyNowPixel($settings: JSON!) {
            webPixelCreate(webPixel: { settings: $settings }) {
              userErrors {
                field
                message
                code
              }
              webPixel {
                id
              }
            }
          }
        `,
        {
          variables: { settings },
        }
      )
    );

    const result = response?.data?.webPixelCreate;
    if (Array.isArray(result?.userErrors) && result.userErrors.length > 0) {
      console.error("Failed to create Buy it now web pixel:", result.userErrors);
      return null;
    }

    const webPixelId = normalizeText(result?.webPixel?.id);
    if (!webPixelId) {
      return null;
    }

    await upsertShopPixelRecord(db, shop, webPixelId);
    return webPixelId;
  } catch (error) {
    console.error("Error ensuring Buy it now web pixel:", error?.message || error);
    return null;
  }
}

export async function recordPixelRecommendation({
  shop,
  clientId,
  recommendationToken,
  productId,
  chartId,
  recommendedSize,
}) {
  const normalizedShop = normalizeText(shop);
  const normalizedClientId = normalizeText(clientId);
  const normalizedRecommendationToken = normalizeText(recommendationToken);
  const normalizedProductId = normalizeId(productId);
  const normalizedChartId = normalizeId(chartId);
  const normalizedRecommendedSize = normalizeText(recommendedSize);

  if (!normalizedShop || !normalizedClientId || !normalizedRecommendationToken || !normalizedProductId) {
    return false;
  }

  await initializeBuyNowPixelTables();
  const db = await getDb();
  await pruneBuyNowPixelState(db);

  const createdAt = nowIso();
  await db.run(
    `INSERT INTO size_buddy_pixel_recommendations
     (shop, client_id, recommendation_token, product_id, chart_id, recommended_size, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(shop, recommendation_token) DO UPDATE SET
       client_id = excluded.client_id,
       product_id = excluded.product_id,
       chart_id = excluded.chart_id,
       recommended_size = excluded.recommended_size,
       created_at = excluded.created_at`,
    [
      normalizedShop,
      normalizedClientId,
      normalizedRecommendationToken,
      normalizedProductId,
      normalizedChartId || null,
      normalizedRecommendedSize || null,
      createdAt,
    ]
  );

  return true;
}

export async function recordPixelCheckoutPurchases({
  shop,
  clientId,
  orderId,
  orderName,
  currency,
  lineItems,
}) {
  const normalizedShop = normalizeText(shop);
  const normalizedClientId = normalizeText(clientId);
  const normalizedOrderId = normalizeId(orderId);
  const normalizedOrderName = normalizeText(orderName);
  const normalizedCurrency = normalizeText(currency);
  const normalizedLineItems = Array.isArray(lineItems) ? lineItems : [];

  if (!normalizedShop || !normalizedClientId || !normalizedOrderId || normalizedLineItems.length === 0) {
    return [];
  }

  await initializeBuyNowPixelTables();
  const db = await getDb();
  await pruneBuyNowPixelState(db);

  const recommendationCutoff = new Date(Date.now() - PIXEL_RECOMMENDATION_WINDOW_MS).toISOString();
  const matchedItems = [];

  for (let index = 0; index < normalizedLineItems.length; index += 1) {
    const lineItem = normalizedLineItems[index];
    const normalizedProductId = normalizeId(lineItem?.productId);
    const normalizedVariantId = normalizeId(lineItem?.variantId);
    const recommendationTokenFromProperties = normalizeText(lineItem?.recommendationToken);

    if (!normalizedProductId || recommendationTokenFromProperties) {
      continue;
    }

    const recommendation = await getAttributablePixelRecommendation(db, {
      shop: normalizedShop,
      clientId: normalizedClientId,
      productId: normalizedProductId,
      recommendationCutoff,
    });

    if (!recommendation?.recommendation_token) {
      continue;
    }

    const normalizedLineItemId = normalizeId(lineItem?.lineItemId) || `pixel-${normalizedOrderId}-${normalizedProductId}-${normalizedVariantId || "na"}-${index}`;
    const quantity = normalizeQuantity(lineItem?.quantity);
    const revenueAmount = normalizeMoneyAmount(lineItem?.revenueAmount);
    const lineItemCurrency = normalizeText(lineItem?.currency) || normalizedCurrency || null;

    await db.run(
      `INSERT INTO size_buddy_purchase_analytics
       (shop, order_id, order_name, line_item_id, recommendation_token, product_id, variant_id, recommended_size, quantity, revenue_amount, currency, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(order_id, line_item_id) DO NOTHING`,
      [
        normalizedShop,
        normalizedOrderId,
        normalizedOrderName || null,
        normalizedLineItemId,
        recommendation.recommendation_token,
        normalizedProductId,
        normalizedVariantId || null,
        recommendation.recommended_size || null,
        quantity,
        revenueAmount,
        lineItemCurrency,
      ]
    );

    await clearPendingPixelPurchase({
      shop: normalizedShop,
      orderId: normalizedOrderId,
      productId: normalizedProductId,
      variantId: normalizedVariantId,
    });

    matchedItems.push({
      orderId: normalizedOrderId,
      lineItemId: normalizedLineItemId,
      productId: normalizedProductId,
      variantId: normalizedVariantId || "",
      recommendationToken: recommendation.recommendation_token,
    });
  }

  return matchedItems;
}

export async function recordPendingPixelCheckout({
  shop,
  clientId,
  orderId,
  lineItems,
}) {
  const normalizedShop = normalizeText(shop);
  const normalizedClientId = normalizeText(clientId);
  const normalizedOrderId = normalizeId(orderId);
  const normalizedLineItems = Array.isArray(lineItems) ? lineItems : [];

  if (!normalizedShop || !normalizedClientId || !normalizedOrderId || normalizedLineItems.length === 0) {
    return [];
  }

  await initializeBuyNowPixelTables();
  const db = await getDb();
  await pruneBuyNowPixelState(db);

  const recommendationCutoff = new Date(Date.now() - PIXEL_RECOMMENDATION_WINDOW_MS).toISOString();
  const matchedItems = [];

  for (const lineItem of normalizedLineItems) {
    const normalizedProductId = normalizeId(lineItem?.productId);
    const normalizedVariantId = normalizeId(lineItem?.variantId);
    const recommendationTokenFromProperties = normalizeText(lineItem?.recommendationToken);

    if (!normalizedProductId || recommendationTokenFromProperties) {
      continue;
    }

    const recommendation = await getAttributablePixelRecommendation(db, {
      shop: normalizedShop,
      clientId: normalizedClientId,
      productId: normalizedProductId,
      recommendationCutoff,
    });

    if (!recommendation?.recommendation_token) {
      continue;
    }

    const createdAt = nowIso();
    await db.run(
      `INSERT INTO size_buddy_pending_pixel_purchases
       (shop, order_id, product_id, variant_id, recommendation_token, recommended_size, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(shop, order_id, product_id, variant_id) DO UPDATE SET
         recommendation_token = excluded.recommendation_token,
         recommended_size = excluded.recommended_size,
         created_at = excluded.created_at`,
      [
        normalizedShop,
        normalizedOrderId,
        normalizedProductId,
        normalizedVariantId || "",
        recommendation.recommendation_token,
        recommendation.recommended_size || null,
        createdAt,
      ]
    );

    matchedItems.push({
      orderId: normalizedOrderId,
      productId: normalizedProductId,
      variantId: normalizedVariantId || "",
      recommendationToken: recommendation.recommendation_token,
    });
  }

  return matchedItems;
}

export async function getPendingPixelPurchase({
  shop,
  orderId,
  productId,
  variantId,
}) {
  const normalizedShop = normalizeText(shop);
  const normalizedOrderId = normalizeId(orderId);
  const normalizedProductId = normalizeId(productId);
  const normalizedVariantId = normalizeId(variantId);

  if (!normalizedShop || !normalizedOrderId || !normalizedProductId) {
    return null;
  }

  await initializeBuyNowPixelTables();
  const db = await getDb();

  const exactMatch = await db.get(
    `SELECT recommendation_token, recommended_size, variant_id
     FROM size_buddy_pending_pixel_purchases
     WHERE shop = ?
       AND order_id = ?
       AND product_id = ?
       AND variant_id = ?
     ORDER BY created_at DESC
     LIMIT 1`,
    [
      normalizedShop,
      normalizedOrderId,
      normalizedProductId,
      normalizedVariantId || "",
    ]
  );

  if (exactMatch) {
    return exactMatch;
  }

  if (!normalizedVariantId) {
    return null;
  }

  return db.get(
    `SELECT recommendation_token, recommended_size, variant_id
     FROM size_buddy_pending_pixel_purchases
     WHERE shop = ?
       AND order_id = ?
       AND product_id = ?
       AND variant_id = ''
     ORDER BY created_at DESC
     LIMIT 1`,
    [
      normalizedShop,
      normalizedOrderId,
      normalizedProductId,
    ]
  );
}

export async function clearPendingPixelPurchase({
  shop,
  orderId,
  productId,
  variantId,
}) {
  const normalizedShop = normalizeText(shop);
  const normalizedOrderId = normalizeId(orderId);
  const normalizedProductId = normalizeId(productId);
  const normalizedVariantId = normalizeId(variantId);

  if (!normalizedShop || !normalizedOrderId || !normalizedProductId) {
    return;
  }

  await initializeBuyNowPixelTables();
  const db = await getDb();
  await db.run(
    `DELETE FROM size_buddy_pending_pixel_purchases
     WHERE shop = ?
       AND order_id = ?
       AND product_id = ?
       AND variant_id = ?`,
    [
      normalizedShop,
      normalizedOrderId,
      normalizedProductId,
      normalizedVariantId || "",
    ]
  );
}
