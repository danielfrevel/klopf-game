import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { wsHandler } from './ws/handler.js';
import { attachRoomCallbacks } from './ws/handlers/game.js';
import { disposeRoom, getRoom, restoreRoom } from './game/room.js';
import { resumeTimers } from './game/game.js';
import { loadRooms, purgeOlderThan } from './persistence/db.js';
import { log } from './utils/logger.js';

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 5551;
const ROOM_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const PURGE_INTERVAL_MS = 60 * 60 * 1000;

function purgeExpiredRooms(): void {
  for (const code of purgeOlderThan(ROOM_MAX_AGE_MS)) {
    const room = getRoom(code);
    if (room) disposeRoom(room);
    log.room.info(`Purged room ${code}`);
  }
}

purgeExpiredRooms();
const restored = loadRooms();
for (const room of restored) {
  restoreRoom(room);
  attachRoomCallbacks(room);
  resumeTimers(room.game);
}
log.room.info(`Restored ${restored.length} rooms`);
setInterval(purgeExpiredRooms, PURGE_INTERVAL_MS);

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
