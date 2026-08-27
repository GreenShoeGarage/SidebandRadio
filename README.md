# SIDEBAND — Audio Broadcast Workbench

**Version:** 0.4.1  
**Production address:** `https://greenshoegarage.com/radio/`  
**Deployment model:** one Cloudflare Worker, one command after setup

SIDEBAND is an audio-only broadcast station for scheduled programming, synchronized public listening, protected station operation, resumable media uploads, playlists, program clocks, carts, station logs, backups, diagnostics, and an embeddable listener widget.

The v0.4 deployment no longer splits the public interface and backend across Apache and Cloudflare. Worker-hosted static assets, the Application Programming Interface (API), private R2 media, D1 metadata, and Durable Object synchronization all operate from the same `/radio` address.

## What changed in v0.4

- The entire application is served beneath `/radio/*` by one Worker route.
- Static assets and API requests are same-origin.
- Cross-Origin Resource Sharing (CORS) configuration is no longer required.
- `config.js` no longer needs a separate Worker hostname.
- Apache uploads, `.htaccess`, and `.htpasswd` are no longer part of deployment.
- Cloudflare Access protects both Studio and administrative API paths.
- `npm run setup:cloudflare` performs the one-time infrastructure setup.
- `npm run deploy` tests, migrates, deploys, and verifies future releases.
- Root-based local development remains supported.

## Architecture

| Address | Purpose | Access |
| --- | --- | --- |
| `/radio/` | Public listener and widget generator | Public |
| `/radio/embed.html` | Embeddable listener | Public and frameable |
| `/radio/api/public/*` | Public station state and live subscription | Public |
| `/radio/media/:assetId` | R2 media projection with byte ranges | Public by station asset identifier |
| `/radio/studio` | Station Studio (canonical address) | Cloudflare Access |
| `/radio/studio.html` | Compatible Studio alias | Cloudflare Access |
| `/radio/api/admin/*` | Uploads and station operations | Cloudflare Access plus Worker token validation |

R2 remains private. The Worker is the only public media gateway. D1 stores metadata. A Durable Object owns authoritative on-air state and listener synchronization. Cloudflare Realtime is optional and used only for microphone broadcasting.

## Requirements

- Node.js 22.13 or newer
- npm 10 or newer
- A Cloudflare account
- `greenshoegarage.com` active and proxied through Cloudflare
- Permission to create Workers, D1 databases, R2 buckets, Durable Objects, routes, secrets, and Cloudflare Access applications
- Audio you own or are authorized to broadcast

## Fast deployment

From the project directory:

```bash
npm ci
npx wrangler login
npm run setup:cloudflare
```

The setup command:

1. verifies the Cloudflare login;
2. reuses or creates the `sideband` D1 database;
3. writes the real D1 identifier into `wrangler.jsonc`;
4. reuses or creates the private `sideband-media` R2 bucket;
5. applies remote migrations;
6. deploys the Worker and frontend to the `/radio*` route; and
7. prints the final Cloudflare Access step.

### Configure Cloudflare Access once

In **Cloudflare Zero Trust → Access controls → Applications**, create a self-hosted application for `greenshoegarage.com`. Add both protected paths:

```text
/radio/studio*
/radio/api/admin/*
```

Add an Allow policy for your operator identity. Copy the Access team domain and application audience tag, then run:

```bash
npm run configure:access
```

Wrangler prompts for both values and stores them as encrypted Worker secrets. The command then redeploys SIDEBAND.

Open:

```text
Listener: https://greenshoegarage.com/radio/
Studio:   https://greenshoegarage.com/radio/studio
Widget:   https://greenshoegarage.com/radio/embed.html
```

## Future updates

For every later release:

```bash
npm ci
npm run deploy
```

The deployment command runs the complete test suite, applies pending D1 migrations, deploys the Worker and static assets together, and polls the public health endpoint.

To verify a different environment:

```bash
SIDEBAND_PUBLIC_URL="https://example.com/radio/" npm run verify:live
```

## Local development

Create local development settings:

```bash
cp .dev.vars.example .dev.vars
npm run migrate:local
npm run fixtures
npm run dev
```

Open:

```text
Listener: http://localhost:8787/
Studio:   http://localhost:8787/studio.html
```

The local root addresses are intentional. Production requests are normalized from `/radio/*` before they reach the same route handlers and asset binding.

Set this only in the local `.dev.vars` file:

```text
LOCAL_AUTH_BYPASS=true
```

Never enable the local authentication bypass in production.

## First broadcast

1. Sign in to Studio.
2. Open Diagnostics and confirm D1, R2, Durable Object, and authorization health.
3. Upload an authorized audio file.
4. Create a playlist and add the asset.
5. Create or publish a schedule occurrence covering the current time.
6. Select **Start Station**.
7. Open the public listener and select **Listen**.
8. Open a second listener and confirm synchronized program state.

## Widget generator

The listener contains a customizable widget generator for layout, theme, accent color, artwork, program details, and station-link visibility. It emits an iframe whose source remains beneath:

```text
https://greenshoegarage.com/radio/embed.html
```

Only `embed.html` permits third-party framing. Listener and Studio pages retain same-origin framing protection.

## Optional live microphone

Recorded automation does not require Cloudflare Realtime. To enable the microphone workflow:

```bash
npx wrangler secret put REALTIME_APP_ID --config wrangler.jsonc
npx wrangler secret put REALTIME_API_TOKEN --config wrangler.jsonc
npm run deploy
```

Use headphones during live operation and validate failover to scheduled audio before broadcasting publicly.

## Commands

| Command | Purpose |
| --- | --- |
| `npm test` | Run every automated test |
| `npm run test:unit` | Run SIDEBAND domain tests |
| `npm run migrate:local` | Apply D1 migrations locally |
| `npm run migrate:remote` | Apply pending production migrations |
| `npm run fixtures` | Generate original Waveform Audio File Format fixtures |
| `npm run dev` | Start local Wrangler development |
| `npm run setup:cloudflare` | Create and deploy production infrastructure |
| `npm run configure:access` | Store Access secrets and redeploy |
| `npm run deploy` | Test, migrate, deploy, and health-check |
| `npm run verify:live` | Check the deployed public health endpoint |

## Security boundaries

- Cloudflare Access is the outer authentication layer.
- The Worker independently verifies the Access JavaScript Object Notation Web Token (JWT) issuer, audience, lifetime, key, and signature.
- Administrative mutations require an authorized same-origin request.
- R2 is private and media is served only through the Worker.
- Uploads are bound to the operator, expected type, size, part count, and expiration.
- Only the normalized widget page permits third-party framing.
- Secrets belong in Wrangler secrets or `.dev.vars`, never in `public/`.
- No telemetry or advertising is included.

## Project layout

```text
public/                 Framework-free listener, Studio, and widget
src/                    Worker, authorization, media, schedules, state
drizzle/                Versioned D1 migrations
db/                     Drizzle schema
scripts/                Setup, deployment verification, fixtures
tests/                  Routing, security, media, widget, and domain tests
docs/                   Architecture, API, deployment, security, data format
wrangler.jsonc          Worker route and Cloudflare bindings
```

Detailed references are available in `docs/DEPLOYMENT.md`, `docs/SECURITY.md`, `docs/ARCHITECTURE.md`, and `docs/API.md`.

## Release history

- **0.4.1 — 2026-08-27:** made `/radio/studio` the canonical Studio address, mapped it explicitly to the Studio asset, and consolidated both Studio URL forms under one Access wildcard.
- **0.4.0 — 2026-08-27:** consolidated the frontend and backend beneath `greenshoegarage.com/radio/*`, added guided infrastructure setup, one-command updates, same-origin media resolution, production path tests, and unified Access protection.
- **0.3.0 — 2026-08-26:** made the public package subdirectory-safe for Apache deployment.
- **0.2.0 — 2026-08-26:** added the public listener-widget generator and parameterized embedded player.
- **0.1.0 — 2026-08-26:** initial complete Cloudflare Worker, D1, R2, Durable Object, Studio, public listener, and test implementation.

## License

See `LICENSE`.
