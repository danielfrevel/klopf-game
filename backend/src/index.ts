import { Elysia, t } from 'elysia';
import { cors } from '@elysiajs/cors';
import { wsHandler } from './ws/handler.js';

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 8080;

const app = new Elysia()
  // CORS for API endpoints
  .use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
  }))
  // Health check endpoint
  .get('/health', () => ({ status: 'ok', timestamp: new Date().toISOString() }))
  // Frontend logging endpoint
  .post('/api/logs', ({ body }) => {
    const logs = body as Array<{
      timestamp: string;
      level: string;
      category: string;
      message: string;
      data?: unknown;
    }>;

    for (const entry of logs) {
      const time = entry.timestamp.substring(11, 23);
      const level = entry.level.toUpperCase().padEnd(5);
      const dataStr = entry.data !== undefined ? ` ${JSON.stringify(entry.data)}` : '';
      console.log(`[FRONTEND] [${time}] [${level}] [${entry.category}] ${entry.message}${dataStr}`);
    }

    return { received: logs.length };
  }, {
    body: t.Array(t.Object({
      timestamp: t.String(),
      level: t.String(),
      category: t.String(),
      message: t.String(),
      data: t.Optional(t.Unknown()),
    }))
  })
  // WebSocket handler
  .use(wsHandler)
  .listen(PORT);

console.log(`Klopf game server running at http://localhost:${PORT}`);
console.log(`WebSocket endpoint: ws://localhost:${PORT}/ws`);

export type App = typeof app;
