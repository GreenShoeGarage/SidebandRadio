# SIDEBAND v0.2.0 Requirement-to-File Checklist

| Major requirement | Primary implementation |
| --- | --- |
| Framework-free public listener | `public/index.html`, `public/scripts/listener.js`, `public/scripts/state-sync.js` |
| Customizable embeddable player and generator | `public/embed.html`, `public/scripts/widget-config.js`, `widget-generator.js`, `embed-player.js`, `public/styles/widget.css` |
| Responsive broadcast-bench visual language | `public/styles/shared.css`, `listener.css`, `studio.css` |
| Truthful media state and real level meters | `public/scripts/audio-engine.js`, `listener.js` |
| Protected Station Studio | `public/studio.html`, `src/auth.js`, `src/worker-core.js` |
| Audio library and browser inspection | `public/scripts/studio.js`, `resumable-uploader.js`, `src/worker-core.js` |
| Resumable multipart R2 upload | `public/scripts/resumable-uploader.js`, `src/worker-core.js` |
| Correct media Range responses | `src/media.js`, `tests/sideband-media-range.test.mjs` |
| Playlist revisions and items | `public/scripts/library-playlist.js`, `src/worker.js`, D1 schema |
| Program clocks | `public/scripts/clocks-carts.js`, `src/worker.js`, D1 schema |
| Schedule validation and immutable publication | `src/schedule-engine.js`, `src/worker-core.js`, `src/worker.js` |
| Daylight-saving handling | `src/schedule-engine.js`, `tests/sideband-schedule-engine.test.mjs` |
| Authoritative on-air state | `src/station-state.js`, `src/station-durable-object.js` |
| WebSocket state and polling fallback | `src/station-durable-object.js`, `public/scripts/state-sync.js`, `listener.js` |
| Cart assignment, audition, and on-air fire | `public/scripts/clocks-carts.js`, `src/worker.js`, D1 schema |
| Station settings and local drafts | `public/scripts/studio.js`, `local-drafts.js`, `src/worker-core.js` |
| Optional Realtime microphone | `public/scripts/live-studio.js`, `live-listener.js`, `src/worker.js` |
| Live disconnect grace and fallback | `src/station-durable-object.js`, `src/worker.js`, Wrangler cron |
| Station logs, exports, diagnostics | `public/scripts/studio.js`, `diagnostics.js`, `src/worker-core.js` |
| Versioned backup validation | `src/validation.js`, `docs/DATA_FORMAT.md`, tests |
| D1 entities and indexes | `db/schema.ts`, `drizzle/*.sql` |
| Privacy and security controls | `src/auth.js`, `validation.js`, `worker-core.js`, `docs/SECURITY.md` |
| Original test audio fixtures | `scripts/generate-audio-fixtures.js` |
| Owner setup and operations | `README.md`, `docs/DEPLOYMENT.md`, `docs/API.md` |
