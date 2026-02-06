import type { Card, Suit, Player as PlayerInfo } from '@klopf/shared';
import { INITIAL_LIVES } from '@klopf/shared';
import type { PlayerState } from './types.js';

export function createPlayer(id: string, name: string): PlayerState {
  return {
    id,
    name,
    lives: INITIAL_LIVES,
    hand: [],
    connected: true,
    mustMitgehen: false,
    hasSeenCards: true,
  };
}

export function hasCard(player: PlayerState, cardId: string): boolean {
  return player.hand.some((c) => c.id === cardId);
}

export function removeCard(player: PlayerState, cardId: string): Card | undefined {
  const index = player.hand.findIndex((c) => c.id === cardId);
  if (index === -1) return undefined;
  return player.hand.splice(index, 1)[0];
}

export function getCardsOfSuit(player: PlayerState, suit: Suit): Card[] {
  return player.hand.filter((c) => c.suit === suit);
}

export function isAlive(player: PlayerState): boolean {
  return player.lives > 0;
}

export function loseLives(player: PlayerState, n: number): void {
  player.lives = Math.max(0, player.lives - n);
}

export function toPlayerInfo(player: PlayerState): PlayerInfo {
  return {
    id: player.id,
    name: player.name,
    lives: player.lives,
    cardCount: player.hand.length,
    connected: player.connected,
  };
}
