import { describe, expect, test } from 'bun:test';
import {
  GameErrors, getCurrentPlayerId, initiateGameKlopf, playCard, playRandomCard,
  respondToGameKlopf, startPlaying, toGameStateInfo,
} from './game.js';
import { card, player, playTrick, setHands, startedGame } from './test-helpers.js';
import type { Card } from '@klopf/shared';
import type { GameData } from './types.js';

function ok(err: string | null): void {
  expect(err).toBeNull();
}

const A_WINS_ALL: Card[][] = [
  [card('10', 'hearts'), card('9', 'hearts'), card('8', 'hearts'), card('7', 'hearts')],
  [card('J', 'hearts'), card('Q', 'hearts'), card('K', 'hearts'), card('A', 'hearts')],
];

function playRound(game: GameData, hands: Card[][], order: Card[][]): void {
  setHands(game, hands);
  for (const trick of order) playTrick(game, trick);
}

function playRoundAWinsAll(game: GameData): void {
  const [a, b] = A_WINS_ALL;
  playRound(game, A_WINS_ALL, a.map((c, i) => [c, b[i]]));
}

describe('klopf and lives', () => {
  test('player who klopfed last round may klopf again in the next round', () => {
    const game = startedGame(2);
    ok(initiateGameKlopf(game, 'A'));
    ok(respondToGameKlopf(game, 'B', true));
    playRoundAWinsAll(game);
    expect(game.roundNumber).toBe(2);
    expect(game.state).toBe('dealing');
    ok(initiateGameKlopf(game, 'A'));
  });

  test('auto-klopf works for 1-life player who klopfed in the previous round', () => {
    const game = startedGame(2);
    player(game, 'B').lives = 3;
    ok(initiateGameKlopf(game, 'B'));
    ok(respondToGameKlopf(game, 'A', true));
    playRoundAWinsAll(game);
    expect(player(game, 'B').lives).toBe(1);
    expect(game.klopf.active).toBe(true);
    expect(game.klopf.initiator).toBe('B');
    expect(game.state).toBe('klopf_pending');
  });

  test('fold at level 1 with 2 players costs exactly 1 life and ends the round', () => {
    const game = startedGame(2);
    ok(initiateGameKlopf(game, 'A'));
    ok(respondToGameKlopf(game, 'B', false));
    expect(player(game, 'B').lives).toBe(6);
    expect(player(game, 'A').lives).toBe(7);
    expect(game.roundNumber).toBe(2);
    expect(game.lastRoundResults?.winnerId).toBe('A');
    expect(game.lastRoundResults?.results).toEqual([
      expect.objectContaining({ playerId: 'A', livesLost: 0, folded: false }),
      expect.objectContaining({ playerId: 'B', livesLost: 1, folded: true }),
    ]);
  });

  test('folded player is not asked on konter and pays nothing more', () => {
    const game = startedGame(3);
    ok(initiateGameKlopf(game, 'A'));
    ok(respondToGameKlopf(game, 'B', true));
    ok(respondToGameKlopf(game, 'C', false));
    expect(player(game, 'C').folded).toBe(true);
    expect(player(game, 'C').lives).toBe(6);

    ok(initiateGameKlopf(game, 'B'));
    expect(game.klopf.level).toBe(2);
    const responders = toGameStateInfo(game).klopf.responses?.map((r) => r.playerId);
    expect(responders).toEqual(['A']);
    ok(respondToGameKlopf(game, 'A', true));
    expect(game.state).toBe('playing');

    const a = [card('J', 'hearts'), card('Q', 'hearts'), card('K', 'hearts'), card('A', 'hearts')];
    const b = [card('10', 'hearts'), card('9', 'hearts'), card('8', 'hearts'), card('7', 'hearts')];
    playRound(game, [a, b, player(game, 'C').hand], [
      [a[0], b[0]], [b[1], a[1]], [b[2], a[2]], [b[3], a[3]],
    ]);
    expect(game.lastRoundResults?.winnerId).toBe('B');
    expect(player(game, 'A').lives).toBe(4);
    expect(player(game, 'C').lives).toBe(6);
    expect(game.lastRoundResults?.results).toEqual([
      expect.objectContaining({ playerId: 'A', livesLost: 3, folded: false }),
      expect.objectContaining({ playerId: 'B', livesLost: 0, folded: false }),
      expect.objectContaining({ playerId: 'C', livesLost: 1, folded: true }),
    ]);
  });

  test('folding down to 0 lives ends the game with round results', () => {
    const game = startedGame(2);
    player(game, 'B').lives = 2;
    ok(initiateGameKlopf(game, 'A'));
    ok(respondToGameKlopf(game, 'B', true));
    ok(initiateGameKlopf(game, 'B'));
    ok(respondToGameKlopf(game, 'A', true));
    ok(initiateGameKlopf(game, 'A'));
    ok(respondToGameKlopf(game, 'B', false));
    expect(player(game, 'B').lives).toBe(0);
    expect(game.state).toBe('game_over');
    expect(game.lastRoundResults?.winnerId).toBe('A');
  });

  test('dead or folded players cannot respond to a klopf', () => {
    const game = startedGame(4);
    player(game, 'D').lives = 0;
    ok(initiateGameKlopf(game, 'A'));
    expect(respondToGameKlopf(game, 'D', true)).toBe(GameErrors.PLAYER_NOT_ACTIVE);
    ok(respondToGameKlopf(game, 'B', false));
    ok(respondToGameKlopf(game, 'C', true));

    ok(initiateGameKlopf(game, 'C'));
    expect(respondToGameKlopf(game, 'B', true)).toBe(GameErrors.PLAYER_NOT_ACTIVE);
    expect(respondToGameKlopf(game, 'D', true)).toBe(GameErrors.PLAYER_NOT_ACTIVE);
    expect(game.klopf.participants).toEqual(['C']);
  });

  test('card of a player who folds mid-trick stays but cannot win', () => {
    const game = startedGame(3);
    const a = [card('10', 'hearts'), card('10', 'clubs'), card('9', 'clubs'), card('8', 'clubs')];
    const b = [card('9', 'hearts'), card('9', 'spades'), card('8', 'spades'), card('7', 'spades')];
    const c = [card('8', 'hearts'), card('J', 'spades'), card('Q', 'spades'), card('K', 'spades')];
    setHands(game, [a, b, c]);
    const trick = game.currentTrick!;
    playTrick(game, [a[0]]);

    ok(initiateGameKlopf(game, 'B'));
    ok(respondToGameKlopf(game, 'A', false));
    ok(respondToGameKlopf(game, 'C', true));
    expect(getCurrentPlayerId(game)).toBe('B');

    const seen: string[] = [];
    for (const [first, second] of [[b[0], c[0]], [b[1], c[1]], [b[2], c[2]], [b[3], c[3]]]) {
      playTrick(game, [first]);
      seen.push(getCurrentPlayerId(game));
      playTrick(game, [second]);
      seen.push(getCurrentPlayerId(game));
    }
    expect(trick.cards.map((tc) => tc.playerId)).toEqual(['A', 'B', 'C']);
    expect(trick.leadSuit).toBe('hearts');
    expect(trick.winnerId).toBe('B');
    expect(seen.slice(0, -1)).not.toContain('A');
    expect(game.lastRoundResults?.winnerId).toBe('B');
    expect(player(game, 'A').lives).toBe(6);
    expect(player(game, 'C').lives).toBe(5);
  });

  test('folded player cannot play a card or klopf', () => {
    const game = startedGame(3);
    ok(initiateGameKlopf(game, 'A'));
    ok(respondToGameKlopf(game, 'B', false));
    ok(respondToGameKlopf(game, 'C', true));
    const bCard = player(game, 'B').hand[0];
    expect(playCard(game, 'B', bCard.id)).toBe(GameErrors.PLAYER_NOT_ACTIVE);
    expect(initiateGameKlopf(game, 'B')).toBe(GameErrors.PLAYER_NOT_ACTIVE);
  });

  test('round winner leads the next round, dead player gets no hand and never has the turn', () => {
    const game = startedGame(3);
    player(game, 'C').lives = 1;
    const a = [card('10', 'hearts'), card('10', 'spades'), card('10', 'diamonds'), card('7', 'clubs')];
    const b = [card('J', 'hearts'), card('J', 'spades'), card('J', 'diamonds'), card('10', 'clubs')];
    const c = [card('Q', 'hearts'), card('Q', 'spades'), card('Q', 'diamonds'), card('8', 'clubs')];
    playRound(game, [a, b, c], [0, 1, 2, 3].map((i) => [a[i], b[i], c[i]]));
    expect(game.lastRoundResults?.winnerId).toBe('B');
    expect(player(game, 'C').lives).toBe(0);
    expect(player(game, 'C').hand).toEqual([]);
    expect(getCurrentPlayerId(game)).toBe('B');

    startPlaying(game);
    while (game.roundNumber === 2) {
      const current = getCurrentPlayerId(game);
      expect(current).not.toBe('C');
      expect(playRandomCard(game, current)).not.toBeNull();
    }
  });

  test('turn timer plays a valid card for the current player', async () => {
    const game = startedGame(2, { turnMs: 10 });
    setHands(game, [
      [card('A', 'hearts'), card('10', 'clubs'), card('9', 'clubs'), card('8', 'clubs')],
      [card('J', 'hearts'), card('10', 'spades'), card('9', 'spades'), card('8', 'spades')],
    ]);
    playTrick(game, [card('A', 'hearts')]);
    await Bun.sleep(25);
    expect(game.completedTricks[0]?.cards[1]).toEqual({ playerId: 'B', card: card('J', 'hearts') });
  });

  test('stale turn timer does nothing', async () => {
    const game = startedGame(3, { turnMs: 10 });
    const fired: string[] = [];
    game.onTimeout = (id) => fired.push(id);
    game.currentPlayerIndex = 1;
    await Bun.sleep(25);
    expect(fired).toEqual([]);

    const other = startedGame(2, { turnMs: 10 });
    other.onTimeout = (id) => fired.push(id);
    other.state = 'klopf_pending';
    await Bun.sleep(25);
    expect(fired).toEqual([]);
  });
});
