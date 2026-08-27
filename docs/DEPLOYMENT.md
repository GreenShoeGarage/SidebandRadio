# SIDEBAND v0.5.3 Deployment and Operations

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

Static-asset HTML canonicalization is disabled. The Worker explicitly maps `/radio/` to `index.html` and both Studio URL forms to `studio.html`, preventing Cloudflare Static Assets from redirecting an internally normalized path outside `/radio`.

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

This runs tests, validates the D1 binding, applies pending remote migrations, deploys the Worker and public assets together, and retries the public health check for approximately thirty seconds.

Every release ZIP contains the inert D1 identifier `00000000-0000-4000-8000-000000000000`; it is never a deployable database. Before migration, the deploy command:

1. preserves a valid identifier already present in `wrangler.jsonc`;
2. otherwise lists D1 databases in the authenticated account and restores the identifier for the database named `sideband`; and
3. stops with an instruction to run `npm run setup:cloudflare` if that database does not exist.

For unattended deployment, `SIDEBAND_D1_DATABASE_ID` may explicitly supply the existing identifier. The value must be a valid non-placeholder D1 UUID.

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

## Easy Broadcast acceptance sequence

1. Open Studio and confirm the header says **Easy Mode**.
2. Select two short authorized audio files.
3. Confirm both filenames, durations, order, and total running time appear before broadcasting.
4. Select **Broadcast Selected Files** and confirm each upload reaches 100 percent.
5. Confirm Studio changes to **On Air — Easy Broadcast** and identifies file 1 of 2.
6. Open the public listener, select **Listen**, and confirm the current title and next-file title.
7. Let the first file finish and confirm both listeners advance to the second file together without Studio intervention.
8. Let the second file finish and confirm the station returns to **Offline**.
9. Repeat once with Pause and Resume, then once with Skip and End Broadcast.

## Optional Cloudflare Realtime

```bash
npx wrangler secret put REALTIME_APP_ID --config wrangler.jsonc
npx wrangler secret put REALTIME_API_TOKEN --config wrangler.jsonc
npm run deploy
```

Validate with headphones, two listener browsers, and the automatic scheduled-audio fallback. If the optional provider configuration fails, remove the Realtime secrets; recorded broadcasting remains available.

Live microphone acceptance sequence:

1. Select **Preflight Microphone** and confirm the level meter moves.
2. Select **Take Live** and confirm the Studio header, live banner, current deck, source, and on-air timer all change to **LIVE**.
3. In a separate browser, open the listener and confirm **LIVE NOW — MICROPHONE BROADCAST** appears before selecting **Listen Live**.
4. Speak into the microphone and confirm listener audio, then repeat with the generated embedded widget on another origin.
5. Select **End Live** and confirm every surface clears its live treatment while the station invokes its resume or fallback behavior.

The Worker keeps the Realtime application secret server-side. It creates the provider session with no request body, matching Cloudflare's maintained examples. The browser publishes the raw microphone track and submits the original offer immediately after setting its local description. The Worker forwards it with `autoDiscover: true`, stores the track name returned by Cloudflare, and uses that exact source reference for listener subscriptions.

If Take Live fails, the message now identifies `session.create` or `track.publish`. Export diagnostics immediately after the failed attempt. The `lastRealtimeFailure` object includes provider status, provider error code, correlation identifiers, and structural offer checks without including raw SDP or secrets. Realtime health is shown as degraded until a later live publication succeeds.

## Backup before upgrades

```bash
npx wrangler d1 export sideband --remote --output sideband-d1-backup.sql
```

Also:

- export the configuration backup from Studio;
- retain the original source audio outside R2;
- record the deployed commit and application version;
- preserve the current `wrangler.jsonc` database identifier when practical (the deployment preflight can also recover it by database name); and
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
- Easy mode can select local audio files and start broadcasting without creating a playlist or schedule.
- The Easy Broadcast queue advances automatically and stops after its final file.
- Advanced mode can still audition assets, build playlists, and start a scheduled program.
- Two listeners agree on the program and position.
- Media seeking returns partial-content responses.
- The generated widget works on another domain.
