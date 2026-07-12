# Qinzi27 Interactions Worker

This Cloudflare Worker stores sticker placements and protected calendar comments in the existing D1 schema.

## Authentication model

- `POST /api/visitor-session` creates a random UUID inside the Worker and returns only `{ "token": "..." }`.
- The token is signed as `v1` with HMAC-SHA256. Clients send it in `X-Visitor-Token`.
- The Worker ignores every `visitorId` supplied in a request body or query string.
- Public sticker and comment payloads expose `owned` instead of `visitorId`. The moderation endpoint may still include `visitorId` for administrative review.
- `VISITOR_SIGNING_SECRET` is the visitor-token signing key. For a compatible rollout, the Worker falls back to `ADMIN_TOKEN` if the dedicated secret is absent.
- `CALENDAR_ACCESS_TOKEN` is a separate shared-editor credential. It is embedded only inside the encrypted calendar payload; after password decryption the browser sends it as `X-Calendar-Token`.
- The calendar password itself never leaves the browser and is never sent to this Worker.
- `Authorization: Bearer <ADMIN_TOKEN>` remains the owner/admin credential. Its comparison does not use direct string equality.

Rotating `VISITOR_SIGNING_SECRET` invalidates previously issued visitor tokens. Tokens do not contain an expiry, so rotate this secret if all visitor sessions must be revoked.

## Endpoint permissions

| Endpoint                                           | Permission                                                                                                  |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `POST /api/visitor-session`                        | Public; no request body is required                                                                         |
| `GET /api/stickers?board=<public-board>`           | Public; a valid visitor token adds correct `owned` state and reveals that visitor's non-hidden pending rows |
| `POST /api/stickers` on a public board             | Valid visitor token, or admin                                                                               |
| `PATCH/DELETE /api/stickers/:id` on a public board | Owning visitor token, or admin                                                                              |
| All sticker methods on a `YYYY-MM` board           | Valid calendar token, or admin                                                                              |
| `GET /api/comments`                                | Valid calendar token or admin; requires `date`, `month`, or both `from` and `to`                            |
| `POST /api/comments`                               | Valid calendar token, or admin                                                                              |
| `/api/admin/*` and `POST /api/sticker-pages`       | Admin only                                                                                                  |

The CORS preflight allowlist includes `X-Visitor-Token` and `X-Calendar-Token`.

## First deploy

After `d1 create`, copy the returned `database_id` into `wrangler.toml`.

```powershell
npx wrangler d1 create qinzi27-interactions --config workers/interactions/wrangler.toml
npx wrangler d1 migrations apply qinzi27-interactions --remote --config workers/interactions/wrangler.toml
```

⚠️ Configure all three values as separate Cloudflare secrets; do not put them in `wrangler.toml` or source control:

```powershell
npx wrangler secret put ADMIN_TOKEN --config workers/interactions/wrangler.toml
npx wrangler secret put VISITOR_SIGNING_SECRET --config workers/interactions/wrangler.toml
npx wrangler secret put CALENDAR_ACCESS_TOKEN --config workers/interactions/wrangler.toml
npx wrangler deploy --config workers/interactions/wrangler.toml
```

`CALENDAR_ACCESS_TOKEN` must exactly match the GitHub Actions secret used when building the encrypted page. Deploy the Worker first, then deploy the static site.

This authentication update reuses the current `visitor_id` columns and requires no D1 migration.

## Moderation mode

`PUBLIC_WRITE_STATUS = "approved"` makes new records visible immediately. Change it to `"pending"` when new records should wait for approval.

## Local verification

Run the focused Worker tests with the in-memory D1 mock:

```powershell
npm.cmd test -- workers/interactions/src/index.test.ts
```

Run an isolated strict type check for the Worker and its test:

```powershell
node_modules\.bin\tsc.cmd --noEmit --strict --target ES2022 --module ESNext --moduleResolution Bundler --allowImportingTsExtensions --lib ES2022,DOM --types node --skipLibCheck workers/interactions/src/index.ts workers/interactions/src/index.test.ts
```
