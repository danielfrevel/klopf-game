import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { wsHandler } from './ws/handler.js';

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 5551;

const app = new Elysia()
  .use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
  }))
  .get('/health', () => ({ status: 'ok', timestamp: new Date().toISOString() }))
  .use(wsHandler)
  .listen(PORT);

console.log(`Klopf game server running at http://localhost:${PORT}`);
console.log(`WebSocket endpoint: ws://localhost:${PORT}/ws`);

export type App = typeof app;
