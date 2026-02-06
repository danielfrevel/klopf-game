import type { ServerWebSocket } from 'bun';
import type { WsData } from './handler.js';

let connectionCounter = 0;
const connectionData = new Map<number, { playerId: string; roomCode: string }>();
const playerConns = new Map<string, { ws: ServerWebSocket<WsData>; connId: number }>();
const playerRooms = new Map<string, string>();

export function nextConnId(): number {
  return ++connectionCounter;
}

export function registerConnection(
  ws: ServerWebSocket<WsData>,
  playerId: string,
  roomCode: string,
): void {
  const connId = ws.data?.connId ?? connectionCounter;
  connectionData.set(connId, { playerId, roomCode });
  playerConns.set(playerId, { ws, connId });
  playerRooms.set(playerId, roomCode);
  if (ws.data) {
    ws.data.playerId = playerId;
    ws.data.roomCode = roomCode;
  }
}

export function getPlayerId(ws: ServerWebSocket<WsData>): string {
  const connId = ws.data?.connId;
  if (connId !== undefined) {
    const data = connectionData.get(connId);
    if (data) return data.playerId;
  }
  return ws.data?.playerId ?? '';
}

export function getPlayerRoom(playerId: string): string {
  return playerRooms.get(playerId) ?? '';
}

export function getPlayerWs(playerId: string): ServerWebSocket<WsData> | undefined {
  return playerConns.get(playerId)?.ws;
}

export function removeConnection(ws: ServerWebSocket<WsData>): { playerId: string; roomCode: string } | null {
  const connId = ws.data?.connId;
  if (connId === undefined) return null;

  const data = connectionData.get(connId);
  if (!data?.playerId) return null;

  connectionData.delete(connId);
  playerConns.delete(data.playerId);
  playerRooms.delete(data.playerId);

  return data;
}

export function removePlayerRoom(playerId: string): void {
  playerRooms.delete(playerId);
}
