import express from 'express';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { KitchenRoom } from './rooms/KitchenRoom';
import { CoopRoom } from './rooms/CoopRoom';
import { accountRoutes } from './persistence/account-routes';
import {
  accountsConfigured,
  authEnabled,
  cloudSaveEnabled,
  databaseAvailable,
  emailVerificationRequired,
  registrationEnabled,
} from './persistence/database';
import { emailDeliveryConfigured } from './persistence/email';
import { startMatchPersistence, stopMatchPersistence } from './persistence/match-persistence';
const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => {
  const origin = req.get('origin');
  if (origin && process.env.NODE_ENV !== 'production') {
    try {
      const parsed = new URL(origin);
      if (parsed.port === '5173' && parsed.hostname === req.hostname) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-CSRF-Token');
        res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
        res.vary('Origin');
        if (req.method === 'OPTIONS') return res.status(204).end();
      }
    } catch {
      // Invalid Origin is handled by the browser's same-origin policy.
    }
  }
  next();
});
app.use(express.json({ limit: '16kb' }));
app.use('/api/account', accountRoutes);
app.get('/health', async (_req, res) => {
  const accountsAvailable = accountsConfigured && (await databaseAvailable());
  res.json({
    status: 'ok',
    version: '0.4.0',
    phase: 4,
    accountsConfigured,
    accountsAvailable,
    authEnabled,
    registrationEnabled,
    cloudSaveEnabled,
    emailDeliveryConfigured,
    emailVerificationRequired,
  });
});
if (process.env.CLIENT_DIST) app.use(express.static(resolve(process.env.CLIENT_DIST)));
const server = new Server({
  transport: new WebSocketTransport({ server: createServer(app), maxPayload: 4096 }),
});
await startMatchPersistence();
server.onShutdown(stopMatchPersistence);
server.define('solo', KitchenRoom);
server.define('coop_private', CoopRoom);
server.define('coop_public', CoopRoom).filterBy(['teamSize', 'levelId']);
const port = Number(process.env.PORT || 2567);
await server.listen(port, process.env.HOST || '0.0.0.0');
console.log(`Kitchen Rush server listening on ${port}`);
