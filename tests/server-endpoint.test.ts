import { describe, expect, it } from 'vitest';
import { serverEndpoint } from '../apps/client/src/server-endpoint';

describe('game server endpoint', () => {
  it('keeps HTTPS tunnel matchmaking and WebSocket on the public origin', () => {
    expect(serverEndpoint('https://kitchen.example.com', { dev: false })).toBe(
      'https://kitchen.example.com',
    );
  });
  it('keeps the production port for a locally served build', () => {
    expect(serverEndpoint('http://127.0.0.1:2568', { dev: false })).toBe('http://127.0.0.1:2568');
  });
  it('uses the LAN hostname with the development server port', () => {
    expect(serverEndpoint('http://192.168.1.20:5173', { dev: true })).toBe(
      'http://192.168.1.20:2567',
    );
  });
  it('honors an explicit API and the same-origin override', () => {
    const options = { dev: false, serverUrl: 'https://api.example.com' };
    expect(serverEndpoint('https://game.example.com', options)).toBe(options.serverUrl);
    expect(serverEndpoint('https://game.example.com', { ...options, sameOrigin: 'true' })).toBe(
      'https://game.example.com',
    );
  });
});
