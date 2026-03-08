# Dev branch – local testing commands (SizeBuddy-2)

Use these paths: **SizeBuddy-2** (this repo). Your ngrok URL and app credentials are already in `.env` in the repo root, `web/`, and `web/frontend/`.

---

## Before you start

1. **Use the dev branch**
   ```bash
   cd /Users/joelhaymour/SizeBuddy-2
   git checkout dev
   ```

2. **Start ngrok** (Terminal 0 – leave running)
   ```bash
   ngrok http 3000
   ```
   If your ngrok URL changes, update `.env` in the repo root, `web/`, and `web/frontend/` with the new `HOST=...`.

---

## Option A – Manual (same style as your old workflow)

**Terminal 1 – build frontend then start backend**
```bash
# Build frontend
cd /Users/joelhaymour/SizeBuddy-2/web/frontend && npm run build

# Start backend (keep this running)
cd /Users/joelhaymour/SizeBuddy-2/web && npm run dev
```

**Terminal 2 – start frontend**
```bash
cd /Users/joelhaymour/SizeBuddy-2/web/frontend && npm run dev
```

Then open the URL the backend prints (or your ngrok URL) and install/use the **new dev app** on your dev store.

---

## Option B – One command from root (Shopify CLI)

**Single terminal**
```bash
cd /Users/joelhaymour/SizeBuddy-2
npm run dev
```

This runs `shopify app dev`: it starts backend and frontend and uses your `shopify.app.toml` and `.env`. Keep ngrok running on port 3000; if the CLI asks for a tunnel URL, use your ngrok URL (e.g. `https://31f74bcd7f90.ngrok.app`).

---

## Deploy (dev app only)

To deploy the **dev** app (extensions, config, etc.) to your dev store:

```bash
cd /Users/joelhaymour/SizeBuddy-2
git checkout dev
npx -y @shopify/cli@latest app deploy
```

This uses the app defined in `shopify.app.toml` on the dev branch (your new dev app). It does **not** change the production Size Buddy app or `main` branch.

---

## Summary

| What              | Command / path |
|-------------------|----------------|
| Repo root         | `/Users/joelhaymour/SizeBuddy-2` |
| Build frontend    | `cd /Users/joelhaymour/SizeBuddy-2/web/frontend && npm run build` |
| Backend           | `cd /Users/joelhaymour/SizeBuddy-2/web && npm run dev` |
| Frontend          | `cd /Users/joelhaymour/SizeBuddy-2/web/frontend && npm run dev` |
| One-command dev   | `cd /Users/joelhaymour/SizeBuddy-2 && npm run dev` |
| Deploy dev app    | `cd /Users/joelhaymour/SizeBuddy-2 && npx -y @shopify/cli@latest app deploy` |

Always run from **SizeBuddy-2** (not SizeBuddy) and stay on the **dev** branch so the production app and `main` are not affected.
