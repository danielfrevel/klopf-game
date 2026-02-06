import type { ServerWebSocket } from 'bun';
import type { WsData } from '../handler.js';
import { getRoom } from '../../game/room.js';
import { initiateGameKlopf, respondToGameKlopf, blindDrei } from '../../game/game.js';
import { isAlive } from '../../game/player.js';
import { getPlayerId, getPlayerRoom } from '../connections.js';
import { send, sendError, broadcastToRoom, broadcastGameState } from '../broadcast.js';
import { getPlayerWs } from '../connections.js';

export function handleKlopf(ws: ServerWebSocket<WsData>): void {
  const playerId = getPlayerId(ws);
  const roomCode = getPlayerRoom(playerId);

  const room = getRoom(roomCode);
  if (!room) { sendError(ws, 'Room not found'); return; }

  const err = initiateGameKlopf(room.game, playerId);
  if (err) { sendError(ws, err); return; }

  broadcastToRoom(room, {
    type: 'klopf_initiated',
    playerId,
    level: room.game.klopf.level,
  });

  for (const player of room.game.players) {
    if (player.id !== playerId && isAlive(player)) {
      const pws = getPlayerWs(player.id);
      if (pws) send(pws, { type: 'klopf_response_needed', level: room.game.klopf.level });
    }
  }
}

export function handleKlopfResponse(ws: ServerWebSocket<WsData>, mitgehen: boolean): void {
  const playerId = getPlayerId(ws);
  const roomCode = getPlayerRoom(playerId);

  const room = getRoom(roomCode);
  if (!room) { sendError(ws, 'Room not found'); return; }

  const err = respondToGameKlopf(room.game, playerId, mitgehen);
  if (err) { sendError(ws, err); return; }

  if (room.game.state === 'playing') {
    broadcastToRoom(room, { type: 'klopf_resolved', level: room.game.klopf.level });
  }

  broadcastGameState(room);
}

export function handleBlindDrei(ws: ServerWebSocket<WsData>): void {
  const playerId = getPlayerId(ws);
  const roomCode = getPlayerRoom(playerId);

  const room = getRoom(roomCode);
  if (!room) { sendError(ws, 'Room not found'); return; }

  const err = blindDrei(room.game, playerId);
  if (err) { sendError(ws, err); return; }

  broadcastToRoom(room, { type: 'klopf_initiated', playerId, level: 3 });

  for (const player of room.game.players) {
    if (player.id !== playerId && isAlive(player)) {
      const pws = getPlayerWs(player.id);
      if (pws) send(pws, { type: 'klopf_response_needed', level: 3 });
    }
  }
}
