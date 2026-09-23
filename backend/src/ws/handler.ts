import { Elysia } from 'elysia';
import type { ServerWebSocket } from 'bun';
import type { ClientMessage } from '@klopf/shared';
import { ClientMessageSchema } from '@klopf/shared';
import { nextConnId } from './connections.js';
import { sendError } from './broadcast.js';
import { handleCreateRoom, handleJoinRoom, handleReconnect, handleCloseRoom, handleDisconnect } from './handlers/room.js';
import { handleStartGame, handlePlayCard, handleSetStakes, handleRevealCards, handleRestartGame } from './handlers/game.js';
import { handleKlopf, handleKlopfResponse, handleBlindDrei } from './handlers/klopf.js';
import { handleRequestRedeal, handleRedealResponse } from './handlers/redeal.js';
import { getRoom } from '../game/room.js';
import { saveRoom } from '../persistence/db.js';
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
    case 'reconnect':      handleReconnect(ws, message.roomCode, message.playerId, message.token); break;
    case 'start_game':     handleStartGame(ws); break;
    case 'close_room':     handleCloseRoom(ws); break;
    case 'restart_game':   handleRestartGame(ws); break;
    case 'play_card':      handlePlayCard(ws, message.cardId); break;
    case 'klopf':          handleKlopf(ws); break;
    case 'klopf_response': handleKlopfResponse(ws, message.mitgehen); break;
    case 'blind_drei':     handleBlindDrei(ws); break;
    case 'reveal_cards':   handleRevealCards(ws); break;
    case 'set_stakes':     handleSetStakes(ws, message.stakes); break;
    case 'request_redeal': handleRequestRedeal(ws); break;
    case 'redeal_response': handleRedealResponse(ws, message.agree); break;
    default: sendError(ws, 'Unknown message type');
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
    const socket = ws as unknown as ServerWebSocket<WsData>;
    handleMessage(socket, message);
    const room = getRoom(socket.data.roomCode);
    if (room) saveRoom(room);
  },

  close(ws) {
    handleDisconnect(ws as unknown as ServerWebSocket<WsData>);
  },
});
