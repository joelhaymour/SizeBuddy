# Size Buddy App Proxy Setup Guide

This guide will help you set up the Size Buddy app proxy to enable the size recommendation widget on your storefront.

## What is App Proxy?

App Proxy allows the Size Buddy app to serve content through your store's domain, creating a seamless experience for your customers. This is necessary for the size recommendation widget to work properly on your product pages.

## Setting Up App Proxy

1. **Log in to your Shopify Partners account**

2. **Navigate to your Size Buddy app**
   - Go to "Apps" in the left sidebar
   - Find and click on "Size Buddy"

3. **Set up App Proxy**
   - In the app settings, find the "App Proxy" section
   - Click "Set up" or "Configure"
   - Enter the following information:
     - **Subpath prefix**: `size-buddy` (This will be part of the URL path)
     - **Proxy URL**: Your app server URL + `/api/proxy` (e.g., `https://your-app-server.com/api/proxy`)
   - Click "Save"

## Adding the Size Buddy Widget to Your Theme

After setting up the App Proxy, you need to add the Size Buddy widget to your theme:

1. **Go to your Shopify admin**
   - Navigate to "Online Store" > "Themes"

2. **Edit your theme**
   - Find your active theme and click "Actions" > "Edit code"

3. **Add the Size Buddy snippet**
   - In the theme editor, go to the "Snippets" section
   - Click "Add a new snippet" and name it `size-buddy-snippet`
   - Copy and paste the following code:

```liquid
{% comment %}
  Size Buddy Integration Snippet
  
  This snippet loads the Size Buddy integration on product pages.
{% endcomment %}

{% if template contains 'product' %}
  <link rel="stylesheet" href="{{ shop.url }}/apps/size-buddy/size-buddy-storefront.css">
  <script src="{{ shop.url }}/apps/size-buddy/size-buddy-storefront.js" defer></script>
{% endif %}
```

4. **Include the snippet in your product template**
   - Go to the "Templates" section
   - Open your product template (usually `product.liquid`)
   - Add the following line where you want the Size Buddy widget to appear:

```liquid
{% include 'size-buddy-snippet' %}
```

5. **Save your changes**

## Testing the Integration

To test if the Size Buddy widget is working correctly:

1. Go to a product page on your store
2. You should see a "Find Your Size" button near the Add to Cart button
3. Click the button to open the size recommendation modal
4. Enter your measurements and click "Get My Size"
5. You should receive a size recommendation based on the measurements you entered

## Troubleshooting

If the Size Buddy widget is not appearing or not working correctly:

1. **Check App Proxy Setup**
   - Make sure the App Proxy is set up correctly in your Shopify Partners dashboard
   - Verify that the subpath prefix is `size-buddy`
   - Ensure the Proxy URL is correct and points to your app server

2. **Check Theme Integration**
   - Make sure the `size-buddy-snippet` is included in your product template
   - Verify that the snippet code is correct

3. **Check Browser Console**
   - Open your browser's developer tools (F12 or right-click > Inspect)
   - Go to the Console tab to check for any error messages

4. **Contact Support**
   - If you're still having issues, please contact Size Buddy support for assistance

## Advanced Configuration

For advanced configuration options, please refer to the Size Buddy documentation or contact our support team. 