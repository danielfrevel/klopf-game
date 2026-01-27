import type { Card, Suit, Player as PlayerInfo } from '@klopf/shared';
import { INITIAL_LIVES } from '@klopf/shared';

// Internal player state (includes private data like hand and connection)
export class Player {
  readonly id: string;
  name: string;
  lives: number;
  hand: Card[];
  connected: boolean;
  mustMitgehen: boolean; // Player with 1 life must always mitgehen
  hasSeenCards: boolean; // For Blind auf 3

  constructor(id: string, name: string) {
    this.id = id;
    this.name = name;
    this.lives = INITIAL_LIVES;
    this.hand = [];
    this.connected = true;
    this.mustMitgehen = false;
    this.hasSeenCards = true;
  }

  // Check if player has a specific card
  hasCard(cardId: string): boolean {
    return this.hand.some((c) => c.id === cardId);
  }

  // Remove and return a card from hand
  removeCard(cardId: string): Card | undefined {
    const index = this.hand.findIndex((c) => c.id === cardId);
    if (index === -1) return undefined;
    return this.hand.splice(index, 1)[0];
  }

  // Get all cards of a specific suit
  getCardsOfSuit(suit: Suit): Card[] {
    return this.hand.filter((c) => c.suit === suit);
  }

  // Check if player is still alive
  isAlive(): boolean {
    return this.lives > 0;
  }

  // Lose lives (minimum 0)
  loseLives(n: number): void {
    this.lives = Math.max(0, this.lives - n);
  }

  // Get public player info (for broadcasting)
  toPlayerInfo(): PlayerInfo {
    return {
      id: this.id,
      name: this.name,
      lives: this.lives,
      cardCount: this.hand.length,
      connected: this.connected,
    };
  }
}
