export function serverEndpoint(
  origin: string,
  options: { dev: boolean; sameOrigin?: string; serverUrl?: string },
): string {
  if (options.sameOrigin === 'true') return origin;
  if (options.serverUrl) return options.serverUrl;
  if (!options.dev) return origin;
  const url = new URL(origin);
  url.port = '2567';
  return url.origin;
}
