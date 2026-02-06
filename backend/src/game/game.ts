import type { GameStateInfo, RoundResult } from '@klopf/shared';
import {
  MIN_PLAYERS,
  MAX_PLAYERS,
  CARDS_PER_PLAYER,
  MAX_REDEALS,
  TRICKS_PER_ROUND,
  DEFAULT_STAKES,
} from '@klopf/shared';
import type { GameData, PlayerState } from './types.js';
import { createPlayer, hasCard, removeCard, getCardsOfSuit, isAlive, loseLives, toPlayerInfo } from './player.js';
import { createDeck, shuffleDeck, dealCards } from './deck.js';
import { createTrick, addCardToTrick, isTrickComplete, determineTrickWinner, toTrickInfo } from './trick.js';
import {
  createKlopfData, resetKlopf, resetKlopfForNewGame, initiateKlopf,
  respondKlopf, allKlopfResponded, getKlopfPenalty, isKlopfParticipant,
  toKlopfStateInfo, KlopfErrors,
} from './klopf.js';

export const GameErrors = {
  NOT_ENOUGH_PLAYERS: 'Not enough players',
  TOO_MANY_PLAYERS: 'Too many players',
  GAME_ALREADY_STARTED: 'Game already started',
  WRONG_STATE: 'Wrong game state',
  NOT_YOUR_TURN: 'Not your turn',
  CARD_NOT_IN_HAND: 'Card not in hand',
  MUST_FOLLOW_SUIT: 'Must follow suit if possible',
  PLAYER_NOT_FOUND: 'Player not found',
  REDEAL_LIMIT_REACHED: 'Redeal limit reached',
  REDEAL_NOT_ALLOWED: 'Redeal only allowed with 2 players',
  ALREADY_REQUESTED_REDEAL: 'Already requested redeal',
} as const;

const TURN_TIMEOUT_MS = 60_000;

export function createGame(): GameData {
  return {
    state: 'lobby',
    players: [],
    currentPlayerIndex: 0,
    currentTrick: null,
    completedTricks: [],
    trickNumber: 0,
    klopf: createKlopfData(),
    roundNumber: 0,
    stakes: DEFAULT_STAKES,
    redealCount: 0,
    redealRequester: '',
    redealResponses: new Map(),
    turnTimer: null,
    onTimeout: undefined,
  };
}

export function addPlayer(game: GameData, player: PlayerState): string | null {
  if (game.state !== 'lobby') return GameErrors.GAME_ALREADY_STARTED;
  if (game.players.length >= MAX_PLAYERS) return GameErrors.TOO_MANY_PLAYERS;
  game.players.push(player);
  return null;
}

export function removePlayer(game: GameData, playerId: string): void {
  const index = game.players.findIndex((p) => p.id === playerId);
  if (index !== -1) game.players.splice(index, 1);
}

export function getPlayer(game: GameData, playerId: string): PlayerState | undefined {
  return game.players.find((p) => p.id === playerId);
}

export function getAlivePlayers(game: GameData): PlayerState[] {
  return game.players.filter((p) => isAlive(p));
}

function countAlivePlayers(game: GameData): number {
  return game.players.filter((p) => isAlive(p)).length;
}

export function startGame(game: GameData): string | null {
  if (game.state !== 'lobby') return GameErrors.GAME_ALREADY_STARTED;
  if (game.players.length < MIN_PLAYERS) return GameErrors.NOT_ENOUGH_PLAYERS;

  game.state = 'dealing';
  resetKlopfForNewGame(game.klopf);
  startRound(game);
  return null;
}

function startRound(game: GameData): void {
  game.roundNumber++;
  game.trickNumber = 0;
  game.completedTricks = [];
  resetKlopf(game.klopf);

  const deck = createDeck();
  shuffleDeck(deck);

  let autoKlopfInitiated = false;
  for (const player of game.players) {
    if (isAlive(player)) {
      player.hasSeenCards = true;
      player.hand = dealCards(deck, CARDS_PER_PLAYER);

      if (player.lives === 1) {
        player.mustMitgehen = true;
        if (!autoKlopfInitiated) {
          initiateKlopf(game.klopf, player.id);
          autoKlopfInitiated = true;
        }
      } else {
        player.mustMitgehen = false;
      }
    }
  }

  game.currentTrick = createTrick();
  game.state = 'dealing';

  if (game.klopf.active) {
    game.state = 'klopf_pending';
  }
}

export function startPlaying(game: GameData): void {
  if (game.state === 'dealing' || game.state === 'klopf_pending') {
    game.state = 'playing';
    game.trickNumber = 1;
    startPlayerTimer(game);
  }
}

export function blindDrei(game: GameData, playerId: string): string | null {
  if (game.state !== 'dealing') return GameErrors.WRONG_STATE;

  const player = getPlayer(game, playerId);
  if (!player) return GameErrors.PLAYER_NOT_FOUND;
  if (!player.hasSeenCards) return 'Already declared blind';

  player.hasSeenCards = false;
  game.klopf.level = 2;
  initiateKlopf(game.klopf, playerId);
  game.state = 'klopf_pending';

  return null;
}

export function initiateGameKlopf(game: GameData, playerId: string): string | null {
  if (game.state !== 'playing' && game.state !== 'dealing') return GameErrors.WRONG_STATE;

  const player = getPlayer(game, playerId);
  if (!player) return GameErrors.PLAYER_NOT_FOUND;

  const newLevel = game.klopf.level + 1;
  if (newLevel > player.lives + 1) return KlopfErrors.KLOPF_LIMIT_EXCEEDED;

  const err = initiateKlopf(game.klopf, playerId);
  if (err) return err;

  cancelPlayerTimer(game);
  game.state = 'klopf_pending';
  return null;
}

export function respondToGameKlopf(game: GameData, playerId: string, mitgehen: boolean): string | null {
  if (game.state !== 'klopf_pending') return GameErrors.WRONG_STATE;

  const player = getPlayer(game, playerId);
  if (!player) return GameErrors.PLAYER_NOT_FOUND;

  const err = respondKlopf(game.klopf, playerId, mitgehen, player.mustMitgehen);
  if (err) return err;

  if (!mitgehen) {
    loseLives(player, 1);
  }

  const aliveIds = game.players.filter((p) => isAlive(p)).map((p) => p.id);
  if (allKlopfResponded(game.klopf, aliveIds)) {
    game.state = 'playing';
    startPlayerTimer(game);
  }

  return null;
}

export function playCard(game: GameData, playerId: string, cardId: string): string | null {
  if (game.state !== 'playing') return GameErrors.WRONG_STATE;

  const currentPlayer = getCurrentPlayer(game);
  if (!currentPlayer || currentPlayer.id !== playerId) return GameErrors.NOT_YOUR_TURN;
  if (!hasCard(currentPlayer, cardId)) return GameErrors.CARD_NOT_IN_HAND;

  const cardToPlay = currentPlayer.hand.find((c) => c.id === cardId);
  if (!cardToPlay) return GameErrors.CARD_NOT_IN_HAND;

  if (game.currentTrick && game.currentTrick.cards.length > 0) {
    const leadSuit = game.currentTrick.leadSuit;
    if (leadSuit) {
      const suitCards = getCardsOfSuit(currentPlayer, leadSuit as any);
      if (suitCards.length > 0 && cardToPlay.suit !== leadSuit) {
        return GameErrors.MUST_FOLLOW_SUIT;
      }
    }
  }

  const card = removeCard(currentPlayer, cardId);
  if (!card || !game.currentTrick) return GameErrors.CARD_NOT_IN_HAND;

  addCardToTrick(game.currentTrick, playerId, card);
  cancelPlayerTimer(game);

  const aliveCount = countAlivePlayers(game);
  if (isTrickComplete(game.currentTrick, aliveCount)) {
    completeTrick(game);
  } else {
    advanceToNextPlayer(game);
    startPlayerTimer(game);
  }

  return null;
}

export function playRandomCard(game: GameData, playerId: string): string | null {
  const player = getPlayer(game, playerId);
  if (!player || player.hand.length === 0) return null;

  let validCards = player.hand;
  if (game.currentTrick && game.currentTrick.cards.length > 0) {
    const leadSuit = game.currentTrick.leadSuit;
    if (leadSuit) {
      const suitCards = getCardsOfSuit(player, leadSuit as any);
      if (suitCards.length > 0) validCards = suitCards;
    }
  }

  const card = validCards[Math.floor(Math.random() * validCards.length)];
  const err = playCard(game, playerId, card.id);
  return err ? null : card.id;
}

function completeTrick(game: GameData): void {
  if (!game.currentTrick) return;

  const winnerId = determineTrickWinner(game.currentTrick);
  game.state = 'trick_complete';
  game.completedTricks.push(game.currentTrick);

  if (game.trickNumber >= TRICKS_PER_ROUND) {
    endRound(game, winnerId);
  } else {
    const winnerIndex = game.players.findIndex((p) => p.id === winnerId);
    if (winnerIndex !== -1) game.currentPlayerIndex = winnerIndex;

    game.trickNumber++;
    game.currentTrick = createTrick();
    game.state = 'playing';
    startPlayerTimer(game);
  }
}

function endRound(game: GameData, loserId: string): void {
  game.state = 'round_end';

  const loser = getPlayer(game, loserId);
  if (!loser) return;

  let penalty = 1;
  if (game.klopf.active && isKlopfParticipant(game.klopf, loserId)) {
    penalty = getKlopfPenalty(game.klopf);
  }

  loseLives(loser, penalty);

  const aliveCount = countAlivePlayers(game);
  if (aliveCount <= 1) {
    game.state = 'game_over';
    return;
  }

  startRound(game);
}

function advanceToNextPlayer(game: GameData): void {
  const startIdx = game.currentPlayerIndex;
  do {
    game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length;
    if (isAlive(game.players[game.currentPlayerIndex])) break;
  } while (game.currentPlayerIndex !== startIdx);
}

export function getCurrentPlayer(game: GameData): PlayerState | undefined {
  if (game.currentPlayerIndex < 0 || game.currentPlayerIndex >= game.players.length) return undefined;
  return game.players[game.currentPlayerIndex];
}

export function getCurrentPlayerId(game: GameData): string {
  return getCurrentPlayer(game)?.id ?? '';
}

export function getWinner(game: GameData): PlayerState | undefined {
  if (game.state !== 'game_over') return undefined;
  return game.players.find((p) => isAlive(p));
}

export function setStakes(game: GameData, stakes: number): string | null {
  if (game.state !== 'lobby') return GameErrors.WRONG_STATE;
  game.stakes = Math.max(0, stakes);
  return null;
}

export function requestRedeal(game: GameData, playerId: string): string | null {
  if (game.state !== 'dealing') return GameErrors.WRONG_STATE;
  if (countAlivePlayers(game) !== 2) return GameErrors.REDEAL_NOT_ALLOWED;
  if (game.redealCount >= MAX_REDEALS) return GameErrors.REDEAL_LIMIT_REACHED;
  if (game.redealRequester === playerId) return GameErrors.ALREADY_REQUESTED_REDEAL;

  game.redealRequester = playerId;
  game.redealResponses = new Map();
  game.state = 'redeal_pending';
  return null;
}

export function respondToRedeal(game: GameData, playerId: string, agree: boolean): string | null {
  if (game.state !== 'redeal_pending') return GameErrors.WRONG_STATE;
  if (playerId === game.redealRequester) return null;

  game.redealResponses.set(playerId, agree);

  if (agree) {
    game.redealCount++;
    performRedeal(game);
  } else {
    game.redealRequester = '';
    game.redealResponses = new Map();
    game.state = 'dealing';
  }

  return null;
}

function performRedeal(game: GameData): void {
  resetKlopf(game.klopf);

  const deck = createDeck();
  shuffleDeck(deck);

  let autoKlopfInitiated = false;
  for (const player of game.players) {
    if (isAlive(player)) {
      player.hand = dealCards(deck, CARDS_PER_PLAYER);
      player.hasSeenCards = true;
      if (player.lives === 1) {
        player.mustMitgehen = true;
        if (!autoKlopfInitiated) {
          initiateKlopf(game.klopf, player.id);
          autoKlopfInitiated = true;
        }
      } else {
        player.mustMitgehen = false;
      }
    }
  }

  game.currentTrick = createTrick();
  game.redealRequester = '';
  game.redealResponses = new Map();
  game.state = 'dealing';

  if (game.klopf.active) {
    game.state = 'klopf_pending';
  }
}

export function getRedealInfo(game: GameData): { requester: string; count: number; maxRedeals: number } {
  return { requester: game.redealRequester, count: game.redealCount, maxRedeals: MAX_REDEALS };
}

function startPlayerTimer(game: GameData): void {
  const currentPlayer = getCurrentPlayer(game);
  if (!currentPlayer) return;

  cancelPlayerTimer(game);

  game.turnTimer = setTimeout(() => {
    if (game.onTimeout) {
      game.onTimeout(currentPlayer.id);
    } else {
      playRandomCard(game, currentPlayer.id);
    }
  }, TURN_TIMEOUT_MS);
}

function cancelPlayerTimer(game: GameData): void {
  if (game.turnTimer) {
    clearTimeout(game.turnTimer);
    game.turnTimer = null;
  }
}

export function toGameStateInfo(game: GameData): GameStateInfo {
  const alivePlayers = getAlivePlayers(game).map((p) => ({ id: p.id, name: p.name }));
  return {
    state: game.state,
    players: game.players.map((p) => toPlayerInfo(p)),
    currentPlayerId: getCurrentPlayerId(game),
    trickNumber: game.trickNumber,
    roundNumber: game.roundNumber,
    stakes: game.stakes,
    redealCount: game.redealCount,
    maxRedeals: MAX_REDEALS,
    currentTrick: game.currentTrick ? toTrickInfo(game.currentTrick) : undefined,
    klopf: game.klopf.active ? toKlopfStateInfo(game.klopf, alivePlayers) : undefined,
    completedTricks: game.completedTricks.map((t) => ({
      cards: t.cards,
      leadSuit: t.leadSuit,
      winnerId: t.winnerId ?? '',
    })),
  };
}
