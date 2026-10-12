import { isIP } from 'node:net';

const TUNNEL_LOOPBACK_PEERS = new Set(['::1', '127.0.0.1', '::ffff:127.0.0.1']);

export function isLoopbackTunnelPeer(remoteAddress: string | undefined) {
  return Boolean(remoteAddress && TUNNEL_LOOPBACK_PEERS.has(remoteAddress));
}

/** Cloudflare Tunnel connects locally; trust its visitor header only on that local hop. */
export function accountRateLimitIp(
  remoteAddress: string | undefined,
  cloudflareClientIp: string | undefined,
  fallbackIp: string | undefined,
) {
  const forwarded = cloudflareClientIp?.trim();
  if (isLoopbackTunnelPeer(remoteAddress) && forwarded && isIP(forwarded)) return forwarded;
  return fallbackIp || 'unknown';
}
