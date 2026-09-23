import type { Card, Rank, Suit } from '@klopf/shared';
import type { GameData, GameTimeouts } from './types.js';
import { createCard } from './card.js';
import { createPlayer } from './player.js';
import { addPlayer, createGame, getCurrentPlayerId, playCard, DEFAULT_TIMEOUTS } from './game.js';

export const PLAYER_IDS = ['A', 'B', 'C', 'D'] as const;

export function gameWithPlayers(n: number, timeouts: Partial<GameTimeouts> = {}): GameData {
  const game = createGame({ ...DEFAULT_TIMEOUTS, ...timeouts });
  for (const id of PLAYER_IDS.slice(0, n)) {
    const err = addPlayer(game, createPlayer(id, id));
    if (err) throw new Error(err);
  }
  return game;
}

export function card(rank: Rank, suit: Suit): Card {
  return createCard(suit, rank);
}

export function setHands(game: GameData, hands: Card[][]): void {
  hands.forEach((hand, i) => {
    game.players[i].hand = [...hand];
  });
}

export function playTrick(game: GameData, cards: Card[]): void {
  for (const c of cards) {
    const playerId = getCurrentPlayerId(game);
    const err = playCard(game, playerId, c.id);
    if (err) throw new Error(`${playerId} ${c.id}: ${err}`);
  }
}
