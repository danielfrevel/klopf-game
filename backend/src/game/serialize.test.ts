import { describe, expect, test } from 'bun:test';
import { Value } from '@sinclair/typebox/value';
import type { RoomData } from './types.js';
import { cancelAllTimers, getCurrentPlayer, initiateGameKlopf, resumeTimers, respondToGameKlopf } from './game.js';
import { RoomSnapshotSchema, fromSnapshot, toSnapshot } from './serialize.js';
import { card, playTrick, roomOf, setHands, startedGame } from './test-helpers.js';

function roundTrip(room: RoomData): RoomData {
  return fromSnapshot(JSON.parse(JSON.stringify(toSnapshot(room))));
}

function withoutRuntime(room: RoomData) {
  const { turnTimer, phaseTimer, onTimeout, onPhaseExpired, ...game } = room.game;
  return { code: room.code, game: { ...game, players: game.players.map(({ connected, ...p }) => p) } };
}

describe('snapshot', () => {
  test('room in the middle of a klopf survives a JSON round trip', () => {
    const game = startedGame(3);
    setHands(game, [
      [card('10', 'hearts'), card('9', 'clubs')],
      [card('9', 'hearts'), card('9', 'spades')],
      [card('8', 'hearts'), card('J', 'spades')],
    ]);
    playTrick(game, [card('10', 'hearts')]);
    initiateGameKlopf(game, 'B');
    respondToGameKlopf(game, 'A', false);
    const room = roomOf(game);
    expect(game.phaseTimer).not.toBeNull();

    const snapshot = JSON.parse(JSON.stringify(toSnapshot(room)));
    expect(Value.Check(RoomSnapshotSchema, snapshot)).toBe(true);
    const restored = fromSnapshot(snapshot);

    expect(withoutRuntime(restored)).toEqual(withoutRuntime(room));
    cancelAllTimers(game);
    expect(restored.game.klopf.responses).toBeInstanceOf(Map);
    expect(restored.game.klopf.responses.get('A')).toBe(false);
    expect(restored.game.turnTimer).toBeNull();
    expect(restored.game.phaseTimer).toBeNull();
    expect(restored.game.players.every((p) => !p.connected)).toBe(true);
    expect(restored.lobbyLeaveTimers.size).toBe(0);
  });

  test('invalid snapshot is rejected by the schema', () => {
    const snapshot = toSnapshot(roomOf(startedGame(2)));
    expect(Value.Check(RoomSnapshotSchema, { ...snapshot, game: { ...snapshot.game, players: 'nope' } })).toBe(false);
  });
});

describe('resumeTimers', () => {
  test('turn timer resumes with the remaining time', async () => {
    const original = startedGame(2);
    cancelAllTimers(original);
    const restored = roundTrip(roomOf(original)).game;
    restored.phaseEndsAt = Date.now() + 10;
    const current = getCurrentPlayer(restored)!;

    resumeTimers(restored);
    expect(current.hand).toHaveLength(4);
    await Bun.sleep(25);
    expect(current.hand).toHaveLength(3);
  });

  test('expired deadline fires right away', async () => {
    const original = startedGame(2);
    cancelAllTimers(original);
    const restored = roundTrip(roomOf(original)).game;
    restored.phaseEndsAt = Date.now() - 1000;
    const current = getCurrentPlayer(restored)!;

    resumeTimers(restored);
    await Bun.sleep(5);
    expect(current.hand).toHaveLength(3);
  });
});
