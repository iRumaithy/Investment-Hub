# Investment Hub v2.3.1

- Private OKX account data stays behind Cloudflare Worker.
- Public crypto history/charts are requested directly from OKX from the user's device.
- This avoids shared Worker-IP public REST rate limiting / 1015.
- Public WebSocket remains direct.
- Private account refresh reduced to every 60 seconds.
- XTB stock history remains through Twelve Data.
