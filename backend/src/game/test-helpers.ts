import { expect } from 'bun:test';
import type { Card, Rank, Suit } from '@klopf/shared';
import type { GameData, GameTimeouts, RoomData } from './types.js';
import { createCard } from './card.js';
import { createPlayer } from './player.js';
import { addPlayer, createGame, getCurrentPlayerId, playCard, startGame, startPlaying, DEFAULT_TIMEOUTS } from './game.js';

export const PLAYER_IDS = ['A', 'B', 'C', 'D'] as const;

export function gameWithPlayers(n: number, timeouts: Partial<GameTimeouts> = {}): GameData {
  const game = createGame({ ...DEFAULT_TIMEOUTS, ...timeouts });
  for (const id of PLAYER_IDS.slice(0, n)) {
    const err = addPlayer(game, createPlayer(id, id));
    if (err) throw new Error(err);
  }
  return game;
}

export function startedGame(n: number, timeouts: Partial<GameTimeouts> = {}): GameData {
  const game = gameWithPlayers(n, timeouts);
  const err = startGame(game);
  if (err) throw new Error(err);
  if (game.state === 'dealing') startPlaying(game);
  return game;
}

export function player(game: GameData, id: string) {
  const p = game.players.find((x) => x.id === id);
  if (!p) throw new Error(`no player ${id}`);
  return p;
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

export function ok(err: string | null): void {
  expect(err).toBeNull();
}

export function roomOf(game: GameData, code = 'abc123'): RoomData {
  return { code, game, lobbyLeaveTimers: new Map() };
}

export const A_WINS_ALL: Card[][] = [
  [card('10', 'hearts'), card('9', 'hearts'), card('8', 'hearts'), card('7', 'hearts')],
  [card('J', 'hearts'), card('Q', 'hearts'), card('K', 'hearts'), card('A', 'hearts')],
];

export function playRoundAWinsAll(game: GameData): void {
  const [a, b] = A_WINS_ALL;
  setHands(game, A_WINS_ALL);
  a.forEach((c, i) => playTrick(game, [c, b[i]]));
}
