import { Game } from '../game/game.js';
import { Player } from '../game/player.js';

export class Room {
  readonly code: string;
  readonly ownerId: string;
  readonly game: Game;

  constructor(code: string, ownerId: string) {
    this.code = code;
    this.ownerId = ownerId;
    this.game = new Game();
  }

  // Add a player to the room's game
  addPlayer(player: Player): string | null {
    return this.game.addPlayer(player);
  }

  // Remove a player from the room
  removePlayer(playerId: string): void {
    this.game.removePlayer(playerId);
  }

  // Get a player by ID
  getPlayer(playerId: string): Player | undefined {
    return this.game.getPlayer(playerId);
  }

  // Check if room is empty
  isEmpty(): boolean {
    return this.game.players.length === 0;
  }

  // Get player count
  playerCount(): number {
    return this.game.players.length;
  }

  // Check if player is the owner
  isOwner(playerId: string): boolean {
    return this.ownerId === playerId;
  }

  // Start the game
  start(): string | null {
    return this.game.start();
  }
}
