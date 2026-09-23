import type { ServerWebSocket } from 'bun';
import type { WsData } from '../handler.js';
import { initiateGameKlopf, respondToGameKlopf, blindDrei } from '../../game/game.js';
import { sendError, broadcastToRoom, commitRoom } from '../broadcast.js';
import { finishAction, notifyKlopf } from './game.js';
import { senderRoom } from '../context.js';

export function handleKlopf(ws: ServerWebSocket<WsData>): void {
  const ctx = senderRoom(ws);
  if (!ctx) return;
  const { playerId, room } = ctx;

  const err = initiateGameKlopf(room.game, playerId);
  if (err) { sendError(ws, err); return; }

  notifyKlopf(room);
  commitRoom(room);
}

export function handleKlopfResponse(ws: ServerWebSocket<WsData>, mitgehen: boolean): void {
  const ctx = senderRoom(ws);
  if (!ctx) return;
  const { playerId, room } = ctx;

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
  const ctx = senderRoom(ws);
  if (!ctx) return;
  const { playerId, room } = ctx;

  const err = blindDrei(room.game, playerId);
  if (err) { sendError(ws, err); return; }

  notifyKlopf(room);
  commitRoom(room);
}
