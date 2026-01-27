import type { Card } from '@klopf/shared';
import { SUITS, RANKS } from '@klopf/shared';
import { createCard } from './card.js';

export class Deck {
  private cards: Card[];

  constructor() {
    // Create a 32-card deck (7-8-9-10-J-Q-K-A in all suits)
    this.cards = [];
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        this.cards.push(createCard(suit, rank));
      }
    }
  }

  // Fisher-Yates shuffle
  shuffle(): void {
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
  }

  // Deal n cards from the deck
  deal(n: number): Card[] {
    const count = Math.min(n, this.cards.length);
    const dealt = this.cards.slice(0, count);
    this.cards = this.cards.slice(count);
    return dealt;
  }

  // Number of cards remaining
  remaining(): number {
    return this.cards.length;
  }
}
