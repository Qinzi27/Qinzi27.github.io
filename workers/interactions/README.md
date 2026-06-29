# Qinzi27 Interactions Worker

This Cloudflare Worker stores shared visitor interactions for the GitHub Pages site:

- sticker placements on the public sticker wall and protected calendar
- per-day calendar comments

The Worker uses Cloudflare D1 and exposes public write endpoints with strict size and asset-path validation. Admin endpoints require `ADMIN_TOKEN` as a bearer token.

## First Deploy

```powershell
npx wrangler d1 create qinzi27-interactions --config workers/interactions/wrangler.toml
npx wrangler d1 migrations apply qinzi27-interactions --remote --config workers/interactions/wrangler.toml
npx wrangler secret put ADMIN_TOKEN --config workers/interactions/wrangler.toml
npx wrangler deploy --config workers/interactions/wrangler.toml
```

After `d1 create`, copy the returned `database_id` into `wrangler.toml`.

## Moderation Mode

`PUBLIC_WRITE_STATUS = "approved"` makes visitor changes visible immediately.

Change it to `"pending"` if new stickers and comments should wait for approval.
