import { expect, test } from 'bun:test';
import { openRoomStore } from './db.js';
import { createGame } from '../game/game.js';
import { roomOf } from '../game/test-helpers.js';

function room(code: string) {
  return roomOf(createGame(), code);
}

test('save, load, overwrite and delete rooms', () => {
  const store = openRoomStore(':memory:');
  store.saveRoom(room('aaaaaa'));
  store.saveRoom(room('bbbbbb'));
  expect(store.loadRooms().map((r) => r.code).sort()).toEqual(['aaaaaa', 'bbbbbb']);

  const changed = room('aaaaaa');
  changed.game.stakes = 9;
  store.saveRoom(changed);
  const loaded = store.loadRooms();
  expect(loaded).toHaveLength(2);
  expect(loaded.find((r) => r.code === 'aaaaaa')?.game.stakes).toBe(9);

  store.deleteRoom('bbbbbb');
  expect(store.loadRooms().map((r) => r.code)).toEqual(['aaaaaa']);
});

test('purge drops rooms by updated_at', () => {
  const store = openRoomStore(':memory:');
  const now = Date.now();
  store.saveRoom(room('oldold'), now - 2 * 3_600_000);
  store.saveRoom(room('newnew'), now);

  expect(store.purgeOlderThan(3_600_000, now)).toEqual(['oldold']);
  expect(store.loadRooms().map((r) => r.code)).toEqual(['newnew']);
});

test('invalid rows are skipped on load', () => {
  const store = openRoomStore(':memory:');
  store.saveRoom(room('goodgd'));
  store.db.run("INSERT INTO rooms (code, data, updated_at) VALUES ('broken', '{\"code\":1}', 0)");
  expect(store.loadRooms().map((r) => r.code)).toEqual(['goodgd']);
});
