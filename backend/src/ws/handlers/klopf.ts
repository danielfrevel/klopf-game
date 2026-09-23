import type { ServerWebSocket } from 'bun';
import type { WsData } from '../handler.js';
import { getRoom } from '../../game/room.js';
import { initiateGameKlopf, respondToGameKlopf, blindDrei } from '../../game/game.js';
import { getPlayerId, getPlayerRoom } from '../connections.js';
import { sendError, broadcastToRoom, broadcastGameState } from '../broadcast.js';
import { finishAction, notifyKlopf } from './game.js';

export function handleKlopf(ws: ServerWebSocket<WsData>): void {
  const playerId = getPlayerId(ws);
  const room = getRoom(getPlayerRoom(playerId));
  if (!room) { sendError(ws, 'Room not found'); return; }

  const err = initiateGameKlopf(room.game, playerId);
  if (err) { sendError(ws, err); return; }

  notifyKlopf(room);
  broadcastGameState(room);
}

export function handleKlopfResponse(ws: ServerWebSocket<WsData>, mitgehen: boolean): void {
  const playerId = getPlayerId(ws);
  const room = getRoom(getPlayerRoom(playerId));
  if (!room) { sendError(ws, 'Room not found'); return; }

  const { level } = room.game.klopf;
  const round = room.game.roundNumber;
  const err = respondToGameKlopf(room.game, playerId, mitgehen);
  if (err) { sendError(ws, err); return; }

  if (room.game.state !== 'klopf_pending' || room.game.roundNumber !== round) {
    broadcastToRoom(room, { type: 'klopf_resolved', level });
  }
  finishAction(room);
}

export function handleBlindDrei(ws: ServerWebSocket<WsData>): void {
  const playerId = getPlayerId(ws);
  const room = getRoom(getPlayerRoom(playerId));
  if (!room) { sendError(ws, 'Room not found'); return; }

  const err = blindDrei(room.game, playerId);
  if (err) { sendError(ws, err); return; }

  notifyKlopf(room);
  broadcastGameState(room);
}
