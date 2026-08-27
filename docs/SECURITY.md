# SIDEBAND v0.2.0 Security and Privacy

## Embeddable listener boundary

Only `/embed.html` may be framed by third-party sites. Other pages retain same-origin framing protection. Widget query parameters are allowlisted and normalized in the browser: layouts and themes use fixed enumerations, the accent must be a six-digit hexadecimal color, and visibility controls are booleans. They cannot select private storage objects, operator routes, scripts, or arbitrary styles.

The embedded player receives the same public-safe station identity and on-air state as the full listener. It never receives access tokens, private notes, multipart upload identifiers, Cloudflare R2 object keys, or protected Station Studio data. Audio still requires a visitor gesture and is served through the public media projection rather than exposing the private bucket.

## Trust boundaries

- Public listener routes are anonymous and return public-safe metadata only.
- `/studio.html` and every `/api/admin/*` route require an authenticated operator in production.
- R2 is private; media leaves only through `/media/:assetId`.
- Cloudflare Realtime credentials remain in Worker secrets.
- D1 internal notes, object keys, upload identifiers, and audit details are never included in public route projections.

## Cloudflare Access validation

Production authorization reads `Cf-Access-Jwt-Assertion`, downloads the account’s public signing keys, and validates:

- JSON Web Token (JWT) structure;
- supported signing algorithm;
- matching signing-key identifier;
- cryptographic signature;
- exact issuer;
- configured application audience;
- expiration and not-before time.

The local bypass requires both `ENVIRONMENT != production` and `LOCAL_AUTH_BYPASS=true`. A production deployment cannot enable it accidentally.

## Mutation defenses

- Operator identity is checked server-side for every private read and mutation.
- Same-origin checks protect cookie-backed browser mutations from Cross-Site Request Forgery (CSRF).
- Cross-Origin Resource Sharing (CORS) does not use a credentialed wildcard.
- JavaScript Object Notation (JSON) endpoints require the correct media type and bounded bodies.
- Text length, file size, media type, part count, part size, time zone, identifier ownership, and revision are validated.
- Disruptive Studio controls identify their exact effect and require confirmation.
- Schedule publication uses optimistic concurrency.
- Transition revisions and unique transition identifiers limit duplicate on-air actions.

## Browser policy

The Worker applies a restrictive Content Security Policy (CSP), `nosniff`, same-origin referrer policy, and a limited Permissions Policy. Scripts, styles, and fonts are local. The compact player permits framing; other pages use same-origin frame ancestry.

## Upload security

Each multipart upload is bound to the authenticated operator, station, private R2 key, expected type, expected size, and expiry. Parts are bounded. Cancel aborts the multipart upload. Permanent asset deletion should first enumerate playlist, clock, schedule, cart, and on-air references; v0.2.0 defaults to non-destructive archive.

## Logging rules

Structured log and audit records may contain event category, station identifier, operator identifier, public asset identifier, timestamp, correlation identifier, and safe recovery metadata. They must not contain:

- Access assertions or cookies;
- Realtime tokens;
- authorization headers;
- R2 credentials;
- raw request bodies;
- private listener data;
- listener Internet Protocol addresses;
- exact location or advertising identifiers;
- raw user-agent strings.

## Operational recommendations

1. Restrict the Studio with Cloudflare Access and a named operator policy.
2. Add Cloudflare rate-limiting rules for public state, live subscription, and media abuse patterns without blocking normal Range requests.
3. Keep R2 public access disabled.
4. Rotate Access and Realtime secrets after suspected exposure.
5. Review audit and authentication logs.
6. Test fallback before every scheduled live event.
7. Retain D1 and R2 recovery material outside the production account.
8. Review browser and Cloudflare Realtime changes before high-visibility broadcasts.

## Rights notice

SIDEBAND provides transport and station operations. It grants no license to music, performances, recordings, trademarks, publicity rights, or other protected material. The operator must obtain and retain all necessary rights, licenses, releases, and authorizations.
