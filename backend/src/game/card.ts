import type { Card, Suit, Rank } from '@klopf/shared';
import { SUITS, RANKS, RANK_VALUES } from '@klopf/shared';

export function createCard(suit: Suit, rank: Rank): Card {
  return {
    id: `${suit}_${rank}`,
    suit,
    rank,
  };
}

export function getCardValue(card: Card): number {
  return RANK_VALUES[card.rank];
}

export function cardBeats(a: Card, b: Card, leadSuit: Suit): boolean {
  if (a.suit === b.suit) {
    return getCardValue(a) > getCardValue(b);
  }
  return a.suit === leadSuit;
}

export { SUITS, RANKS, RANK_VALUES };
