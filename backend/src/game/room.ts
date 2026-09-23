import type { RoomData } from './types.js';
import { cancelAllTimers, createGame, getHostId } from './game.js';

const rooms = new Map<string, RoomData>();

function generateCode(): string {
  const chars = '0123456789abcdef';
  let code: string;
  do {
    code = '';
    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
  } while (rooms.has(code));
  return code;
}

export function createRoom(): RoomData {
  const code = generateCode();
  const room: RoomData = { code, game: createGame(), lobbyLeaveTimers: new Map() };
  rooms.set(code, room);
  return room;
}

export function restoreRoom(room: RoomData): void {
  rooms.set(room.code, room);
}

export function getRoom(code: string): RoomData | undefined {
  return rooms.get(code.toLowerCase());
}

export function removeRoom(code: string): void {
  rooms.delete(code.toLowerCase());
}

export function disposeRoom(room: RoomData): void {
  cancelAllTimers(room.game);
  for (const timer of room.lobbyLeaveTimers.values()) clearTimeout(timer);
  room.lobbyLeaveTimers.clear();
  removeRoom(room.code);
}

export function isHost(room: RoomData, playerId: string): boolean {
  return getHostId(room.game) === playerId;
}
