import type { ServerWebSocket } from 'bun';
import { MAX_REDEALS } from '@klopf/shared';
import type { WsData } from '../handler.js';
import type { PlayerState, RoomData } from '../../game/types.js';
import { createRoom, getRoom, removeRoom, disposeRoom } from '../../game/room.js';
import { createPlayer, isActive, toPlayerInfo } from '../../game/player.js';
import { addPlayer, getPlayer, removePlayer, GameErrors } from '../../game/game.js';
import { registerConnection, removeConnection, removePlayerRoom, type ConnectionInfo } from '../connections.js';
import { send, sendError, broadcastToRoom, commitRoom } from '../broadcast.js';
import { deleteRoom } from '../../persistence/db.js';
import { hostRoom } from '../context.js';
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

  goOffline(registerConnection(ws, player.id, room.code));
  send(ws, { type: 'room_created', roomCode: room.code, playerId: player.id, token: player.token });
  return player;
}

export function handleCreateRoom(ws: ServerWebSocket<WsData>, playerName: string): void {
  const room = createRoom();
  if (!joinAs(ws, room, playerName)) {
    removeRoom(room.code);
    return;
  }
  commitRoom(room);
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
  commitRoom(room);
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
  goOffline(registerConnection(ws, playerId, room.code));
  log.room.info(`Player ${player.name} reconnected to room ${room.code} (state: ${room.game.state})`);

  send(ws, { type: 'room_created', roomCode: room.code, playerId, token });

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
    if (player.id !== room.game.redealRequester && isActive(player)) {
      send(ws, { type: 'redeal_response_needed', redealCount: room.game.redealCount, maxRedeals: MAX_REDEALS });
    }
  }

  broadcastToRoom(room, { type: 'player_joined', player: toPlayerInfo(player) });
  commitRoom(room);
}

export function handleDisconnect(ws: ServerWebSocket<WsData>): void {
  goOffline(removeConnection(ws));
}

export function handleLeaveRoom(ws: ServerWebSocket<WsData>): void {
  goOffline(removeConnection(ws));
  ws.data.playerId = '';
  ws.data.roomCode = '';
}

function goOffline(data: ConnectionInfo | null): void {
  if (!data) return;
  const room = getRoom(data.roomCode);
  const player = room && getPlayer(room.game, data.playerId);
  if (!room || !player) return;

  player.connected = false;
  broadcastToRoom(room, { type: 'player_left', playerId: player.id });
  commitRoom(room);
  if (room.game.state === 'lobby') scheduleLobbyLeave(room, player.id);
}

export function resumeLobbyLeave(room: RoomData): void {
  if (room.game.state !== 'lobby') return;
  for (const player of room.game.players) {
    if (!player.connected) scheduleLobbyLeave(room, player.id);
  }
}

function scheduleLobbyLeave(room: RoomData, playerId: string): void {
  clearTimeout(room.lobbyLeaveTimers.get(playerId));
  room.lobbyLeaveTimers.set(playerId, setTimeout(() => leaveLobby(room, playerId), room.game.timeouts.lobbyLeaveMs));
}

function leaveLobby(room: RoomData, playerId: string): void {
  room.lobbyLeaveTimers.delete(playerId);
  const player = getPlayer(room.game, playerId);
  if (!player || player.connected || room.game.state !== 'lobby') return;

  removePlayer(room.game, playerId);
  removePlayerRoom(playerId);
  log.room.info(`Player ${player.name} left room ${room.code} after lobby grace period`);

  if (room.game.players.length === 0) {
    disposeRoom(room);
    deleteRoom(room.code);
    return;
  }
  broadcastToRoom(room, { type: 'player_left', playerId });
  commitRoom(room);
}

export function handleCloseRoom(ws: ServerWebSocket<WsData>): void {
  const ctx = hostRoom(ws, 'close the room');
  if (!ctx) return;
  const { room } = ctx;

  broadcastToRoom(room, { type: 'room_closed' });
  for (const player of room.game.players) {
    removePlayerRoom(player.id);
  }
  disposeRoom(room);
  deleteRoom(room.code);
}
