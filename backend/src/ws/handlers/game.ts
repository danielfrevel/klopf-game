import type { ServerWebSocket } from 'bun';
import type { Card } from '@klopf/shared';
import { INITIAL_LIVES } from '@klopf/shared';
import type { WsData } from '../handler.js';
import type { RoomData } from '../../game/types.js';
import {
  startGame, playCard, playRandomCard, setStakes, getPlayer, getWinner, activePlayers, revealCards, restartGame,
} from '../../game/game.js';
import { sendError, sendToPlayer, broadcastToRoom, commitRoom } from '../broadcast.js';
import { hostRoom, senderRoom } from '../context.js';
import { log } from '../../utils/logger.js';

export function attachRoomCallbacks(room: RoomData): void {
  room.game.onTimeout = (playerId: string) => {
    const player = getPlayer(room.game, playerId);
    if (!player) return;
    const handBefore = [...player.hand];
    const cardId = playRandomCard(room.game, playerId);
    if (!cardId) return;
    processCardPlayed(room, playerId, handBefore.find((c) => c.id === cardId));
  };
  room.game.onPhaseExpired = (kind) => {
    if (kind === 'klopf') broadcastToRoom(room, { type: 'klopf_resolved', level: room.game.klopf.level });
    if (kind === 'redeal') broadcastToRoom(room, { type: 'redeal_declined' });
    finishAction(room);
  };
}

export function sendCards(room: RoomData): void {
  for (const player of room.game.players) {
    sendToPlayer(player.id, { type: 'cards_dealt', cards: player.hand });
  }
}

export function notifyKlopf(room: RoomData): void {
  const { initiator, level } = room.game.klopf;
  broadcastToRoom(room, { type: 'klopf_initiated', playerId: initiator, level });
  for (const player of activePlayers(room.game)) {
    if (player.id !== initiator) sendToPlayer(player.id, { type: 'klopf_response_needed', level });
  }
}

export function finishAction(room: RoomData): void {
  const game = room.game;
  if (game.lastRoundResults) {
    broadcastToRoom(room, { type: 'round_ended', results: game.lastRoundResults.results });
    game.lastRoundResults = undefined;
    if (game.state !== 'game_over') {
      sendCards(room);
      if (game.state === 'klopf_pending') notifyKlopf(room);
    }
  }

  if (game.state === 'game_over') {
    broadcastGameOver(room);
    return;
  }

  commitRoom(room);
}

export function handleStartGame(ws: ServerWebSocket<WsData>): void {
  const ctx = hostRoom(ws, 'start the game');
  if (!ctx) return;
  const { room } = ctx;

  const err = startGame(room.game);
  if (err) { sendError(ws, err); return; }

  attachRoomCallbacks(room);
  broadcastToRoom(room, { type: 'game_started' });
  sendCards(room);
  if (room.game.state === 'klopf_pending') notifyKlopf(room);
  commitRoom(room);
}

export function handleRevealCards(ws: ServerWebSocket<WsData>): void {
  const ctx = senderRoom(ws);
  if (!ctx) return;
  const { playerId, room } = ctx;

  const err = revealCards(room.game, playerId);
  if (err) { sendError(ws, err); return; }

  commitRoom(room);
}

export function processCardPlayed(room: RoomData, playerId: string, playedCard: Card | undefined): void {
  if (playedCard) {
    broadcastToRoom(room, { type: 'card_played', playerId, card: playedCard });
  }
  finishAction(room);
}

export function broadcastGameOver(room: RoomData): void {
  const winner = getWinner(room.game);
  if (winner) {
    const perfectWin = winner.lives === INITIAL_LIVES;
    const playerCount = room.game.players.length;
    let winnings = (playerCount - 1) * room.game.stakes;
    if (perfectWin) winnings *= 2;

    log.game.info(`Game over! Winner: ${winner.name}, winnings: ${winnings}`);
    broadcastToRoom(room, {
      type: 'game_over',
      winnerId: winner.id,
      perfectWin,
      stakes: room.game.stakes,
      winnings,
    });
  }
  commitRoom(room);
}

export function handlePlayCard(ws: ServerWebSocket<WsData>, cardId: string): void {
  const ctx = senderRoom(ws);
  if (!ctx) return;
  const { playerId, room } = ctx;

  const player = getPlayer(room.game, playerId);
  if (!player) { sendError(ws, 'Player not found'); return; }

  const playedCard = player.hand.find((c) => c.id === cardId);

  const err = playCard(room.game, playerId, cardId);
  if (err) { sendError(ws, err); return; }

  processCardPlayed(room, playerId, playedCard);
}

export function handleRestartGame(ws: ServerWebSocket<WsData>): void {
  const ctx = hostRoom(ws, 'start a revanche');
  if (!ctx) return;
  const { room } = ctx;

  const err = restartGame(room.game);
  if (err) { sendError(ws, err); return; }

  commitRoom(room);
}

export function handleSetStakes(ws: ServerWebSocket<WsData>, stakes: number): void {
  const ctx = hostRoom(ws, 'set stakes');
  if (!ctx) return;
  const { room } = ctx;

  const err = setStakes(room.game, stakes);
  if (err) { sendError(ws, err); return; }

  commitRoom(room);
}
