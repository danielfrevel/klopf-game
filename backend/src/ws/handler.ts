import { Elysia } from 'elysia';
import type { ServerWebSocket } from 'bun';
import type { ClientMessage } from '@klopf/shared';
import { ClientMessageSchema } from '@klopf/shared';
import { nextConnId, removeConnection } from './connections.js';
import { sendError, broadcastToRoom } from './broadcast.js';
import { getRoom } from '../game/room.js';
import { handleCreateRoom, handleJoinRoom, handleReconnect, handleCloseRoom } from './handlers/room.js';
import { handleStartGame, handlePlayCard, handleSetStakes } from './handlers/game.js';
import { handleKlopf, handleKlopfResponse, handleBlindDrei } from './handlers/klopf.js';
import { handleRequestRedeal, handleRedealResponse } from './handlers/redeal.js';
import { log } from '../utils/logger.js';

export interface WsData {
  connId: number;
  playerId: string;
  roomCode: string;
}

function handleMessage(ws: ServerWebSocket<WsData>, message: ClientMessage): void {
  log.ws.debug(`Message: ${message.type}`, message);
  switch (message.type) {
    case 'create_room':    handleCreateRoom(ws, message.playerName); break;
    case 'join_room':      handleJoinRoom(ws, message.roomCode, message.playerName); break;
    case 'reconnect':      handleReconnect(ws, message.roomCode, message.playerId); break;
    case 'start_game':     handleStartGame(ws); break;
    case 'close_room':     handleCloseRoom(ws); break;
    case 'play_card':      handlePlayCard(ws, message.cardId); break;
    case 'klopf':          handleKlopf(ws); break;
    case 'klopf_response': handleKlopfResponse(ws, message.mitgehen); break;
    case 'blind_drei':     handleBlindDrei(ws); break;
    case 'set_stakes':     handleSetStakes(ws, message.stakes); break;
    case 'request_redeal': handleRequestRedeal(ws); break;
    case 'redeal_response': handleRedealResponse(ws, message.agree); break;
    default: sendError(ws, 'Unknown message type');
  }
}

function handleDisconnect(ws: ServerWebSocket<WsData>): void {
  const data = removeConnection(ws);
  if (!data) return;

  const room = getRoom(data.roomCode);
  if (!room) return;

  const player = room.game.players.find((p) => p.id === data.playerId);
  if (player) {
    player.connected = false;
    broadcastToRoom(room, { type: 'player_left', playerId: data.playerId });
  }
}

export const wsHandler = new Elysia().ws('/ws', {
  body: ClientMessageSchema,

  open(ws) {
    const connId = nextConnId();
    (ws.data as unknown as WsData).connId = connId;
    (ws.data as unknown as WsData).playerId = '';
    (ws.data as unknown as WsData).roomCode = '';
    console.log(`WebSocket connection opened (connId: ${connId})`);
  },

  message(ws, message) {
    handleMessage(ws as unknown as ServerWebSocket<WsData>, message);
  },

  close(ws) {
    handleDisconnect(ws as unknown as ServerWebSocket<WsData>);
  },
});
