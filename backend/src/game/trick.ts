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

export function isTrickComplete(trick: TrickState, activeIds: string[]): boolean {
  return activeIds.every((id) => trick.cards.some((tc) => tc.playerId === id));
}

export function determineTrickWinner(trick: TrickState, eligibleIds: string[]): string {
  let winner: TrickState['cards'][number] | undefined;
  for (const tc of trick.cards) {
    if (!eligibleIds.includes(tc.playerId)) continue;
    if (!winner || cardBeats(tc.card, winner.card, trick.leadSuit as Suit)) winner = tc;
  }
  trick.winnerId = winner?.playerId;
  return trick.winnerId ?? '';
}

export function toTrickInfo(trick: TrickState): TrickInfo {
  return {
    cards: trick.cards,
    leadSuit: trick.leadSuit,
    winnerId: trick.winnerId,
  };
}
