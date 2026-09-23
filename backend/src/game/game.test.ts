import { describe, expect, test } from 'bun:test';
import { GameErrors, getCurrentPlayerId, playCard, startGame, startPlaying } from './game.js';
import { card, gameWithPlayers, playTrick, setHands } from './test-helpers.js';
import type { GameData } from './types.js';

function startedGame(n: number): GameData {
  const game = gameWithPlayers(n);
  expect(startGame(game)).toBeNull();
  startPlaying(game);
  return game;
}

const A_WINS_ALL = [
  [card('10', 'hearts'), card('9', 'hearts'), card('8', 'hearts'), card('7', 'hearts')],
  [card('J', 'hearts'), card('Q', 'hearts'), card('K', 'hearts'), card('A', 'hearts')],
];

function playRoundAWinsAll(game: GameData): void {
  const [a, b] = A_WINS_ALL;
  for (let i = 0; i < 4; i++) playTrick(game, [a[i], b[i]]);
}

describe('characterization', () => {
  test('must follow lead suit when possible', () => {
    const game = startedGame(2);
    setHands(game, [
      [card('10', 'hearts'), card('9', 'hearts'), card('8', 'hearts'), card('7', 'hearts')],
      [card('J', 'hearts'), card('10', 'spades'), card('9', 'spades'), card('8', 'spades')],
    ]);
    playTrick(game, [card('10', 'hearts')]);
    expect(playCard(game, 'B', card('10', 'spades').id)).toBe(GameErrors.MUST_FOLLOW_SUIT);
    expect(playCard(game, 'B', card('J', 'hearts').id)).toBeNull();
  });

  test('highest card of lead suit wins the trick, off-suit cards cannot win', () => {
    const game = startedGame(3);
    setHands(game, [[card('A', 'hearts')], [card('10', 'spades')], [card('7', 'hearts')]]);
    const trick = game.currentTrick!;
    playTrick(game, [card('A', 'hearts'), card('10', 'spades'), card('7', 'hearts')]);
    expect(trick.winnerId).toBe('C');
    expect(getCurrentPlayerId(game)).toBe('C');
  });

  test('trick winner leads the next trick', () => {
    const game = startedGame(2);
    setHands(game, [
      [card('J', 'hearts'), card('9', 'spades'), card('8', 'spades'), card('7', 'spades')],
      [card('10', 'hearts'), card('9', 'clubs'), card('8', 'clubs'), card('7', 'clubs')],
    ]);
    playTrick(game, [card('J', 'hearts'), card('10', 'hearts')]);
    expect(getCurrentPlayerId(game)).toBe('B');
  });

  test('round loser loses 1 life', () => {
    const game = startedGame(2);
    setHands(game, A_WINS_ALL);
    playRoundAWinsAll(game);
    expect(game.players[0].lives).toBe(7);
    expect(game.players[1].lives).toBe(6);
    expect(game.roundNumber).toBe(2);
  });

  test('game over when only one player has lives left', () => {
    const game = startedGame(2);
    game.players[1].lives = 1;
    setHands(game, A_WINS_ALL);
    playRoundAWinsAll(game);
    expect(game.players[1].lives).toBe(0);
    expect(game.state).toBe('game_over');
  });
});
