import { expect, test } from 'bun:test';
import type { ServerWebSocket } from 'bun';
import type { WsData } from './handler.js';
import { getPlayerRoom, getPlayerWs, nextConnId, registerConnection, removeConnection } from './connections.js';

function fakeWs(): ServerWebSocket<WsData> {
  return { data: { connId: nextConnId(), playerId: '', roomCode: '' } } as unknown as ServerWebSocket<WsData>;
}

test('closing an old socket keeps the newer connection of the same player', () => {
  const ws1 = fakeWs();
  const ws2 = fakeWs();
  registerConnection(ws1, 'p1', 'room1');
  registerConnection(ws2, 'p1', 'room1');

  removeConnection(ws1);

  expect(getPlayerWs('p1')).toBe(ws2);
  expect(getPlayerRoom('p1')).toBe('room1');
});

test('closing the current socket removes the player mapping', () => {
  const ws = fakeWs();
  registerConnection(ws, 'p2', 'room2');

  expect(removeConnection(ws)).toEqual({ playerId: 'p2', roomCode: 'room2' });

  expect(getPlayerWs('p2')).toBeUndefined();
  expect(getPlayerRoom('p2')).toBe('');
});
