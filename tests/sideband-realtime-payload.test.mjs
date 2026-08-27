import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { publisherTracksRequest, sessionDescription, subscriberTracksRequest } from "../src/realtime-payload.js";
import { describeRealtimeRequest, describeSessionDescription, safeRealtimeProviderError } from "../src/realtime-diagnostics.js";
import { handleRequest } from "../src/worker.js";

const offer = { type: "offer", sdp: "v=0\r\na=group:BUNDLE 0\r\n", ignored: "browser-only" };

test("Realtime publisher uses Cloudflare SDP track auto-discovery", () => {
  assert.deepEqual(publisherTracksRequest(offer), {
    sessionDescription: { type: "offer", sdp: offer.sdp },
    autoDiscover: true,
  });
  assert.equal("tracks" in publisherTracksRequest(offer), false);
});

test("Realtime listener pulls the published remote track", () => {
  assert.deepEqual(subscriberTracksRequest(offer, {
    providerSessionId: "publisher-session",
    trackName: "published-audio",
  }), {
    sessionDescription: { type: "offer", sdp: offer.sdp },
    tracks: [{
      location: "remote",
      sessionId: "publisher-session",
      trackName: "published-audio",
    }],
  });
});

test("WebRTC descriptions are reduced to Cloudflare's JSON schema", () => {
  assert.deepEqual(sessionDescription(offer), { type: "offer", sdp: offer.sdp });
});

test("Realtime diagnostics describe SDP shape without retaining raw SDP", () => {
  const description = { type: "offer", sdp: "v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=mid:0\r\na=sendrecv\r\na=msid:stream track\r\na=rtpmap:111 opus/48000/2\r\na=ice-ufrag:test\r\na=ice-pwd:test\r\na=fingerprint:sha-256 test\r\n" };
  const summary = describeSessionDescription(description);
  assert.equal(summary.hasAudio, true);
  assert.equal(summary.audioMid, "0");
  assert.equal(summary.audioDirection, "sendrecv");
  assert.equal(summary.hasOpus, true);
  assert.equal(JSON.stringify(summary).includes(description.sdp), false);
  assert.deepEqual(describeRealtimeRequest({ sessionDescription: description, autoDiscover: true }).keys, ["autoDiscover", "sessionDescription"]);
});

test("provider errors retain only safe handshake metadata", () => {
  const response = new Response("", { status: 400, headers: { "cf-ray": "provider-ray" } });
  const provider = safeRealtimeProviderError(response, { errorCode: "decoding_error", errorDescription: "Body JSON validation error: sessionDescription", secret: "do-not-copy" }, "track.publish", publisherTracksRequest(offer));
  assert.equal(provider.endpoint, "/sessions/{sessionId}/tracks/new");
  assert.equal(provider.errorCode, "decoding_error");
  assert.equal(provider.providerRequestId, "provider-ray");
  assert.equal(JSON.stringify(provider).includes("do-not-copy"), false);
  assert.equal(JSON.stringify(provider).includes(offer.sdp), false);
});

test("Realtime session creation omits the empty JSON body and reports its failing stage", async () => {
  let providerRequest;
  const response = await handleRequest(new Request("http://localhost/api/admin/live/session", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "oai-authenticated-user-email": "operator@example.com",
      origin: "http://localhost",
    },
    body: JSON.stringify({ sessionDescription: offer, clientTrackMode: "raw-microphone" }),
  }), {
    ENVIRONMENT: "development",
    ALLOW_WORKSPACE_AUTH: "true",
    REALTIME_APP_ID: "test-app",
    REALTIME_API_TOKEN: "test-token",
    async REALTIME_FETCH(input, init) {
      providerRequest = { url: String(input), init };
      return new Response(JSON.stringify({ errorCode: "decoding_error", errorDescription: "Body JSON validation error: sessionDescription" }), {
        status: 400,
        headers: { "content-type": "application/json", "cf-ray": "provider-ray" },
      });
    },
  });
  assert.equal(providerRequest.init.body, undefined);
  assert.match(providerRequest.url, /\/sessions\/new\?correlationId=/);
  assert.equal(response.status, 502);
  const body = await response.json();
  assert.equal(body.error.details.provider.stage, "session.create");
  assert.equal(body.error.details.provider.httpStatus, 400);
});

test("browser signaling sends the original offer without gathered-candidate mutation", async () => {
  const [studio, listener] = await Promise.all([
    readFile(new URL("../public/scripts/live-studio.js", import.meta.url), "utf8"),
    readFile(new URL("../public/scripts/live-listener.js", import.meta.url), "utf8"),
  ]);
  assert.match(studio, /addTrack\(microphoneTrack, stream\)/);
  assert.match(studio, /clientTrackMode: "raw-microphone"/);
  assert.doesNotMatch(studio, /createMediaStreamDestination|destination\.stream/);
  assert.match(studio, /sessionDescription: sessionDescription\(offer\)/);
  assert.match(listener, /sessionDescription: sessionDescription\(offer\)/);
  assert.doesNotMatch(`${studio}\n${listener}`, /waitForIce|sessionDescription\(peer\.localDescription\)/);
});
