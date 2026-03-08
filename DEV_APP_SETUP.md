# Connecting This Repo to Your New Dev App (Shopify Partners)

Use this **only on the `dev` branch**. The production Size Buddy app and `main` branch are unchanged.

## What You Need From the New App (Partners Dashboard)

1. **Client ID** (API key)  
   Partners → Your new app → **App setup** → **Client ID**

2. **Client secret**  
   Same page → **Client secret** → Show / copy

3. **App URL** (for local dev you’ll use your tunnel URL, e.g. ngrok or Cloudflare)

---

## Steps to Connect (Dev Branch Only)

### 1. Use the dev branch

```bash
git checkout dev
```

Do not make these changes on `main`.

### 2. Point the project at the new app

Edit **`shopify.app.toml`** in the repo root and set the new app’s Client ID:

```toml
client_id = "YOUR_NEW_APP_CLIENT_ID"
```

Replace `YOUR_NEW_APP_CLIENT_ID` with the Client ID from your new app in Partners.  
Optionally update `name` and `handle` if you want (e.g. `name = "size-buddy-dev"`).

### 3. Create a `.env` file (not committed)

In the repo root create a file named **`.env`** with your **new app’s** credentials.  
Example (use your real values):

```env
SHOPIFY_API_KEY=your_new_app_client_id
SHOPIFY_API_SECRET=your_new_app_client_secret
SCOPES=write_products,read_products,write_customers,read_customers,read_themes,write_themes
```

For **local development**, the Shopify CLI usually sets `HOST` when you run `npm run dev` (or `yarn dev`). If you need to set it manually (e.g. for ngrok):

```env
HOST=https://your-ngrok-or-tunnel-url
```

The frontend expects the API key as well; the CLI often injects it. If you run the frontend build manually, you may need:

```env
VITE_SHOPIFY_API_KEY=your_new_app_client_id
```

### 4. In Shopify Partners (new app)

- **App URL**: your dev URL (e.g. ngrok URL when developing locally).
- **Allowed redirection URLs**: add  
  `https://your-dev-host/api/auth/callback`  
  `https://your-dev-host/api/auth/exit-iframe`  
  (replace `your-dev-host` with your tunnel host, e.g. `xxxx.ngrok.io`).
- **App proxy** (if you use it): point to your dev host and the same subpath as in `shopify.app.toml` (e.g. `apps/size-buddy`).
- **Webhooks**: set the webhook URL to `https://your-dev-host/api/webhooks` when testing on dev.

### 5. Run the app

```bash
npm run dev
# or
yarn dev
```

Use a dev store that has the **new app** installed (not the production Size Buddy app).

---

## Summary

| Source | Use for |
|--------|--------|
| **Client ID** | `shopify.app.toml` → `client_id`, `.env` → `SHOPIFY_API_KEY` and `VITE_SHOPIFY_API_KEY` |
| **Client secret** | `.env` → `SHOPIFY_API_SECRET` |
| **Scopes** | `.env` → `SCOPES` (same as in `shopify.app.toml` under `[access_scopes]`) |
| **Dev URL (ngrok etc.)** | `.env` → `HOST`; App URL and redirect URLs in Partners |

Keep credentials only in `.env`; never commit them. Only the **dev** branch should have `shopify.app.toml` pointing at the new app’s Client ID so **main** and the live Size Buddy app stay untouched.
