import type { ServerWebSocket } from 'bun';
import type { WsData } from './handler.js';

export interface ConnectionInfo {
  playerId: string;
  roomCode: string;
}

let connectionCounter = 0;
const connectionData = new Map<number, ConnectionInfo>();
const playerSockets = new Map<string, Map<number, ServerWebSocket<WsData>>>();
const playerRooms = new Map<string, string>();

export function nextConnId(): number {
  return ++connectionCounter;
}

function detach(connId: number): ConnectionInfo | null {
  const data = connectionData.get(connId);
  if (!data) return null;
  connectionData.delete(connId);

  const sockets = playerSockets.get(data.playerId);
  sockets?.delete(connId);
  if (sockets && sockets.size > 0) return null;

  playerSockets.delete(data.playerId);
  playerRooms.delete(data.playerId);
  return data;
}

export function registerConnection(ws: ServerWebSocket<WsData>, playerId: string, roomCode: string): ConnectionInfo | null {
  const connId = ws.data.connId;
  const previous = connectionData.get(connId);
  const displaced = previous && previous.playerId !== playerId ? detach(connId) : null;

  connectionData.set(connId, { playerId, roomCode });
  if (!playerSockets.has(playerId)) playerSockets.set(playerId, new Map());
  playerSockets.get(playerId)!.set(connId, ws);
  playerRooms.set(playerId, roomCode);
  ws.data.playerId = playerId;
  ws.data.roomCode = roomCode;
  return displaced;
}

export function getPlayerId(ws: ServerWebSocket<WsData>): string {
  return connectionData.get(ws.data.connId)?.playerId ?? '';
}

export function getPlayerRoom(playerId: string): string {
  return playerRooms.get(playerId) ?? '';
}

export function getPlayerSockets(playerId: string): ServerWebSocket<WsData>[] {
  return [...(playerSockets.get(playerId)?.values() ?? [])];
}

export function removeConnection(ws: ServerWebSocket<WsData>): ConnectionInfo | null {
  return detach(ws.data.connId);
}

export function removePlayerRoom(playerId: string): void {
  playerRooms.delete(playerId);
}
