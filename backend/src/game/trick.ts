import type { Card, Suit, TrickCard, Trick as TrickInfo } from '@klopf/shared';
import { cardBeats } from './card.js';

export class Trick {
  cards: TrickCard[];
  leadSuit: Suit | '' = '';
  winnerId: string | undefined;

  constructor() {
    this.cards = [];
  }

  // Add a card to the trick
  addCard(playerId: string, card: Card): void {
    // First card determines the lead suit
    if (this.cards.length === 0) {
      this.leadSuit = card.suit;
    }

    this.cards.push({ playerId, card });
  }

  // Check if trick is complete (all players have played)
  isComplete(numPlayers: number): boolean {
    return this.cards.length >= numPlayers;
  }

  // Determine the winner of the trick
  determineWinner(): string {
    if (this.cards.length === 0) return '';

    let winningIdx = 0;
    let winningCard = this.cards[0].card;

    for (let i = 1; i < this.cards.length; i++) {
      const currentCard = this.cards[i].card;
      // A card beats the current winner if it's the same suit with higher value
      // or if it matches the lead suit and the current winner doesn't
      if (cardBeats(currentCard, winningCard, this.leadSuit as Suit)) {
        winningIdx = i;
        winningCard = currentCard;
      }
    }

    this.winnerId = this.cards[winningIdx].playerId;
    return this.winnerId;
  }

  // Get lead suit
  getLeadSuit(): Suit {
    return this.leadSuit as Suit;
  }

  // Convert to TrickInfo for broadcasting
  toTrickInfo(): TrickInfo {
    return {
      cards: this.cards,
      leadSuit: this.leadSuit,
      winnerId: this.winnerId,
    };
  }
}
