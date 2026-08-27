export function sessionDescription(value) {
  return {
    type: typeof value?.type === "string" ? value.type : "",
    sdp: typeof value?.sdp === "string" ? value.sdp : "",
  };
}

export function publisherTracksRequest(value) {
  return {
    sessionDescription: sessionDescription(value),
    autoDiscover: true,
  };
}

export function subscriberTracksRequest(value, source) {
  return {
    sessionDescription: sessionDescription(value),
    tracks: [{
      location: "remote",
      sessionId: source.providerSessionId,
      trackName: source.trackName,
    }],
  };
}
