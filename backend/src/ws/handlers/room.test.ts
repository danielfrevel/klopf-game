import { describe, expect, test } from 'bun:test';
import { getRoom } from '../../game/room.js';
import { getHostId, getPlayer } from '../../game/game.js';
import { fakeWs, lastOfType, type FakeWs } from '../test-helpers.js';
import { handleCreateRoom, handleDisconnect, handleJoinRoom, handleReconnect } from './room.js';

function session(ws: FakeWs) {
  const created = lastOfType(ws, 'room_created');
  if (!created) throw new Error('no room_created');
  return created;
}

function roomWith(...names: string[]) {
  const sockets = names.map(() => fakeWs());
  handleCreateRoom(sockets[0], names[0]);
  const { roomCode } = session(sockets[0]);
  for (let i = 1; i < names.length; i++) handleJoinRoom(sockets[i], roomCode, names[i]);
  const room = getRoom(roomCode)!;
  return { room, sockets, sessions: sockets.map(session) };
}

describe('sessions', () => {
  test('room_created carries a token that is never broadcast', () => {
    const { sockets, sessions } = roomWith('Anna', 'Ben');
    expect(sessions[1].token).toMatch(/[0-9a-f-]{36}/);
    const state = lastOfType(sockets[0], 'game_state')!.state;
    expect(JSON.stringify(state)).not.toContain(sessions[1].token);
  });

  test('reconnect with a wrong token fails and keeps the player offline', () => {
    const { room, sockets, sessions } = roomWith('Anna', 'Ben');
    handleDisconnect(sockets[1]);

    const intruder = fakeWs();
    handleReconnect(intruder, room.code, sessions[1].playerId, 'wrong');
    expect(lastOfType(intruder, 'error')?.code).toBe('invalid_session');
    expect(getPlayer(room.game, sessions[1].playerId)?.connected).toBe(false);

    const lost = fakeWs();
    handleReconnect(lost, 'nope00', sessions[1].playerId, sessions[1].token);
    expect(lastOfType(lost, 'error')?.code).toBe('room_not_found');
  });

  test('reconnect with the right token restores the player', () => {
    const { room, sockets, sessions } = roomWith('Anna', 'Ben');
    handleDisconnect(sockets[1]);
    const back = fakeWs();
    handleReconnect(back, room.code, sessions[1].playerId, sessions[1].token);
    expect(getPlayer(room.game, sessions[1].playerId)?.connected).toBe(true);
    expect(lastOfType(back, 'room_created')?.token).toBe(sessions[1].token);
  });

  test('names are unique per room, case-insensitive and trimmed', () => {
    const { room } = roomWith('Anna');
    const ws = fakeWs();
    handleJoinRoom(ws, room.code, '  anna ');
    expect(lastOfType(ws, 'error')?.code).toBe('name_taken');
    expect(room.game.players).toHaveLength(1);

    const tooLong = fakeWs();
    handleJoinRoom(tooLong, room.code, 'x'.repeat(21));
    expect(lastOfType(tooLong, 'error')).toBeDefined();
    expect(room.game.players).toHaveLength(1);
  });

  test('host moves to the next connected player and back', () => {
    const { room, sockets, sessions } = roomWith('Anna', 'Ben', 'Cleo');
    expect(getHostId(room.game)).toBe(sessions[0].playerId);

    handleDisconnect(sockets[0]);
    expect(getHostId(room.game)).toBe(sessions[1].playerId);
    expect(lastOfType(sockets[2], 'game_state')?.state.hostId).toBe(sessions[1].playerId);

    handleReconnect(fakeWs(), room.code, sessions[0].playerId, sessions[0].token);
    expect(getHostId(room.game)).toBe(sessions[0].playerId);
  });

  test('disconnected lobby player is removed after the grace period', async () => {
    const { room, sockets, sessions } = roomWith('Anna', 'Ben');
    room.game.timeouts.lobbyLeaveMs = 10;
    handleDisconnect(sockets[1]);
    await Bun.sleep(25);
    expect(getPlayer(room.game, sessions[1].playerId)).toBeUndefined();
    expect(lastOfType(sockets[0], 'player_left')?.playerId).toBe(sessions[1].playerId);
  });

  test('lobby player reconnecting within the grace period stays', async () => {
    const { room, sockets, sessions } = roomWith('Anna', 'Ben');
    room.game.timeouts.lobbyLeaveMs = 10;
    handleDisconnect(sockets[1]);
    handleReconnect(fakeWs(), room.code, sessions[1].playerId, sessions[1].token);
    await Bun.sleep(25);
    expect(getPlayer(room.game, sessions[1].playerId)?.connected).toBe(true);
  });
});
