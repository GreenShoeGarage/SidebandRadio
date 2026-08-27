let requested = false;

export function wantsPlayback() {
  return requested;
}

export function requestPlayback() {
  requested = true;
}

export function cancelPlayback() {
  requested = false;
}

export function resetPlaybackIntentForTest() {
  requested = false;
}
