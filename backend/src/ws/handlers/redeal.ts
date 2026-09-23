import type { ServerWebSocket } from 'bun';
import type { WsData } from '../handler.js';
import { getRoom } from '../../game/room.js';
import { requestRedeal, respondToRedeal, getRedealInfo, activePlayers } from '../../game/game.js';
import { getPlayerId, getPlayerRoom } from '../connections.js';
import { sendError, sendToPlayer, broadcastToRoom, broadcastGameState } from '../broadcast.js';
import { sendCards } from './game.js';

export function handleRequestRedeal(ws: ServerWebSocket<WsData>): void {
  const playerId = getPlayerId(ws);
  const roomCode = getPlayerRoom(playerId);

  const room = getRoom(roomCode);
  if (!room) { sendError(ws, 'Room not found'); return; }

  const err = requestRedeal(room.game, playerId);
  if (err) { sendError(ws, err); return; }

  const { requester, count, maxRedeals } = getRedealInfo(room.game);

  broadcastToRoom(room, { type: 'redeal_requested', playerId: requester });

  for (const p of activePlayers(room.game)) {
    if (p.id !== playerId) sendToPlayer(p.id, { type: 'redeal_response_needed', redealCount: count, maxRedeals });
  }
}

export function handleRedealResponse(ws: ServerWebSocket<WsData>, agree: boolean): void {
  const playerId = getPlayerId(ws);
  const roomCode = getPlayerRoom(playerId);

  const room = getRoom(roomCode);
  if (!room) { sendError(ws, 'Room not found'); return; }

  const err = respondToRedeal(room.game, playerId, agree);
  if (err) { sendError(ws, err); return; }

  if (agree) {
    const { count, maxRedeals } = getRedealInfo(room.game);
    broadcastToRoom(room, { type: 'redeal_performed', redealCount: count, maxRedeals });
    sendCards(room);
  } else {
    broadcastToRoom(room, { type: 'redeal_declined' });
  }

  broadcastGameState(room);
}
