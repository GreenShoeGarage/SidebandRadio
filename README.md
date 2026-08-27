# SIDEBAND — Audio Broadcast Workbench

**Version:** 0.5.3  
**Production address:** `https://greenshoegarage.com/radio/`  
**Deployment model:** one Cloudflare Worker, one command after setup

SIDEBAND is an audio-only broadcast station with a simple select-files-and-broadcast workflow, synchronized public listening, protected station operation, optional advanced scheduling, live microphone audio, station logs, diagnostics, and an embeddable listener widget.

## What changed in v0.5

- Studio opens in **Easy Mode** by default.
- Prerecorded broadcasting is now: select files → press **Broadcast Selected Files**.
- SIDEBAND uploads the files, starts the first one, advances automatically in selection order, and stops after the final file.
- Closing Studio does not stop or strand the temporary queue; the Durable Object owns its transitions.
- Pause, Resume, Restart, Skip, End Broadcast, public listener synchronization, and widget metadata understand Easy Broadcast.
- **Advanced Mode** retains the library, playlists, program clocks, schedules, carts, and full station transport.

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

The deployment command runs the complete test suite, verifies the D1 binding, applies pending migrations, deploys the Worker and static assets together, and polls the public health endpoint. Release ZIPs intentionally contain a non-working placeholder database identifier; when updating an existing station, `npm run deploy` finds the existing D1 database named `sideband` and restores its real identifier before migration.

If this is a new Cloudflare account and no `sideband` database exists yet, the deploy command stops safely and directs you to run `npm run setup:cloudflare` once.

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
3. Leave the Studio in **Easy Mode**.
4. Select or drop one or more authorized audio files into **Select Files. Hit Broadcast.**
5. Confirm the files appear in the intended playback order.
6. Select **Broadcast Selected Files**. Uploading and station startup happen automatically.
7. Open the public listener and select **Listen**.
8. Open a second listener and confirm synchronized current-file and queue state.

The station plays the files once, in selection order, then stops. Uploaded media is retained privately in R2 so the same completed selection can be broadcast again without another upload.

## Advanced programmed broadcasting

Use the header mode switch to enter **Advanced Mode** when you need a reusable library, playlists, program clocks, published schedules, carts, or the full station transport. Switching modes changes the operator interface only; it does not interrupt audio already on air.

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

The Studio publisher sends the raw microphone track through the same WebRTC sequence used by Cloudflare's maintained example. Session creation has no JSON body; the subsequent track request sends the plain offer and lets Realtime discover the offered microphone transceiver. After deploying, run **Preflight Microphone**, confirm level-meter movement, select **Take Live**, and verify the Studio badge changes to **LIVE** before testing the public listener. If the provider rejects a step, Studio identifies the failing stage and the diagnostic export includes a privacy-safe handshake summary.

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
| `npm run ensure:cloudflare` | Validate or recover the existing D1 binding |
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

- **0.5.3 — 2026-08-27:** corrected the D1-to-R2 media mapping so public MP3 requests use the stored `object_key` and `mime_type`; added a regression test that requires the exact private object key and validates production-prefix byte-range delivery.
- **0.5.2 — 2026-08-27:** unified listener intent across live microphone and prerecorded sources, preserved listening through fallback and file transitions, explicitly detached WebRTC streams before MP3 playback, and added actionable browser media errors plus production-prefix byte-range coverage.
- **0.5.1 — 2026-08-27:** made release upgrades recover the existing `sideband` D1 identifier automatically before migration, while preserving valid configured identifiers and directing genuinely new installations through the one-time setup command.
- **0.5.0 — 2026-08-27:** added default Easy Mode with select-files-and-broadcast operation, automatic multipart upload, a Durable Object-owned temporary queue, automatic file transitions, queue-aware listener and widget state, and an Advanced Mode switch that preserves the full programmed workflow.
- **0.4.6 — 2026-08-27:** made live microphone broadcasts visually unmistakable across Studio, the public listener, and embedded widgets; corrected live rendering when no scheduled media item exists; added immediate and polled Studio live-state updates; and added elapsed on-air timing and live-aware listener controls.
- **0.4.5 — 2026-08-27:** removed the empty JSON body from Realtime session creation, matched Cloudflare's raw-microphone publisher path, reported provider stage/status/error details, recorded privacy-safe SDP shape diagnostics, and marked Realtime health degraded after a failed live attempt.
- **0.4.4 — 2026-08-27:** aligned browser negotiation with Cloudflare's maintained WebRTC client by publishing the microphone with `addTrack`, sending the original offer immediately after `setLocalDescription`, and avoiding gathered-candidate mutation before the Connection API validates the offer.
- **0.4.3 — 2026-08-27:** corrected Cloudflare Realtime microphone signaling to use SDP track auto-discovery, normalized browser session descriptions to the Connection API schema, validated the returned published track, restored listener retries after failed negotiation, and added publisher/listener payload regression tests.
- **0.4.2 — 2026-08-27:** disabled automatic static-asset HTML redirects and explicitly mapped the listener root and Studio asset so internal `/radio` normalization cannot generate a root-level `/studio` redirect.
- **0.4.1 — 2026-08-27:** made `/radio/studio` the canonical Studio address, mapped it explicitly to the Studio asset, and consolidated both Studio URL forms under one Access wildcard.
- **0.4.0 — 2026-08-27:** consolidated the frontend and backend beneath `greenshoegarage.com/radio/*`, added guided infrastructure setup, one-command updates, same-origin media resolution, production path tests, and unified Access protection.
- **0.3.0 — 2026-08-26:** made the public package subdirectory-safe for Apache deployment.
- **0.2.0 — 2026-08-26:** added the public listener-widget generator and parameterized embedded player.
- **0.1.0 — 2026-08-26:** initial complete Cloudflare Worker, D1, R2, Durable Object, Studio, public listener, and test implementation.

## License

See `LICENSE`.
