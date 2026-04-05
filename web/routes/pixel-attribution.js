import { Router } from "express";
import {
  initializeBuyNowPixelTables,
  recordPixelCheckoutPurchases,
  recordPixelRecommendation,
} from "../utils/buyNowPixel.js";

const router = Router();

initializeBuyNowPixelTables().catch(console.error);

router.post("/api/pixel/recommendation", async (req, res) => {
  try {
    const {
      shop,
      client_id: clientId,
      recommendation_token: recommendationToken,
      product_id: productId,
      chart_id: chartId,
      recommended_size: recommendedSize,
    } = req.body || {};

    if (!shop || !clientId || !recommendationToken || !productId) {
      return res.status(400).json({ error: "Missing required parameters" });
    }

    await recordPixelRecommendation({
      shop,
      clientId,
      recommendationToken,
      productId,
      chartId,
      recommendedSize,
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error recording Buy it now pixel recommendation:", error);
    return res.status(500).json({ error: "Failed to record pixel recommendation" });
  }
});

router.post("/api/pixel/checkout-completed", async (req, res) => {
  try {
    const {
      shop,
      client_id: clientId,
      order_id: orderId,
      order_name: orderName,
      currency,
      line_items: lineItems,
    } = req.body || {};

    if (!shop || !clientId || !orderId || !Array.isArray(lineItems)) {
      return res.status(400).json({ error: "Missing required parameters" });
    }

    const matchedItems = await recordPixelCheckoutPurchases({
      shop,
      clientId,
      orderId,
      orderName,
      currency,
      lineItems: lineItems.map((lineItem) => ({
        lineItemId: lineItem?.line_item_id,
        productId: lineItem?.product_id,
        variantId: lineItem?.variant_id,
        recommendationToken: lineItem?.recommendation_token,
        quantity: lineItem?.quantity,
        revenueAmount: lineItem?.revenue_amount,
        currency: lineItem?.currency,
      })),
    });

    return res.status(200).json({
      success: true,
      matched: matchedItems.length,
    });
  } catch (error) {
    console.error("Error recording Buy it now checkout completion:", error);
    return res.status(500).json({ error: "Failed to record checkout completion" });
  }
});

export default router;
