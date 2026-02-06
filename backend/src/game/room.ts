import type { RoomData } from './types.js';
import { createGame } from './game.js';

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

export function createRoom(ownerId: string): RoomData {
  const code = generateCode();
  const room: RoomData = { code, ownerId, game: createGame() };
  rooms.set(code, room);
  return room;
}

export function getRoom(code: string): RoomData | undefined {
  return rooms.get(code.toLowerCase());
}

export function removeRoom(code: string): void {
  rooms.delete(code.toLowerCase());
}

export function isOwner(room: RoomData, playerId: string): boolean {
  return room.ownerId === playerId;
}
