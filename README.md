# SizeBuddy

SizeBuddy is a production Shopify app that helps shoppers choose the right size directly on a product page.

I built it as a full Shopify application rather than a standalone demo: it includes a storefront theme extension, merchant-facing configuration, sizing recommendations, analytics and attribution, billing, app-proxy routes, GDPR webhooks, and production session/database infrastructure.

## What it does

- Adds a native size-recommendation experience to Shopify product pages
- Lets merchants configure sizing data and storefront behavior
- Collects shopper measurements and returns a recommended size
- Tracks widget usage and downstream conversion attribution
- Uses a Shopify Web Pixel extension for customer-event tracking
- Supports Shopify billing and authenticated merchant sessions
- Handles Shopify privacy/GDPR webhooks
- Works across custom storefront domains through Shopify app-proxy routes
- Supports SQLite locally and PostgreSQL/Redis-backed infrastructure in production

## Why I built it

Sizing is one of the highest-friction parts of buying apparel online. SizeBuddy was built to reduce guesswork for shoppers while giving merchants a simple way to add sizing guidance without rebuilding their storefront.

The project gave me hands-on experience building and shipping inside the Shopify ecosystem, including storefront extensions, OAuth, webhooks, app proxies, customer events, merchant admin flows, production deployment, and persistent data.

## Architecture

### Shopify storefront
- Theme App Extension
- Liquid app block
- JavaScript sizing widget
- Shopify App Proxy
- Web Pixel extension for attribution

### Backend
- Node.js
- Express
- Shopify API libraries
- PostgreSQL in production
- SQLite for local development
- Redis-backed Shopify session storage when configured

### Platform integrations
- Shopify OAuth
- Admin API
- Orders and products
- Customer events
- Billing
- GDPR/compliance webhooks
- Theme extensions
- Web Pixels

## Project structure

```
SizeBuddy/
├── extensions/
│   ├── size-buddy-widget/          # storefront theme extension
│   └── size-buddy-buy-now-pixel/   # Shopify Web Pixel extension
├── web/
│   ├── routes/
│   │   ├── size-recommendations.js
│   │   ├── analytics.js
│   │   ├── pixel-attribution.js
│   │   ├── widget-customization.js
│   │   ├── billing.js
│   │   └── app-proxy.js
│   ├── shopify.js
│   ├── db.js
│   └── index.js
└── shopify.app.toml
```

## Local development

Requirements:
- Node.js 22
- Shopify CLI
- A Shopify Partner/development store

```bash
npm install
npm run dev
```

Environment-specific credentials are loaded from local environment variables and are intentionally excluded from this repository.

## Security

- Environment files are ignored by Git
- Shopify API secrets are loaded from environment variables
- Production database credentials are not stored in the repository
- Shopify sessions can be stored in Redis in production
- GDPR webhooks are implemented for Shopify compliance flows

See [SECURITY.md](SECURITY.md) for additional notes.

## Status

Shipped Shopify app and active portfolio project.

---

Built by [Joel Haymour](https://github.com/joelhaymour).
