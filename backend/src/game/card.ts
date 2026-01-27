import type { Card, Suit, Rank } from '@klopf/shared';
import { SUITS, RANKS, RANK_VALUES } from '@klopf/shared';

// Create a new card with generated ID
export function createCard(suit: Suit, rank: Rank): Card {
  return {
    id: `${suit}_${rank}`,
    suit,
    rank,
  };
}

// Get the numeric value of a card for comparison
export function getCardValue(card: Card): number {
  return RANK_VALUES[card.rank];
}

// Check if card a beats card b given the trump suit (lead suit)
// Trump suit = the suit of the first card played in a trick
export function cardBeats(a: Card, b: Card, trumpSuit: Suit): boolean {
  // Same suit - higher value wins
  if (a.suit === b.suit) {
    return getCardValue(a) > getCardValue(b);
  }
  // Trump suit always wins against non-trump
  if (a.suit === trumpSuit && b.suit !== trumpSuit) {
    return true;
  }
  // Non-trump cannot beat trump
  if (a.suit !== trumpSuit && b.suit === trumpSuit) {
    return false;
  }
  // Different non-trump suits - first card (b) wins by default
  return false;
}

export { SUITS, RANKS, RANK_VALUES };
