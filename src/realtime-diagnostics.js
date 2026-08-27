const clean = (value, max = 500) => typeof value === "string" ? value.slice(0, max) : undefined;

export function describeSessionDescription(value) {
  const type = typeof value?.type === "string" ? value.type : "";
  const sdp = typeof value?.sdp === "string" ? value.sdp : "";
  const lines = sdp.split(/\r?\n/);
  const audioStart = lines.findIndex(line => line.startsWith("m=audio "));
  const audioEnd = audioStart < 0 ? -1 : lines.findIndex((line, index) => index > audioStart && line.startsWith("m="));
  const audioLines = audioStart < 0 ? [] : lines.slice(audioStart, audioEnd < 0 ? undefined : audioEnd);
  const mid = audioLines.find(line => line.startsWith("a=mid:"));
  const direction = audioLines.find(line => /^a=(sendrecv|sendonly|recvonly|inactive)$/.test(line));

  return {
    type,
    sdpBytes: new TextEncoder().encode(sdp).byteLength,
    lineEnding: sdp.includes("\r\n") ? "CRLF" : sdp.includes("\n") ? "LF" : "none",
    mediaSections: lines.filter(line => line.startsWith("m=")).length,
    hasAudio: audioStart >= 0,
    audioMid: mid?.slice(6, 40),
    audioDirection: direction?.slice(2),
    hasAudioMsid: audioLines.some(line => line.startsWith("a=msid:")),
    hasAudioSsrc: audioLines.some(line => line.startsWith("a=ssrc:")),
    hasOpus: audioLines.some(line => /^a=rtpmap:\d+ opus\/48000\/2$/i.test(line)),
    hasIceCredentials: lines.some(line => line.startsWith("a=ice-ufrag:")) && lines.some(line => line.startsWith("a=ice-pwd:")),
    hasFingerprint: lines.some(line => line.startsWith("a=fingerprint:")),
    candidateCount: lines.filter(line => line.startsWith("a=candidate:")).length,
  };
}

export function describeRealtimeRequest(body) {
  const value = body && typeof body === "object" ? body : {};
  return {
    keys: Object.keys(value).sort(),
    autoDiscover: value.autoDiscover === true,
    trackCount: Array.isArray(value.tracks) ? value.tracks.length : 0,
    sessionDescription: value.sessionDescription ? describeSessionDescription(value.sessionDescription) : undefined,
  };
}

export function safeRealtimeProviderError(response, payload, stage, body) {
  const errors = Array.isArray(payload?.errors) ? payload.errors.slice(0, 5).map(item => ({
    code: clean(item?.code, 100),
    message: clean(item?.message, 500),
  })) : undefined;
  return {
    stage,
    endpoint: stage === "session.create" ? "/sessions/new" : stage === "track.publish" ? "/sessions/{sessionId}/tracks/new" : stage,
    httpStatus: response.status,
    errorCode: clean(payload?.errorCode || payload?.code, 100),
    errorDescription: clean(payload?.errorDescription || payload?.message, 500),
    errors,
    providerRequestId: clean(response.headers.get("cf-ray") || response.headers.get("x-request-id"), 160),
    request: describeRealtimeRequest(body),
  };
}
