import { register } from "@shopify/web-pixels-extension";

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

function getLineItemProperty(lineItem, key) {
  const properties = lineItem?.properties;

  if (Array.isArray(properties)) {
    const match = properties.find((property) => {
      if (!property) return false;
      return property.name === key || property.key === key;
    });
    return match ? normalizeText(match.value) : "";
  }

  if (properties && typeof properties === "object") {
    return normalizeText(properties[key]);
  }

  return "";
}

async function postJson(url, payload) {
  await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    keepalive: true,
  });
}

register(({ analytics, settings }) => {
  const backendUrl = normalizeText(settings?.backendUrl).replace(/\/$/, "");
  const shopDomain = normalizeText(settings?.shopDomain);

  if (!backendUrl || !shopDomain) {
    return;
  }

  analytics.subscribe("size_buddy:recommendation_logged", async (event) => {
    const recommendationToken = normalizeText(event?.customData?.recommendationToken);
    const productId = normalizeId(event?.customData?.productId);

    if (!recommendationToken || !productId || !event?.clientId) {
      return;
    }

    try {
      await postJson(`${backendUrl}/api/pixel/recommendation`, {
        shop: shopDomain,
        client_id: event.clientId,
        recommendation_token: recommendationToken,
        product_id: productId,
        chart_id: normalizeId(event?.customData?.chartId) || null,
        recommended_size: normalizeText(event?.customData?.recommendedSize) || null,
      });
    } catch (_error) {
      // Ignore pixel transport errors so checkout rendering is never blocked.
    }
  });

  analytics.subscribe("checkout_completed", async (event) => {
    const orderId = normalizeId(event?.data?.checkout?.order?.id);
    const lineItems = Array.isArray(event?.data?.checkout?.lineItems) ? event.data.checkout.lineItems : [];
    const checkoutCurrency = normalizeText(event?.data?.checkout?.currencyCode) || null;

    if (!orderId || !lineItems.length || !event?.clientId) {
      return;
    }

    const payloadLineItems = lineItems
      .map((lineItem) => ({
        line_item_id: normalizeId(lineItem?.id) || null,
        product_id: normalizeId(
          lineItem?.product?.id ||
          lineItem?.variant?.product?.id ||
          lineItem?.merchandise?.product?.id
        ),
        variant_id: normalizeId(
          lineItem?.variant?.id ||
          lineItem?.merchandise?.id
        ) || null,
        recommendation_token: getLineItemProperty(lineItem, "_size_buddy_recommendation_token") || null,
        quantity: typeof lineItem?.quantity === "number" ? lineItem.quantity : 1,
        revenue_amount: lineItem?.finalLinePrice?.amount ?? null,
        currency: normalizeText(lineItem?.finalLinePrice?.currencyCode) || checkoutCurrency,
      }))
      .filter((lineItem) => lineItem.product_id);

    if (!payloadLineItems.length) {
      return;
    }

    try {
      await postJson(`${backendUrl}/api/pixel/checkout-completed`, {
        shop: shopDomain,
        client_id: event.clientId,
        order_id: orderId,
        order_name: normalizeText(event?.data?.checkout?.order?.name) || null,
        currency: checkoutCurrency,
        line_items: payloadLineItems,
      });
    } catch (_error) {
      // Ignore pixel transport errors so checkout rendering is never blocked.
    }
  });
});
