import type { ServerWebSocket } from 'bun';
import type { Card, RoundResult } from '@klopf/shared';
import { INITIAL_LIVES } from '@klopf/shared';
import type { WsData } from '../handler.js';
import type { RoomData } from '../../game/types.js';
import { getRoom, isOwner } from '../../game/room.js';
import {
  startGame, startPlaying, playCard, playRandomCard, setStakes,
  getPlayer, getWinner, toGameStateInfo, getRedealInfo,
} from '../../game/game.js';
import { isAlive } from '../../game/player.js';
import { getPlayerId, getPlayerRoom, getPlayerWs } from '../connections.js';
import { send, sendError, broadcastToRoom, broadcastGameState } from '../broadcast.js';

export function handleStartGame(ws: ServerWebSocket<WsData>): void {
  const playerId = getPlayerId(ws);
  const roomCode = getPlayerRoom(playerId);

  const room = getRoom(roomCode);
  if (!room) { sendError(ws, 'Room not found'); return; }

  if (!isOwner(room, playerId)) {
    sendError(ws, 'Only room owner can start the game');
    return;
  }

  const err = startGame(room.game);
  if (err) { sendError(ws, err); return; }

  room.game.onTimeout = (pId: string) => {
    const player = getPlayer(room.game, pId);
    if (!player) return;
    const cardBefore = [...player.hand];
    const cardId = playRandomCard(room.game, pId);
    if (!cardId) return;
    const playedCard = cardBefore.find((c) => c.id === cardId);
    processCardPlayed(room, pId, playedCard);
  };

  broadcastToRoom(room, { type: 'game_started' });

  for (const player of room.game.players) {
    const pws = getPlayerWs(player.id);
    if (pws) send(pws, { type: 'cards_dealt', cards: player.hand });
  }

  if (room.game.klopf.active) {
    broadcastToRoom(room, {
      type: 'klopf_initiated',
      playerId: room.game.klopf.initiator,
      level: room.game.klopf.level,
    });
  }

  startPlaying(room.game);
  broadcastGameState(room);
}

export function processCardPlayed(room: RoomData, playerId: string, playedCard: Card | undefined): void {
  if (playedCard) {
    broadcastToRoom(room, { type: 'card_played', playerId, card: playedCard });
  }

  if (
    room.game.state === 'trick_complete' ||
    room.game.state === 'round_end' ||
    room.game.state === 'game_over'
  ) {
    const lastTrick = room.game.completedTricks.at(-1);
    if (lastTrick) {
      broadcastToRoom(room, { type: 'trick_won', winnerId: lastTrick.winnerId ?? '' });
    }
  }

  if (room.game.state === 'round_end' || room.game.state === 'dealing') {
    handleRoundEnd(room);
  }

  if (room.game.state === 'game_over') {
    const winner = getWinner(room.game);
    if (winner) {
      const perfectWin = winner.lives === INITIAL_LIVES;
      const playerCount = room.game.players.length;
      let winnings = (playerCount - 1) * room.game.stakes;
      if (perfectWin) winnings *= 2;

      broadcastToRoom(room, {
        type: 'game_over',
        winnerId: winner.id,
        perfectWin,
        stakes: room.game.stakes,
        winnings,
      });
    }
    return;
  }

  broadcastGameState(room);
}

export function handlePlayCard(ws: ServerWebSocket<WsData>, cardId: string): void {
  const playerId = getPlayerId(ws);
  const roomCode = getPlayerRoom(playerId);

  const room = getRoom(roomCode);
  if (!room) { sendError(ws, 'Room not found'); return; }

  const player = getPlayer(room.game, playerId);
  if (!player) { sendError(ws, 'Player not found'); return; }

  const playedCard = player.hand.find((c) => c.id === cardId);

  const err = playCard(room.game, playerId, cardId);
  if (err) { sendError(ws, err); return; }

  processCardPlayed(room, playerId, playedCard);
}

function handleRoundEnd(room: RoomData): void {
  const results: RoundResult[] = room.game.players.map((p) => ({
    playerId: p.id,
    playerName: p.name,
    livesLost: 0,
    livesLeft: p.lives,
    isLoser: false,
  }));

  broadcastToRoom(room, { type: 'round_ended', results });

  if (room.game.state === 'dealing') {
    for (const player of room.game.players) {
      if (isAlive(player)) {
        const pws = getPlayerWs(player.id);
        if (pws) send(pws, { type: 'cards_dealt', cards: player.hand });
      }
    }
    startPlaying(room.game);
  }
}

export function handleSetStakes(ws: ServerWebSocket<WsData>, stakes: number): void {
  const playerId = getPlayerId(ws);
  const roomCode = getPlayerRoom(playerId);

  const room = getRoom(roomCode);
  if (!room) { sendError(ws, 'Room not found'); return; }

  if (!isOwner(room, playerId)) {
    sendError(ws, 'Only room owner can set stakes');
    return;
  }

  const err = setStakes(room.game, stakes);
  if (err) { sendError(ws, err); return; }

  broadcastGameState(room);
}
