# SIDEBAND v0.2.0 Application Programming Interface

All timestamps are Coordinated Universal Time (UTC). JavaScript Object Notation (JSON) failures use:

```json
{
  "error": {
    "code": "STABLE_CODE",
    "message": "Plain-language explanation.",
    "fieldErrors": {},
    "correlationId": "opaque-id",
    "recovery": "Safe next action."
  }
}
```

## Public routes

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/public/station` | Public station identity and settings |
| `GET` | `/api/public/state` | Authoritative public-safe on-air state and server time |
| `GET` | `/api/public/schedule` | Published near-term occurrences |
| `GET` | `/api/public/history` | Optional public recent history |
| `GET` | `/api/public/ws` | Hibernatable WebSocket state updates |
| `POST` | `/api/public/live/subscribe` | Create a receive-only live WebRTC session |
| `GET`, `HEAD` | `/media/:assetId` | Private R2 object projection with byte ranges |
| `GET` | `/api/health/public` | Version and public availability |

## Protected operator routes

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/admin/bootstrap` | Station, state, assets, playlists, schedule, operator, capabilities |
| `GET` | `/api/admin/assets` | Paginated and searchable library |
| `POST` | `/api/admin/uploads/start` | Create operator-bound multipart upload |
| `PUT` | `/api/admin/uploads/:id/parts/:number` | Upload one bounded part |
| `POST` | `/api/admin/uploads/:id/complete` | Complete R2 upload and create asset |
| `DELETE` | `/api/admin/uploads/:id` | Abort upload and cleanup |
| `GET`, `POST` | `/api/admin/playlists` | List or create playlists |
| `PATCH` | `/api/admin/playlists/:id` | Save playlist metadata draft |
| `GET`, `POST` | `/api/admin/playlists/:id/items` | Read or add draft items |
| `DELETE` | `/api/admin/playlists/:id/items/:itemId` | Archive a draft item |
| `GET`, `POST` | `/api/admin/clocks` | List or create program clocks |
| `POST` | `/api/admin/schedules/:id/validate` | Validate occurrences, conflicts, and gaps |
| `POST` | `/api/admin/schedules/:id/publish` | Publish immutable deterministic revision |
| `POST` | `/api/admin/on-air/start` | Join published current program |
| `POST` | `/api/admin/on-air/pause` | Hold station playhead |
| `POST` | `/api/admin/on-air/resume` | Resume held playhead |
| `POST` | `/api/admin/on-air/skip` | Advance current source |
| `POST` | `/api/admin/on-air/restart` | Restart current item |
| `POST` | `/api/admin/on-air/return-to-schedule` | End override at current schedule position |
| `POST` | `/api/admin/on-air/fallback` | End current source and start fallback |
| `GET`, `PATCH` | `/api/admin/carts` | Read or configure cart assignments |
| `POST` | `/api/admin/carts/fire` | Put assigned cart audio on air |
| `PATCH` | `/api/admin/station` | Save station settings |
| `GET` | `/api/admin/logs` | Filter station log |
| `GET` | `/api/admin/diagnostics` | Public-safe operator diagnostics |
| `GET` | `/api/admin/export` | Versioned configuration and metadata export |
| `POST` | `/api/admin/import/validate` | Validate without writes |
| `POST` | `/api/admin/import/commit` | Create R2 recovery checkpoint, then commit validated configuration |
| `POST` | `/api/admin/live/session` | Publish microphone offer to Realtime |
| `POST` | `/api/admin/live/heartbeat` | Refresh broadcaster grace deadline |
| `POST` | `/api/admin/live/end` | Close live source and invoke recovery |

State-changing routes require an authenticated operator, a trusted origin, valid content type, bounded body, owned identifiers, and valid revision where applicable.
