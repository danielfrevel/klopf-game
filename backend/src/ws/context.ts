import type { ServerWebSocket } from 'bun';
import type { WsData } from './handler.js';
import type { RoomData } from '../game/types.js';
import { getRoom, isHost } from '../game/room.js';
import { getPlayerId, getPlayerRoom } from './connections.js';
import { sendError } from './broadcast.js';

export interface SenderContext {
  playerId: string;
  room: RoomData;
}

export function senderRoom(ws: ServerWebSocket<WsData>): SenderContext | null {
  const playerId = getPlayerId(ws);
  const room = getRoom(getPlayerRoom(playerId));
  if (!room) {
    sendError(ws, 'Room not found', 'room_not_found');
    return null;
  }
  return { playerId, room };
}

export function hostRoom(ws: ServerWebSocket<WsData>, action: string): SenderContext | null {
  const ctx = senderRoom(ws);
  if (ctx && !isHost(ctx.room, ctx.playerId)) {
    sendError(ws, `Only the host can ${action}`);
    return null;
  }
  return ctx;
}
