import { describe, expect, test } from 'bun:test';
import {
  GameErrors, blindDrei, initiateGameKlopf, requestRedeal, respondToGameKlopf,
  respondToRedeal, revealCards, startGame,
} from './game.js';
import { gameWithPlayers, ok, player, startedGame } from './test-helpers.js';
import type { GameTimeouts } from './types.js';

function dealingGame(n: number, timeouts: Partial<GameTimeouts> = {}) {
  const game = gameWithPlayers(n, timeouts);
  ok(startGame(game));
  return game;
}

describe('dealing phase', () => {
  test('game starts in dealing with a deadline', () => {
    const game = dealingGame(2);
    expect(game.state).toBe('dealing');
    expect(game.phaseEndsAt).toBeGreaterThan(Date.now());
    expect(game.players.every((p) => !p.revealed)).toBe(true);
  });

  test('play starts once all active players revealed', () => {
    const game = dealingGame(2);
    ok(revealCards(game, 'A'));
    expect(game.state).toBe('dealing');
    ok(revealCards(game, 'B'));
    expect(game.state).toBe('playing');
    expect(game.trickNumber).toBe(1);
  });

  test('play starts when the dealing timer runs out', async () => {
    const game = dealingGame(2, { dealingMs: 10 });
    await Bun.sleep(25);
    expect(game.state).toBe('playing');
    expect(game.players.every((p) => p.revealed)).toBe(true);
  });

  test('blind auf 3 only before revealing, resolves into play', () => {
    const game = dealingGame(2);
    ok(revealCards(game, 'A'));
    expect(blindDrei(game, 'A')).toBe(GameErrors.ALREADY_REVEALED);

    ok(blindDrei(game, 'B'));
    expect(game.klopf.level).toBe(3);
    expect(game.state).toBe('klopf_pending');
    ok(respondToGameKlopf(game, 'A', true));
    expect(game.state).toBe('playing');
    expect(game.phaseTimer).toBeNull();
  });

  test('einigung only with 2 active players, redeal deals new hands into a new dealing phase', () => {
    expect(requestRedeal(dealingGame(3), 'A')).toBe(GameErrors.REDEAL_NOT_ALLOWED);

    const game = dealingGame(2);
    ok(revealCards(game, 'A'));
    const handBefore = player(game, 'A').hand;
    ok(requestRedeal(game, 'A'));
    ok(respondToRedeal(game, 'B', true));
    expect(game.redealCount).toBe(1);
    expect(game.state).toBe('dealing');
    expect(player(game, 'A').hand).not.toBe(handBefore);
    expect(player(game, 'A').hand).toHaveLength(4);
    expect(player(game, 'A').revealed).toBe(false);
    expect(game.phaseEndsAt).toBeGreaterThan(Date.now());
  });

  test('klopf in dealing ends the dealing phase, play follows after resolution', () => {
    const game = dealingGame(2);
    ok(revealCards(game, 'A'));
    ok(initiateGameKlopf(game, 'A'));
    ok(respondToGameKlopf(game, 'B', true));
    expect(game.state).toBe('playing');
    expect(game.phaseTimer).toBeNull();
    expect(game.turnTimer).not.toBeNull();
  });
});

describe('response timers', () => {
  test('unanswered klopf folds non-responders, 1-life player goes along', async () => {
    const game = startedGame(3, { responseMs: 10 });
    const c = player(game, 'C');
    c.lives = 1;
    c.mustMitgehen = true;
    ok(initiateGameKlopf(game, 'A'));
    await Bun.sleep(25);
    expect(player(game, 'B').folded).toBe(true);
    expect(player(game, 'B').lives).toBe(6);
    expect(game.klopf.participants).toEqual(['A', 'C']);
    expect(game.state).toBe('playing');
  });

  test('unanswered klopf with only the klopfer left ends the round for the klopfer', async () => {
    const game = startedGame(2, { responseMs: 10 });
    const expired: string[] = [];
    game.onPhaseExpired = (kind) => expired.push(kind);
    ok(initiateGameKlopf(game, 'A'));
    await Bun.sleep(25);
    expect(player(game, 'B').lives).toBe(6);
    expect(game.roundNumber).toBe(2);
    expect(game.lastRoundResults?.winnerId).toBe('A');
    expect(expired).toEqual(['klopf']);
  });

  test('unanswered einigung is declined and restores the remaining dealing time', async () => {
    const game = dealingGame(2, { responseMs: 10 });
    const expired: string[] = [];
    game.onPhaseExpired = (kind) => expired.push(kind);
    const remaining = game.phaseEndsAt! - Date.now();
    ok(requestRedeal(game, 'A'));
    await Bun.sleep(25);
    expect(game.state).toBe('dealing');
    expect(game.redealCount).toBe(0);
    expect(Math.abs(game.phaseEndsAt! - Date.now() - remaining)).toBeLessThan(20);
    expect(expired).toEqual(['redeal']);
  });
});

describe('einigung responses', () => {
  test('requester cannot answer their own einigung', () => {
    const game = dealingGame(2);
    ok(requestRedeal(game, 'A'));
    expect(respondToRedeal(game, 'A', false)).toBe(GameErrors.OWN_REDEAL);
    expect(game.state).toBe('redeal_pending');
  });

  test('eliminated player cannot answer an einigung', () => {
    const game = gameWithPlayers(3);
    player(game, 'C').lives = 0;
    ok(startGame(game));
    ok(requestRedeal(game, 'A'));
    expect(respondToRedeal(game, 'C', true)).toBe(GameErrors.PLAYER_NOT_ACTIVE);
    expect(game.state).toBe('redeal_pending');
  });

  test('klopf timeout reports the level of the resolved klopf', async () => {
    const game = startedGame(2, { responseMs: 10 });
    const levels: number[] = [];
    game.onPhaseExpired = (_kind, klopfLevel) => levels.push(klopfLevel);
    ok(initiateGameKlopf(game, 'A'));
    ok(respondToGameKlopf(game, 'B', true));
    ok(initiateGameKlopf(game, 'B'));
    await Bun.sleep(25);
    expect(game.roundNumber).toBe(2);
    expect(levels).toEqual([2]);
  });
});
