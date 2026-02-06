import type { ServerWebSocket } from 'bun';
import type { ServerMessage } from '@klopf/shared';
import type { RoomData } from '../game/types.js';
import type { WsData } from './handler.js';
import { getPlayerWs } from './connections.js';
import { toGameStateInfo } from '../game/game.js';

export function send(ws: ServerWebSocket<WsData>, msg: ServerMessage): void {
  ws.send(JSON.stringify(msg));
}

export function sendError(ws: ServerWebSocket<WsData>, error: string): void {
  send(ws, { type: 'error', error });
}

export function sendToPlayer(playerId: string, msg: ServerMessage): void {
  const ws = getPlayerWs(playerId);
  if (ws) send(ws, msg);
}

export function broadcastToRoom(room: RoomData, msg: ServerMessage): void {
  for (const player of room.game.players) {
    if (player.connected) {
      sendToPlayer(player.id, msg);
    }
  }
}

export function broadcastGameState(room: RoomData): void {
  broadcastToRoom(room, {
    type: 'game_state',
    state: toGameStateInfo(room.game),
  });
}
