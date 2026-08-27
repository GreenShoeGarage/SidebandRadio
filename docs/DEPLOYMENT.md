# SIDEBAND v0.4.1 Deployment and Operations

## Production topology

One Cloudflare Worker route owns `greenshoegarage.com/radio*`. Requests beneath that prefix are normalized internally so the same root-based handlers continue to work in local development.

| Production path | Internal handler |
| --- | --- |
| `/radio/` | `/` static asset |
| `/radio/embed.html` | `/embed.html` static asset |
| `/radio/studio` | `/studio.html` plus operator validation |
| `/radio/studio.html` | `/studio.html` compatible alias |
| `/radio/api/*` | `/api/*` |
| `/radio/media/*` | `/media/*` |

The Green Shoe Garage origin continues handling every address outside `/radio*`.

## One-time deployment

```bash
npm ci
npx wrangler login
npm run setup:cloudflare
```

The setup script is idempotent: it reuses `sideband` and `sideband-media` when they already exist. It updates the D1 binding, migrates the database, and deploys the application. Stop if the Cloudflare account shown by `wrangler whoami` does not own the `greenshoegarage.com` zone.

Do not edit applied files under `drizzle/`. Generate and append a new migration for schema changes.

## Cloudflare Access

Create one self-hosted Access application for `greenshoegarage.com` and add both paths:

```text
/radio/studio*
/radio/api/admin/*
```

Add an Allow policy for intended operators. Then run:

```bash
npm run configure:access
```

Enter the exact Access team domain and application audience tag. Wrangler stores both values as encrypted Worker secrets and redeploys.

Keep `ENVIRONMENT=production`. Never add `LOCAL_AUTH_BYPASS` to production.

## Acceptance checks

```bash
curl -i https://greenshoegarage.com/radio/api/health/public
curl -i https://greenshoegarage.com/radio/api/public/station
curl -i https://greenshoegarage.com/radio/api/admin/bootstrap
```

Expected results:

1. Public health and station requests return successful JavaScript Object Notation (JSON) responses.
2. Anonymous administrative requests receive an Access challenge or authorization failure.
3. Opening `/radio/studio` starts the Access login flow and then displays the operator identity.
4. `/radio/embed.html` loads inside an iframe on a different website.
5. `/radio` redirects permanently to `/radio/` so relative assets resolve correctly.

## Future deployments

```bash
npm ci
npm run deploy
```

This runs tests, applies pending remote migrations, deploys the Worker and public assets together, and retries the public health check for approximately thirty seconds.

If a non-production address is being verified:

```bash
SIDEBAND_PUBLIC_URL="https://example.com/radio/" npm run verify:live
```

## Local development

```bash
cp .dev.vars.example .dev.vars
npm run migrate:local
npm run fixtures
npm run dev
```

Local addresses remain root-based:

```text
http://localhost:8787/
http://localhost:8787/studio.html
```

Production-prefix behavior is covered separately by automated tests.

## Optional Cloudflare Realtime

```bash
npx wrangler secret put REALTIME_APP_ID --config wrangler.jsonc
npx wrangler secret put REALTIME_API_TOKEN --config wrangler.jsonc
npm run deploy
```

Validate with headphones, two listener browsers, and the automatic scheduled-audio fallback. If the optional provider configuration fails, remove the Realtime secrets; recorded broadcasting remains available.

## Backup before upgrades

```bash
npx wrangler d1 export sideband --remote --output sideband-d1-backup.sql
```

Also:

- export the configuration backup from Studio;
- retain the original source audio outside R2;
- record the deployed commit and application version;
- preserve the current `wrangler.jsonc` database identifier; and
- test import validation before relying on a backup.

## Rollback

1. Redeploy the last known-good source.
2. Do not reverse a D1 migration destructively without a reviewed recovery plan.
3. Restore D1 from a verified backup if required.
4. Confirm public health, media byte ranges, Access protection, and synchronized playback.

## Definition of done

- `https://greenshoegarage.com/radio/` renders with no missing assets.
- Studio is protected by Cloudflare Access.
- D1, R2, and Durable Object diagnostics are healthy.
- An uploaded asset can be auditioned and placed into a playlist.
- A current scheduled program can be started.
- Two listeners agree on the program and position.
- Media seeking returns partial-content responses.
- The generated widget works on another domain.
