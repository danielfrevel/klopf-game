import type { ServerWebSocket } from 'bun';
import type { WsData } from '../handler.js';
import { getRoom } from '../../game/room.js';
import { requestRedeal, respondToRedeal, getRedealInfo, getPlayer } from '../../game/game.js';
import { isAlive } from '../../game/player.js';
import { getPlayerId, getPlayerRoom, getPlayerWs } from '../connections.js';
import { send, sendError, broadcastToRoom, broadcastGameState } from '../broadcast.js';

export function handleRequestRedeal(ws: ServerWebSocket<WsData>): void {
  const playerId = getPlayerId(ws);
  const roomCode = getPlayerRoom(playerId);

  const room = getRoom(roomCode);
  if (!room) { sendError(ws, 'Room not found'); return; }

  const err = requestRedeal(room.game, playerId);
  if (err) { sendError(ws, err); return; }

  const { requester, count, maxRedeals } = getRedealInfo(room.game);

  broadcastToRoom(room, { type: 'redeal_requested', playerId: requester });

  for (const p of room.game.players) {
    if (p.id !== playerId && isAlive(p)) {
      const pws = getPlayerWs(p.id);
      if (pws) send(pws, { type: 'redeal_response_needed', redealCount: count, maxRedeals });
    }
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

    for (const player of room.game.players) {
      if (isAlive(player)) {
        const pws = getPlayerWs(player.id);
        if (pws) send(pws, { type: 'cards_dealt', cards: player.hand });
      }
    }

    if (room.game.klopf.active) {
      broadcastToRoom(room, {
        type: 'klopf_initiated',
        playerId: room.game.klopf.initiator,
        level: room.game.klopf.level,
      });
    }
  } else {
    broadcastToRoom(room, { type: 'redeal_declined' });
  }

  broadcastGameState(room);
}
