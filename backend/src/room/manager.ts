import { Room } from './room.js';

export class RoomManager {
  private rooms: Map<string, Room> = new Map();

  // Create a new room with a random code
  createRoom(ownerId: string): Room {
    const code = this.generateCode();
    const room = new Room(code, ownerId);
    this.rooms.set(code, room);
    return room;
  }

  // Get a room by code (case-insensitive)
  getRoom(code: string): Room | undefined {
    return this.rooms.get(code.toLowerCase());
  }

  // Remove a room
  removeRoom(code: string): void {
    this.rooms.delete(code.toLowerCase());
  }

  // Cleanup empty rooms
  cleanupEmptyRooms(): void {
    for (const [code, room] of this.rooms) {
      if (room.isEmpty()) {
        this.rooms.delete(code);
      }
    }
  }

  // Generate a random 6-character room code
  private generateCode(): string {
    const chars = '0123456789abcdef';
    let code: string;
    do {
      code = '';
      for (let i = 0; i < 6; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
      }
    } while (this.rooms.has(code));
    return code;
  }

  // Get the number of active rooms
  roomCount(): number {
    return this.rooms.size;
  }
}
