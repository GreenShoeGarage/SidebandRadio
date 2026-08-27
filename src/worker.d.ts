export function handleRequest(
  request: Request,
  env?: Record<string, unknown>,
  ctx?: { waitUntil?: (promise: Promise<unknown>) => void },
): Promise<Response>;
