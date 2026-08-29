Investment Hub v2.0.0 update package

IMPORTANT:
This package contains replacement/update files plus an APP_JS_APPEND.txt patch.
1. Replace styles.css, manifest.json, sw.js, worker/index.js, wrangler.jsonc.
2. Add .assetsignore and assets/icon.svg.
3. Open existing app.js and append the contents of APP_JS_APPEND.txt at the end INSIDE the final IIFE, immediately before the final `})();`.
4. In index.html change:
   theme-color to #ffffff
   apple-mobile-web-app-status-bar-style to default
   apple-touch-icon href to assets/icon.svg
   footer version v1.0.0 to v2.0.0
5. Cloudflare secrets stay in Cloudflare and must NOT be added to GitHub.
6. Safe diagnostics endpoint after deployment: /api/diagnostics (only true/false, never secret values).

Design: white + metallic gold + subtle gray marble.
Persistence: existing localStorage remains, and v2 adds automatic OKX/market refresh on app opening when configured.
