import { expect, test } from 'bun:test';
import { handleCreateRoom, handleJoinRoom } from './room.js';
import { handleStartGame } from './game.js';
import { handleRequestRedeal } from './redeal.js';
import { getRoom } from '../../game/room.js';
import { loadRooms } from '../../persistence/db.js';
import { fakeWs, lastOfType } from '../test-helpers.js';

test('einigung request is broadcast as game state and persisted', () => {
  const a = fakeWs();
  const b = fakeWs();
  handleCreateRoom(a, 'Anna');
  const { roomCode } = lastOfType(a, 'room_created')!;
  handleJoinRoom(b, roomCode, 'Ben');
  handleStartGame(a);

  handleRequestRedeal(a);

  expect(getRoom(roomCode)?.game.state).toBe('redeal_pending');
  expect(lastOfType(b, 'game_state')?.state.state).toBe('redeal_pending');
  expect(loadRooms().find((r) => r.code === roomCode)?.game.state).toBe('redeal_pending');
});
