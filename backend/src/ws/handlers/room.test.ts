import { describe, expect, test } from 'bun:test';
import { getRoom } from '../../game/room.js';
import { getHostId, getPlayer } from '../../game/game.js';
import { fakeWs, lastOfType, type FakeWs } from '../test-helpers.js';
import { handleCreateRoom, handleDisconnect, handleJoinRoom, handleLeaveRoom, handleReconnect, resumeLobbyLeave } from './room.js';
import { handleRestartGame, handleStartGame } from './game.js';
import { handleRequestRedeal } from './redeal.js';

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

describe('several tabs and restored lobbies', () => {
  test('closing the newer of two tabs keeps the older tab live', () => {
    const { room, sockets, sessions } = roomWith('Anna', 'Ben');
    const secondTab = fakeWs();
    handleReconnect(secondTab, room.code, sessions[1].playerId, sessions[1].token);

    handleDisconnect(secondTab);
    expect(getPlayer(room.game, sessions[1].playerId)?.connected).toBe(true);

    const before = sockets[1].sent.length;
    handleJoinRoom(fakeWs(), room.code, 'Cleo');
    expect(sockets[1].sent.length).toBeGreaterThan(before);
  });

  test('tab joining another room marks its old player offline', () => {
    const first = roomWith('Anna', 'Ben');
    const second = roomWith('Dora');
    handleJoinRoom(first.sockets[1], second.room.code, 'Ben');
    expect(getPlayer(first.room.game, first.sessions[1].playerId)?.connected).toBe(false);
  });

  test('restored lobby drops players who never come back', async () => {
    const { room, sessions } = roomWith('Anna', 'Ben');
    room.game.timeouts.lobbyLeaveMs = 10;
    for (const p of room.game.players) p.connected = false;
    handleReconnect(fakeWs(), room.code, sessions[0].playerId, sessions[0].token);

    resumeLobbyLeave(room);
    await Bun.sleep(25);
    expect(room.game.players.map((p) => p.id)).toEqual([sessions[0].playerId]);
  });

  test('reconnect asks only active players to answer an einigung', () => {
    const { room, sockets, sessions } = roomWith('Anna', 'Ben', 'Cleo');
    handleStartGame(sockets[0]);
    getPlayer(room.game, sessions[2].playerId)!.lives = 0;
    handleRequestRedeal(sockets[0]);
    expect(room.game.state).toBe('redeal_pending');

    const cleo = fakeWs();
    handleReconnect(cleo, room.code, sessions[2].playerId, sessions[2].token);
    expect(lastOfType(cleo, 'redeal_response_needed')).toBeUndefined();
    expect(lastOfType(cleo, 'game_state')?.state.redealRequester).toBe(sessions[0].playerId);
  });
});

describe('leaving', () => {
  test('player who leaves the results page does not survive the revanche', () => {
    const { room, sockets, sessions } = roomWith('Anna', 'Ben', 'Cleo');
    room.game.state = 'game_over';
    handleLeaveRoom(sockets[1]);
    expect(getPlayer(room.game, sessions[1].playerId)?.connected).toBe(false);
    expect(lastOfType(sockets[0], 'player_left')?.playerId).toBe(sessions[1].playerId);

    handleRestartGame(sockets[0]);
    expect(room.game.players.map((p) => p.name)).toEqual(['Anna', 'Cleo']);
  });
});
