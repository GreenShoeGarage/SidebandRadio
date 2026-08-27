# SIDEBAND v0.2.0 Deployment and Operations

## First deployment

Run from a fresh clone:

```bash
npm ci
npx wrangler login
npx wrangler d1 create sideband
npx wrangler r2 bucket create sideband-media
cp .dev.vars.example .dev.vars
```

Replace the all-zero D1 placeholder in `wrangler.jsonc` with the identifier returned by `wrangler d1 create`. If the bucket name differs, update `bucket_name`.

Validate locally:

```bash
npm run migrate:local
npm run fixtures
npm run test:unit
npm run dev:cloudflare
```

Apply production migrations and deploy:

```bash
npm run migrate:remote
npm run deploy:cloudflare
```

Do not deploy before the remote migration finishes successfully. Do not edit an already applied file under `drizzle/`; generate an appended migration.

## Cloudflare Access

Create a self-hosted Access application and cover `/studio.html` and `/api/admin/*`. Set an allow policy for intended operators. Store the exact Access team domain and application audience:

```bash
npx wrangler secret put CF_ACCESS_TEAM_DOMAIN
npx wrangler secret put CF_ACCESS_AUD
```

Confirm production has `ENVIRONMENT=production`. Do not add `LOCAL_AUTH_BYPASS` as a production secret or variable.

Test directly:

1. An anonymous `GET /api/public/station` returns `200`.
2. An anonymous `GET /api/admin/bootstrap` returns `401` or is intercepted by Access.
3. An authenticated Studio request returns the operator display name.
4. A copied or expired assertion is rejected.
5. The public player never receives `objectKey`, internal notes, upload identifiers, or operator assertions.

## Custom domain

Attach the Worker to a route or custom domain such as `radio.example.com`. Set Station Settings → Public URL to that origin. Put the same origin in Access and any rate-limiting rules. Add another origin to `ALLOWED_ORIGINS` only when a deliberate same-station administration origin requires it.

## Optional Cloudflare Realtime

Create a Realtime SFU application and store its values:

```bash
npx wrangler secret put REALTIME_APP_ID
npx wrangler secret put REALTIME_API_TOKEN
npm run deploy:cloudflare
```

Then run this acceptance sequence with headphones:

1. Open the Studio and public player in separate browsers.
2. Preflight the intended microphone.
3. Confirm the level meter responds and no local speaker monitoring begins.
4. Take Live.
5. Confirm two listeners receive the live track.
6. End Live and confirm fallback or the published program resumes.
7. Repeat while closing the broadcaster tab; confirm the grace deadline starts fallback and logs `LIVE_FAILURE`.

If any step fails, remove both Realtime secrets or leave them unset. Scheduled broadcasting remains operational.

## Backup

At minimum before an upgrade:

```bash
npx wrangler d1 export sideband --remote --output sideband-d1-backup.sql
```

Also:

- export configuration and metadata from the Studio;
- record the deployed Worker version;
- copy R2 objects and a manifest through an R2-compatible backup process;
- retain the current `wrangler.jsonc`, `drizzle/`, and release archive.

## Restore

1. Stop operator changes and live sessions.
2. Roll back the Worker if the failure is code-only.
3. Restore or Time Travel D1 to the matching point.
4. Restore missing R2 objects without changing their keys.
5. Deploy the application version compatible with that schema.
6. Run the public health endpoint and Studio diagnostics.
7. Audition fallback locally.
8. Start the station and verify two synchronized listeners.

Do not restore metadata that references absent media and then claim the station is healthy.

## Upgrade

1. Read the version history and migration notes.
2. Export D1, metadata, and the R2 manifest.
3. Run `npm ci` and `npm run test:unit` on the new release.
4. Inspect new Drizzle files.
5. Apply remote migrations once.
6. Deploy.
7. Verify public state, one Range request, Studio authentication, fallback, and listener synchronization.

## Rollback

A Worker rollback does not undo an already applied D1 migration. If the older Worker is compatible with the newer additive schema, roll it back from Cloudflare deployment history. If it is not, restore the matching D1 backup or Time Travel point and matching R2 objects first. Never rewrite migration history to force an older application onto a newer incompatible schema.

## Troubleshooting

| Symptom | Check | Recovery |
| --- | --- | --- |
| Studio says authentication required | Access coverage, issuer, audience, secrets | Correct Access values; never enable the production bypass |
| Listener says station offline | Published occurrence and on-air mode | Publish a playable program, then Start Station |
| Start Station says no playable program | Playlist revision and schedule occurrence | Add Ready audio to a playlist and publish a current block |
| Upload stops on one part | Browser connection, R2 binding, part limit | Resume; the current part retries without duplicating earlier parts |
| Seeking returns `416` | Requested Range and object size | Confirm the asset and browser request; validate the R2 object |
| Audio object missing | R2 key and metadata reference | Start fallback; restore object or archive the broken asset |
| Listener remains behind live | Intentional pause state | Choose Return to Live |
| WebSocket unavailable | Durable Object binding and migration | Polling continues; repair `STATION_STATE` and redeploy |
| Live controls disabled | Realtime secrets | Configure both secrets or leave live mode disabled |
| Live session fails after offer | Realtime application, token, current API | Re-run with current Cloudflare Connection API contract; scheduled audio is unaffected |
| Schedule publication conflict | Expected versus published revision | Reload, compare, and publish intentionally |
| Daylight-saving time rejected | Nonexistent or repeated station-local time | Select an explicit valid occurrence and review the UTC preview |
| Diagnostics degraded | Binding cards | Repair only the missing binding; do not expose secrets in exported diagnostics |

## Cost checks

Review current official Cloudflare Workers, D1, R2, Durable Objects, and Realtime pricing links in the README. Estimate from expected listener state requests, byte-range media delivery, stored audio, D1 queries, connected WebSockets, and optional live-audio outbound traffic. SIDEBAND makes no guaranteed cost claim.
