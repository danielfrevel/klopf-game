import type { ServerWebSocket } from 'bun';
import { MAX_REDEALS } from '@klopf/shared';
import type { WsData } from '../handler.js';
import type { PlayerState, RoomData } from '../../game/types.js';
import { createRoom, getRoom, removeRoom, isHost } from '../../game/room.js';
import { createPlayer, isActive, toPlayerInfo } from '../../game/player.js';
import { addPlayer, getPlayer, removePlayer, toGameStateInfo, cancelAllTimers, GameErrors } from '../../game/game.js';
import { registerConnection, getPlayerId, getPlayerRoom, removeConnection, removePlayerRoom } from '../connections.js';
import { send, sendError, broadcastToRoom, broadcastGameState } from '../broadcast.js';
import { log } from '../../utils/logger.js';

const MAX_NAME_LENGTH = 20;

function joinAs(ws: ServerWebSocket<WsData>, room: RoomData, rawName: string): PlayerState | null {
  const name = rawName.trim();
  if (name.length === 0 || name.length > MAX_NAME_LENGTH) {
    sendError(ws, `Name must be 1 to ${MAX_NAME_LENGTH} characters`);
    return null;
  }

  const player = createPlayer(crypto.randomUUID(), name);
  const err = addPlayer(room.game, player);
  if (err) {
    sendError(ws, err, err === GameErrors.NAME_TAKEN ? 'name_taken' : undefined);
    return null;
  }

  registerConnection(ws, player.id, room.code);
  send(ws, { type: 'room_created', roomCode: room.code, playerId: player.id, token: player.token });
  return player;
}

export function handleCreateRoom(ws: ServerWebSocket<WsData>, playerName: string): void {
  const room = createRoom();
  if (!joinAs(ws, room, playerName)) {
    removeRoom(room.code);
    return;
  }
  send(ws, { type: 'game_state', state: toGameStateInfo(room.game) });
}

export function handleJoinRoom(ws: ServerWebSocket<WsData>, roomCode: string, playerName: string): void {
  const room = getRoom(roomCode);
  if (!room) {
    sendError(ws, 'Room not found', 'room_not_found');
    return;
  }

  const player = joinAs(ws, room, playerName);
  if (!player) return;

  broadcastToRoom(room, { type: 'player_joined', player: toPlayerInfo(player) });
  broadcastGameState(room);
}

export function handleReconnect(ws: ServerWebSocket<WsData>, roomCode: string, playerId: string, token: string): void {
  const room = getRoom(roomCode);
  if (!room) {
    sendError(ws, 'Room not found', 'room_not_found');
    return;
  }

  const player = getPlayer(room.game, playerId);
  if (!player || player.token !== token) {
    sendError(ws, 'Invalid session', 'invalid_session');
    return;
  }

  clearTimeout(room.lobbyLeaveTimers.get(playerId));
  room.lobbyLeaveTimers.delete(playerId);
  player.connected = true;
  registerConnection(ws, playerId, room.code);
  log.room.info(`Player ${player.name} reconnected to room ${room.code} (state: ${room.game.state})`);

  send(ws, { type: 'room_created', roomCode: room.code, playerId, token });
  send(ws, { type: 'game_state', state: toGameStateInfo(room.game) });

  if (room.game.state !== 'lobby') {
    send(ws, { type: 'cards_dealt', cards: player.hand });
  }

  if (room.game.state === 'klopf_pending') {
    const klopf = room.game.klopf;
    if (player.id !== klopf.initiator && isActive(player) && !klopf.responses.has(player.id)) {
      send(ws, { type: 'klopf_response_needed', level: klopf.level });
    }
  }

  if (room.game.state === 'redeal_pending') {
    if (player.id !== room.game.redealRequester && !room.game.redealResponses.has(player.id)) {
      send(ws, { type: 'redeal_response_needed', redealCount: room.game.redealCount, maxRedeals: MAX_REDEALS });
    }
  }

  broadcastToRoom(room, { type: 'player_joined', player: toPlayerInfo(player) });
  broadcastGameState(room);
}

export function handleDisconnect(ws: ServerWebSocket<WsData>): void {
  const data = removeConnection(ws);
  if (!data) return;

  const room = getRoom(data.roomCode);
  const player = room && getPlayer(room.game, data.playerId);
  if (!room || !player) return;

  player.connected = false;
  broadcastToRoom(room, { type: 'player_left', playerId: player.id });
  broadcastGameState(room);

  if (room.game.state === 'lobby') {
    room.lobbyLeaveTimers.set(player.id, setTimeout(() => leaveLobby(room, player.id), room.game.timeouts.lobbyLeaveMs));
  }
}

function leaveLobby(room: RoomData, playerId: string): void {
  room.lobbyLeaveTimers.delete(playerId);
  const player = getPlayer(room.game, playerId);
  if (!player || player.connected || room.game.state !== 'lobby') return;

  removePlayer(room.game, playerId);
  removePlayerRoom(playerId);
  log.room.info(`Player ${player.name} left room ${room.code} after lobby grace period`);

  if (room.game.players.length === 0) {
    removeRoom(room.code);
    return;
  }
  broadcastToRoom(room, { type: 'player_left', playerId });
  broadcastGameState(room);
}

export function handleCloseRoom(ws: ServerWebSocket<WsData>): void {
  const playerId = getPlayerId(ws);
  const roomCode = getPlayerRoom(playerId);

  const room = getRoom(roomCode);
  if (!room) {
    sendError(ws, 'Room not found', 'room_not_found');
    return;
  }

  if (!isHost(room, playerId)) {
    sendError(ws, 'Only the host can close the room');
    return;
  }

  cancelAllTimers(room.game);
  for (const timer of room.lobbyLeaveTimers.values()) clearTimeout(timer);
  broadcastToRoom(room, { type: 'room_closed' });

  for (const player of room.game.players) {
    removePlayerRoom(player.id);
  }

  removeRoom(roomCode);
}
