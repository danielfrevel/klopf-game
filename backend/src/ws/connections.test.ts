import { expect, test } from 'bun:test';
import { getPlayerRoom, getPlayerSockets, registerConnection, removeConnection } from './connections.js';
import { fakeWs } from './test-helpers.js';

test('player stays connected until the last of several sockets closes', () => {
  const ws1 = fakeWs();
  const ws2 = fakeWs();
  registerConnection(ws1, 'p1', 'room1');
  registerConnection(ws2, 'p1', 'room1');

  expect(removeConnection(ws2)).toBeNull();
  expect(getPlayerSockets('p1')).toEqual([ws1]);
  expect(getPlayerRoom('p1')).toBe('room1');

  expect(removeConnection(ws1)).toEqual({ playerId: 'p1', roomCode: 'room1' });
  expect(getPlayerSockets('p1')).toEqual([]);
  expect(getPlayerRoom('p1')).toBe('');
});

test('socket switching to another player reports the player it left', () => {
  const ws = fakeWs();
  registerConnection(ws, 'p2', 'room2');
  expect(registerConnection(ws, 'p3', 'room3')).toEqual({ playerId: 'p2', roomCode: 'room2' });
  expect(getPlayerSockets('p2')).toEqual([]);
  expect(getPlayerSockets('p3')).toEqual([ws]);
});
