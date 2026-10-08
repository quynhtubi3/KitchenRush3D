import express from 'express';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { KitchenRoom } from './rooms/KitchenRoom';
import { CoopRoom } from './rooms/CoopRoom';
const app = express();
app.disable('x-powered-by');
app.get('/health', (_req, res) => res.json({ status: 'ok', version: '0.3.0', phase: 3 }));
if (process.env.CLIENT_DIST) app.use(express.static(resolve(process.env.CLIENT_DIST)));
const server = new Server({
  transport: new WebSocketTransport({ server: createServer(app), maxPayload: 4096 }),
});
server.define('solo', KitchenRoom);
server.define('coop_private', CoopRoom);
server.define('coop_public', CoopRoom).filterBy(['teamSize', 'levelId']);
const port = Number(process.env.PORT || 2567);
await server.listen(port, process.env.HOST || '0.0.0.0');
console.log(`Kitchen Rush server listening on ${port}`);
