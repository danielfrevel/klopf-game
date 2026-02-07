import type { ServerWebSocket } from 'bun';
import type { WsData } from '../handler.js';
import { createRoom, getRoom, removeRoom, isOwner } from '../../game/room.js';
import { createPlayer, isAlive } from '../../game/player.js';
import { addPlayer, getPlayer, getCurrentPlayerId, toGameStateInfo } from '../../game/game.js';
import { registerConnection, getPlayerId, getPlayerRoom, removePlayerRoom } from '../connections.js';
import { send, sendError, broadcastToRoom, broadcastGameState } from '../broadcast.js';
import { toPlayerInfo } from '../../game/player.js';
import { log } from '../../utils/logger.js';

function generateId(): string {
  return crypto.randomUUID();
}

export function handleCreateRoom(ws: ServerWebSocket<WsData>, playerName: string): void {
  const playerId = generateId();
  const player = createPlayer(playerId, playerName);
  const room = createRoom(playerId);

  const err = addPlayer(room.game, player);
  if (err) {
    sendError(ws, err);
    return;
  }

  registerConnection(ws, playerId, room.code);

  send(ws, { type: 'room_created', roomCode: room.code, playerId });
  send(ws, { type: 'game_state', state: toGameStateInfo(room.game) });
}

export function handleJoinRoom(ws: ServerWebSocket<WsData>, roomCode: string, playerName: string): void {
  const room = getRoom(roomCode);
  if (!room) {
    sendError(ws, 'Room not found');
    return;
  }

  const playerId = generateId();
  const player = createPlayer(playerId, playerName);

  const err = addPlayer(room.game, player);
  if (err) {
    sendError(ws, err);
    return;
  }

  registerConnection(ws, playerId, room.code);

  send(ws, { type: 'room_created', roomCode: room.code, playerId });
  broadcastToRoom(room, { type: 'player_joined', player: toPlayerInfo(player) });
  broadcastGameState(room);
}

export function handleReconnect(ws: ServerWebSocket<WsData>, roomCode: string, playerId: string): void {
  const room = getRoom(roomCode);
  if (!room) {
    sendError(ws, 'Room not found');
    return;
  }

  const player = getPlayer(room.game, playerId);
  if (!player) {
    sendError(ws, 'Player not found');
    return;
  }

  player.connected = true;
  registerConnection(ws, playerId, roomCode);
  log.room.info(`Player ${player.name} reconnected to room ${roomCode} (state: ${room.game.state})`);

  send(ws, { type: 'room_created', roomCode: room.code, playerId });
  send(ws, { type: 'game_state', state: toGameStateInfo(room.game) });

  if (room.game.state !== 'lobby') {
    send(ws, { type: 'cards_dealt', cards: player.hand });
  }

  if (room.game.state === 'klopf_pending') {
    const klopf = room.game.klopf;
    if (player.id !== klopf.initiator && isAlive(player) && !klopf.responses.has(player.id)) {
      send(ws, { type: 'klopf_response_needed', level: klopf.level });
    }
  }

  if (room.game.state === 'redeal_pending') {
    if (player.id !== room.game.redealRequester && !room.game.redealResponses.has(player.id)) {
      send(ws, { type: 'redeal_response_needed', redealCount: room.game.redealCount, maxRedeals: 3 });
    }
  }

  broadcastToRoom(room, { type: 'player_joined', player: toPlayerInfo(player) });
}

export function handleCloseRoom(ws: ServerWebSocket<WsData>): void {
  const playerId = getPlayerId(ws);
  const roomCode = getPlayerRoom(playerId);

  const room = getRoom(roomCode);
  if (!room) {
    sendError(ws, 'Room not found');
    return;
  }

  if (!isOwner(room, playerId)) {
    sendError(ws, 'Only room owner can close the room');
    return;
  }

  broadcastToRoom(room, { type: 'room_closed' });

  for (const player of room.game.players) {
    removePlayerRoom(player.id);
  }

  removeRoom(roomCode);
}
