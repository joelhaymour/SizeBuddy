import shopify from '../shopify.js';

const PRODUCT_VARIANTS_QUERY = `#graphql
  query SizeBuddyProductVariants($id: ID!) {
    product(id: $id) {
      variants(first: 100) {
        nodes {
          id
          title
          inventoryQuantity
          inventoryPolicy
          selectedOptions {
            name
            value
          }
        }
      }
    }
  }
`;

function normalizeShopDomain(shop) {
  return String(shop || '').replace(/^https?:\/\//, '').split('/')[0];
}

function variantIdFromGid(gid) {
  const value = String(gid || '');
  const parts = value.split('/');
  return parts[parts.length - 1] || value;
}

function isSoldOutVariant(node) {
  const policy = String(node?.inventoryPolicy || '').toUpperCase();
  const quantity = Number(node?.inventoryQuantity);
  if (policy === 'CONTINUE') return false;
  if (!Number.isNaN(quantity) && quantity <= 0) return true;
  return false;
}

export async function fetchProductVariantsForStorefront(shop, productId) {
  const shopDomain = normalizeShopDomain(shop);
  if (!shopDomain || !productId) return [];

  const sessionStorage = shopify.config?.sessionStorage;
  if (!sessionStorage || typeof sessionStorage.findSessionsByShop !== 'function') {
    console.warn('Size Buddy: Shopify session storage is unavailable for variant lookup');
    return [];
  }

  let sessions = [];
  try {
    sessions = await sessionStorage.findSessionsByShop(shopDomain);
  } catch (error) {
    console.warn('Size Buddy: unable to load Shopify sessions for variant lookup', error);
    return [];
  }

  const session = (sessions || []).find(item => item && item.accessToken) || null;
  if (!session) {
    console.warn('Size Buddy: no Shopify session available for variant lookup', { shopDomain, productId });
    return [];
  }

  try {
    const client = new shopify.api.clients.Graphql({ session });
    const response = await client.request(PRODUCT_VARIANTS_QUERY, {
      variables: {
        id: `gid://shopify/Product/${productId}`
      }
    });

    const nodes = response?.body?.data?.product?.variants?.nodes || response?.data?.product?.variants?.nodes || [];
    return nodes.map(node => {
      const optionValues = Array.isArray(node?.selectedOptions)
        ? node.selectedOptions.map(option => option?.value).filter(Boolean)
        : [];
      const soldOut = isSoldOutVariant(node);
      return {
        id: variantIdFromGid(node?.id),
        title: node?.title || '',
        public_title: node?.title || '',
        options: optionValues,
        option1: optionValues[0] || null,
        option2: optionValues[1] || null,
        option3: optionValues[2] || null,
        inventory_quantity: Number.isNaN(Number(node?.inventoryQuantity)) ? null : Number(node.inventoryQuantity),
        inventory_policy: node?.inventoryPolicy || null,
        available: !soldOut,
        sold_out: soldOut,
      };
    });
  } catch (error) {
    console.warn('Size Buddy: Shopify variant lookup failed', error);
    return [];
  }
}
