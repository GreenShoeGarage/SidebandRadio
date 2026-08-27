# SIDEBAND v0.4.2 Data and Backup Format

## Time and identifiers

- Persistent timestamps are ISO 8601 Coordinated Universal Time (UTC) text.
- The interface renders times in the station’s configured Internet Assigned Numbers Authority (IANA) time zone.
- Database identifiers are stable opaque strings. A filename is never an identifier.
- Every station-owned record includes `station_id` directly or through a required parent.
- Schema-bearing entities include `schema_version` where long-lived interchange requires it.

## Configuration backup envelope

```json
{
  "format": "sideband-backup",
  "version": "1.0",
  "applicationVersion": "0.4.2",
  "kind": "configuration-and-metadata",
  "includesMedia": false,
  "exportedAtUtc": "2026-08-26T00:00:00.000Z",
  "station": {},
  "playlists": [],
  "schedule": [],
  "assets": []
}
```

`version` governs the interchange format. SIDEBAND accepts compatible `1.x` input and rejects unknown major versions. `applicationVersion` identifies the code that produced the export. `includesMedia` must remain false for metadata exports.

## Import protocol

1. Parse input as JavaScript Object Notation (JSON) with a bounded request size.
2. Require `format: sideband-backup`.
3. Reject an unsupported major `version`.
4. Validate station fields, identifiers, references, timestamps, and item limits.
5. Produce a dry-run summary without writes.
6. Create a recovery checkpoint containing the current configuration and metadata.
7. Require explicit operator confirmation to commit.
8. Apply structured records in a transaction or bounded D1 batches.
9. Record the operator, correlation identifier, and summary in the audit log.

The current Studio configuration-import flow validates into a local draft, then uses Save Settings as the explicit commit. It does not silently change the published schedule or on-air state.

## Media backup

R2 bytes are separate from configuration metadata. A complete disaster-recovery set contains:

- the JSON metadata export;
- an R2 object manifest containing asset identifier, object key, size, media type, checksum when present, and last-modified time;
- the matching R2 objects;
- the D1 database export or Time Travel point;
- the SIDEBAND release and Wrangler configuration that produced the data.

Never place Access assertions, Realtime tokens, Worker secrets, or private listener data in an export.

## Local draft export

```json
{
  "format": "sideband-local-drafts",
  "version": "1.0",
  "exportedAtUtc": "2026-08-26T00:00:00.000Z",
  "drafts": []
}
```

Local drafts are device-local editing aids, not authoritative server records. Importing one never means a schedule was published.
