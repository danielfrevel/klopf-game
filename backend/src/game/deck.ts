import type { Card } from '@klopf/shared';
import { SUITS, RANKS } from '@klopf/shared';
import { createCard } from './card.js';

export function createDeck(): Card[] {
  const cards: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      cards.push(createCard(suit, rank));
    }
  }
  return cards;
}

export function shuffleDeck(cards: Card[]): void {
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
}

export function dealCards(cards: Card[], n: number): Card[] {
  return cards.splice(0, Math.min(n, cards.length));
}
