import type { Card, Suit, Trick as TrickInfo } from '@klopf/shared';
import type { TrickState } from './types.js';
import { cardBeats } from './card.js';

export function createTrick(): TrickState {
  return { cards: [], leadSuit: '', winnerId: undefined };
}

export function addCardToTrick(trick: TrickState, playerId: string, card: Card): void {
  if (trick.cards.length === 0) {
    trick.leadSuit = card.suit;
  }
  trick.cards.push({ playerId, card });
}

export function isTrickComplete(trick: TrickState, numPlayers: number): boolean {
  return trick.cards.length >= numPlayers;
}

export function determineTrickWinner(trick: TrickState): string {
  if (trick.cards.length === 0) return '';

  let winningIdx = 0;
  let winningCard = trick.cards[0].card;

  for (let i = 1; i < trick.cards.length; i++) {
    const currentCard = trick.cards[i].card;
    if (cardBeats(currentCard, winningCard, trick.leadSuit as Suit)) {
      winningIdx = i;
      winningCard = currentCard;
    }
  }

  trick.winnerId = trick.cards[winningIdx].playerId;
  return trick.winnerId;
}

export function toTrickInfo(trick: TrickState): TrickInfo {
  return {
    cards: trick.cards,
    leadSuit: trick.leadSuit,
    winnerId: trick.winnerId,
  };
}
