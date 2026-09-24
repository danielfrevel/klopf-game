import type { Card, GameStateInfo, RoundResult } from '@klopf/shared';
import {
  INITIAL_LIVES,
  MIN_PLAYERS,
  MAX_PLAYERS,
  CARDS_PER_PLAYER,
  MAX_REDEALS,
  TRICKS_PER_ROUND,
  DEFAULT_STAKES,
} from '@klopf/shared';
import type { GameData, GameTimeouts, PhaseKind, PlayerState, TrickState } from './types.js';
import { hasCard, removeCard, getCardsOfSuit, isAlive, isActive, loseLives, toPlayerInfo } from './player.js';
import { createDeck, shuffleDeck, dealCards } from './deck.js';
import { createTrick, addCardToTrick, isTrickComplete, determineTrickWinner, toTrickInfo } from './trick.js';
import {
  createKlopfData, resetKlopf, initiateKlopf, respondKlopf, allKlopfResponded,
  getDeclinePenalty, getLosePenalty, toKlopfStateInfo,
} from './klopf.js';
import { log } from '../utils/logger.js';

export const GameErrors = {
  NOT_ENOUGH_PLAYERS: 'Not enough players',
  TOO_MANY_PLAYERS: 'Too many players',
  NAME_TAKEN: 'Name already taken',
  GAME_ALREADY_STARTED: 'Game already started',
  WRONG_STATE: 'Wrong game state',
  NOT_YOUR_TURN: 'Not your turn',
  CARD_NOT_IN_HAND: 'Card not in hand',
  MUST_FOLLOW_SUIT: 'Must follow suit if possible',
  PLAYER_NOT_FOUND: 'Player not found',
  PLAYER_NOT_ACTIVE: 'Player is not active in this round',
  OWN_KLOPF: 'Cannot respond to own klopf',
  OWN_REDEAL: 'Cannot respond to own redeal request',
  KLOPF_LIMIT: 'Klopf level may not exceed own lives',
  ALREADY_REVEALED: 'Cards already revealed',
  REDEAL_LIMIT_REACHED: 'Redeal limit reached',
  REDEAL_NOT_ALLOWED: 'Redeal only allowed with 2 players',
  ALREADY_REQUESTED_REDEAL: 'Already requested redeal',
} as const;

export const DEFAULT_TIMEOUTS: GameTimeouts = {
  turnMs: 60_000,
  dealingMs: 30_000,
  responseMs: 30_000,
  lobbyLeaveMs: 60_000,
};

export function createGame(timeouts: GameTimeouts = DEFAULT_TIMEOUTS): GameData {
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
    turnTimer: null,
    phaseTimer: null,
    phaseEndsAt: null,
    dealingRemainingMs: null,
    timeouts: { ...timeouts },
    onTimeout: undefined,
    onPhaseExpired: undefined,
    lastRoundResults: undefined,
  };
}

export function addPlayer(game: GameData, player: PlayerState): string | null {
  if (game.state !== 'lobby') return GameErrors.GAME_ALREADY_STARTED;
  if (game.players.length >= MAX_PLAYERS) return GameErrors.TOO_MANY_PLAYERS;
  const name = player.name.toLowerCase();
  if (game.players.some((p) => p.name.toLowerCase() === name)) return GameErrors.NAME_TAKEN;
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

export function getHostId(game: GameData): string {
  return (game.players.find((p) => p.connected) ?? game.players[0])?.id ?? '';
}

export function getAlivePlayers(game: GameData): PlayerState[] {
  return game.players.filter(isAlive);
}

export function activePlayers(game: GameData): PlayerState[] {
  return game.players.filter(isActive);
}

function activeIds(game: GameData): string[] {
  return activePlayers(game).map((p) => p.id);
}

export function startGame(game: GameData): string | null {
  if (game.state !== 'lobby') return GameErrors.GAME_ALREADY_STARTED;
  if (game.players.length < MIN_PLAYERS) return GameErrors.NOT_ENOUGH_PLAYERS;

  startRound(game, game.players[0].id);
  return null;
}

function dealHands(game: GameData): void {
  const deck = createDeck();
  shuffleDeck(deck);

  for (const player of game.players) {
    resetPlayerForRound(player);
    player.mustMitgehen = player.lives === 1;
    player.hand = isAlive(player) ? dealCards(deck, CARDS_PER_PLAYER) : [];
  }
  game.currentTrick = createTrick();
}

function resetPlayerForRound(player: PlayerState): void {
  player.folded = false;
  player.revealed = false;
  player.roundLivesLost = 0;
  player.mustMitgehen = false;
  player.hand = [];
}

function tryAutoKlopf(game: GameData): boolean {
  const player = game.players.find((p) => isAlive(p) && p.lives === 1 && !p.autoKlopfDone);
  if (!player) return false;

  const err = initiateKlopf(game.klopf, player.id);
  if (err) {
    log.klopf.error(`Auto-klopf for ${player.name} failed: ${err}`);
    return false;
  }
  player.autoKlopfDone = true;
  game.state = 'klopf_pending';
  startResponseTimer(game);
  return true;
}

function startRound(game: GameData, leaderId: string): void {
  game.roundNumber++;
  log.game.info(`Starting round ${game.roundNumber}`);
  game.trickNumber = 0;
  game.completedTricks = [];
  game.redealCount = 0;
  resetKlopf(game.klopf);
  dealHands(game);

  const leaderIndex = game.players.findIndex((p) => p.id === leaderId && isAlive(p));
  game.currentPlayerIndex = leaderIndex !== -1 ? leaderIndex : game.players.findIndex(isAlive);

  if (!tryAutoKlopf(game)) beginDealing(game);
}

function beginDealing(game: GameData, remainingMs = game.timeouts.dealingMs): void {
  game.state = 'dealing';
  startPhaseTimer(game, remainingMs, 'dealing', () => {
    if (game.state === 'dealing') startPlaying(game);
  });
}

export function revealCards(game: GameData, playerId: string): string | null {
  if (game.state !== 'dealing') return GameErrors.WRONG_STATE;

  const player = getPlayer(game, playerId);
  if (!player) return GameErrors.PLAYER_NOT_FOUND;
  if (!isActive(player)) return GameErrors.PLAYER_NOT_ACTIVE;
  if (player.revealed) return GameErrors.ALREADY_REVEALED;

  player.revealed = true;
  if (activePlayers(game).every((p) => p.revealed)) startPlaying(game);
  return null;
}

export function startPlaying(game: GameData): void {
  cancelPhaseTimer(game);
  for (const player of activePlayers(game)) player.revealed = true;
  game.state = 'playing';
  game.trickNumber = 1;
  startPlayerTimer(game);
}

export function blindDrei(game: GameData, playerId: string): string | null {
  if (game.state !== 'dealing') return GameErrors.WRONG_STATE;

  const player = getPlayer(game, playerId);
  if (!player) return GameErrors.PLAYER_NOT_FOUND;
  if (!isActive(player)) return GameErrors.PLAYER_NOT_ACTIVE;
  if (player.revealed) return GameErrors.ALREADY_REVEALED;
  if (player.lives < 3) return GameErrors.KLOPF_LIMIT;

  const previousLevel = game.klopf.level;
  game.klopf.level = 2;
  const err = initiateKlopf(game.klopf, playerId);
  if (err) {
    game.klopf.level = previousLevel;
    return err;
  }

  game.state = 'klopf_pending';
  startResponseTimer(game);
  return null;
}

export function initiateGameKlopf(game: GameData, playerId: string): string | null {
  if (game.state !== 'playing' && game.state !== 'dealing') return GameErrors.WRONG_STATE;

  const player = getPlayer(game, playerId);
  if (!player) return GameErrors.PLAYER_NOT_FOUND;
  if (!isActive(player)) return GameErrors.PLAYER_NOT_ACTIVE;
  if (game.klopf.level + 1 > player.lives) return GameErrors.KLOPF_LIMIT;

  const err = initiateKlopf(game.klopf, playerId);
  if (err) return err;

  cancelPlayerTimer(game);
  game.state = 'klopf_pending';
  startResponseTimer(game);
  return null;
}

function startResponseTimer(game: GameData, ms = game.timeouts.responseMs): void {
  startPhaseTimer(game, ms, 'klopf', () => {
    if (game.state !== 'klopf_pending') return;
    const round = game.roundNumber;
    for (const player of activePlayers(game)) {
      if (game.state !== 'klopf_pending' || game.roundNumber !== round) return;
      if (player.id === game.klopf.initiator || game.klopf.responses.has(player.id)) continue;
      respondToGameKlopf(game, player.id, player.mustMitgehen);
    }
  });
}

export function respondToGameKlopf(game: GameData, playerId: string, mitgehen: boolean): string | null {
  if (game.state !== 'klopf_pending') return GameErrors.WRONG_STATE;

  const player = getPlayer(game, playerId);
  if (!player) return GameErrors.PLAYER_NOT_FOUND;
  if (!isActive(player)) return GameErrors.PLAYER_NOT_ACTIVE;
  if (playerId === game.klopf.initiator) return GameErrors.OWN_KLOPF;

  const err = respondKlopf(game.klopf, playerId, mitgehen, player.mustMitgehen);
  if (err) return err;

  if (!mitgehen) {
    const lost = loseLives(player, getDeclinePenalty(game.klopf));
    player.folded = true;
    log.klopf.info(`${player.name} folded, lost ${lost} lives (${player.lives} left)`);
  }

  const active = activePlayers(game);
  if (active.length === 1) {
    endRound(game, active[0].id);
  } else if (allKlopfResponded(game.klopf, active.map((p) => p.id))) {
    resumeAfterKlopf(game);
  }

  return null;
}

function resumeAfterKlopf(game: GameData): void {
  cancelPhaseTimer(game);
  if (game.trickNumber === 0) {
    startPlaying(game);
    return;
  }

  game.state = 'playing';
  if (game.currentTrick && isTrickComplete(game.currentTrick, activeIds(game))) {
    completeTrick(game);
    return;
  }
  const current = getCurrentPlayer(game);
  if (!current || !isActive(current)) advanceToNextPlayer(game);
  startPlayerTimer(game);
}

export function playCard(game: GameData, playerId: string, cardId: string): string | null {
  if (game.state !== 'playing') return GameErrors.WRONG_STATE;

  const player = getPlayer(game, playerId);
  if (!player) return GameErrors.PLAYER_NOT_FOUND;
  if (!isActive(player)) return GameErrors.PLAYER_NOT_ACTIVE;
  if (getCurrentPlayerId(game) !== playerId) return GameErrors.NOT_YOUR_TURN;
  if (!hasCard(player, cardId) || !game.currentTrick) return GameErrors.CARD_NOT_IN_HAND;

  const trick = game.currentTrick;
  if (!playableCards(player, trick).some((c) => c.id === cardId)) return GameErrors.MUST_FOLLOW_SUIT;

  addCardToTrick(trick, playerId, removeCard(player, cardId)!);
  cancelPlayerTimer(game);

  if (isTrickComplete(trick, activeIds(game))) {
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

  const validCards = game.currentTrick ? playableCards(player, game.currentTrick) : player.hand;
  const card = validCards[Math.floor(Math.random() * validCards.length)];
  const err = playCard(game, playerId, card.id);
  return err ? null : card.id;
}

function playableCards(player: PlayerState, trick: TrickState): Card[] {
  if (trick.cards.length === 0 || !trick.leadSuit) return player.hand;
  const suitCards = getCardsOfSuit(player, trick.leadSuit);
  return suitCards.length > 0 ? suitCards : player.hand;
}

function completeTrick(game: GameData): void {
  if (!game.currentTrick) return;

  const winnerId = determineTrickWinner(game.currentTrick, activeIds(game));
  game.completedTricks.push(game.currentTrick);
  log.game.info(`Trick ${game.trickNumber} complete, winner: ${winnerId}`);

  if (game.trickNumber >= TRICKS_PER_ROUND) {
    endRound(game, winnerId);
    return;
  }

  game.currentPlayerIndex = game.players.findIndex((p) => p.id === winnerId);
  game.trickNumber++;
  game.currentTrick = createTrick();
  game.state = 'playing';
  startPlayerTimer(game);
}

function endRound(game: GameData, winnerId: string): void {
  cancelAllTimers(game);
  game.state = 'round_end';

  const losePenalty = game.klopf.active ? getLosePenalty(game.klopf) : 1;
  const results: RoundResult[] = [];

  for (const player of game.players) {
    if (!isAlive(player) && player.roundLivesLost === 0) continue;

    const isWinner = player.id === winnerId;
    if (!isWinner && !player.folded) loseLives(player, losePenalty);
    results.push({
      playerId: player.id,
      playerName: player.name,
      livesLost: player.roundLivesLost,
      livesLeft: player.lives,
      isLoser: !isWinner,
      folded: player.folded,
    });
  }

  game.lastRoundResults = { winnerId, results };
  log.game.info(`Round ${game.roundNumber} ended, winner: ${winnerId}`, { results });

  if (getAlivePlayers(game).length <= 1) {
    game.state = 'game_over';
    return;
  }

  startRound(game, winnerId);
}

function advanceToNextPlayer(game: GameData): void {
  const startIdx = game.currentPlayerIndex;
  do {
    game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length;
    if (isActive(game.players[game.currentPlayerIndex])) break;
  } while (game.currentPlayerIndex !== startIdx);
}

export function getCurrentPlayer(game: GameData): PlayerState | undefined {
  return game.players[game.currentPlayerIndex];
}

export function getCurrentPlayerId(game: GameData): string {
  return getCurrentPlayer(game)?.id ?? '';
}

export function getWinner(game: GameData): PlayerState | undefined {
  if (game.state !== 'game_over') return undefined;
  return game.players.find(isAlive);
}

export function restartGame(game: GameData): string | null {
  if (game.state !== 'game_over') return GameErrors.WRONG_STATE;

  cancelAllTimers(game);
  const players = game.players.filter((p) => p.connected);
  for (const player of players) {
    resetPlayerForRound(player);
    player.lives = INITIAL_LIVES;
    player.autoKlopfDone = false;
  }
  const { stakes, onTimeout, onPhaseExpired } = game;
  Object.assign(game, createGame(game.timeouts), { players, stakes, onTimeout, onPhaseExpired });
  return null;
}

export function setStakes(game: GameData, stakes: number): string | null {
  if (game.state !== 'lobby') return GameErrors.WRONG_STATE;
  game.stakes = Math.max(0, stakes);
  return null;
}

export function requestRedeal(game: GameData, playerId: string): string | null {
  if (game.state !== 'dealing') return GameErrors.WRONG_STATE;
  if (activePlayers(game).length !== 2) return GameErrors.REDEAL_NOT_ALLOWED;
  if (game.redealCount >= MAX_REDEALS) return GameErrors.REDEAL_LIMIT_REACHED;
  if (game.redealRequester === playerId) return GameErrors.ALREADY_REQUESTED_REDEAL;

  game.dealingRemainingMs = Math.max(0, (game.phaseEndsAt ?? Date.now()) - Date.now());
  game.redealRequester = playerId;
  game.state = 'redeal_pending';
  startRedealTimer(game);
  return null;
}

function startRedealTimer(game: GameData, ms = game.timeouts.responseMs): void {
  startPhaseTimer(game, ms, 'redeal', () => {
    if (game.state !== 'redeal_pending') return;
    const other = activePlayers(game).find((p) => p.id !== game.redealRequester);
    if (other) respondToRedeal(game, other.id, false);
  });
}

export function respondToRedeal(game: GameData, playerId: string, agree: boolean): string | null {
  if (game.state !== 'redeal_pending') return GameErrors.WRONG_STATE;
  if (playerId === game.redealRequester) return GameErrors.OWN_REDEAL;
  const player = getPlayer(game, playerId);
  if (!player) return GameErrors.PLAYER_NOT_FOUND;
  if (!isActive(player)) return GameErrors.PLAYER_NOT_ACTIVE;

  const remainingMs = game.dealingRemainingMs ?? game.timeouts.dealingMs;
  game.dealingRemainingMs = null;
  game.redealRequester = '';

  if (agree) {
    game.redealCount++;
    resetKlopf(game.klopf);
    dealHands(game);
    beginDealing(game);
  } else {
    beginDealing(game, remainingMs);
  }

  return null;
}

export function getRedealInfo(game: GameData): { requester: string; count: number; maxRedeals: number } {
  return { requester: game.redealRequester, count: game.redealCount, maxRedeals: MAX_REDEALS };
}

export function resumeTimers(game: GameData): void {
  const remainingMs = game.phaseEndsAt === null ? undefined : Math.max(0, game.phaseEndsAt - Date.now());
  switch (game.state) {
    case 'playing': startPlayerTimer(game, remainingMs); break;
    case 'dealing': beginDealing(game, remainingMs); break;
    case 'klopf_pending': startResponseTimer(game, remainingMs); break;
    case 'redeal_pending': startRedealTimer(game, remainingMs); break;
  }
}

function startPlayerTimer(game: GameData, ms = game.timeouts.turnMs): void {
  const currentPlayer = getCurrentPlayer(game);
  if (!currentPlayer) return;

  cancelPlayerTimer(game);
  const playerId = currentPlayer.id;
  game.phaseEndsAt = Date.now() + ms;

  game.turnTimer = setTimeout(() => {
    game.turnTimer = null;
    if (game.state !== 'playing' || getCurrentPlayerId(game) !== playerId) {
      log.game.debug(`Stale turn timer for ${currentPlayer.name} ignored`);
      return;
    }
    log.game.info(`Timer expired for ${currentPlayer.name}, playing random card`);
    if (game.onTimeout) {
      game.onTimeout(playerId);
    } else {
      playRandomCard(game, playerId);
    }
  }, ms);
}

function cancelPlayerTimer(game: GameData): void {
  if (game.turnTimer) {
    clearTimeout(game.turnTimer);
    game.turnTimer = null;
    game.phaseEndsAt = null;
  }
}

function startPhaseTimer(game: GameData, ms: number, kind: PhaseKind, expire: () => void): void {
  cancelPhaseTimer(game);
  game.phaseEndsAt = Date.now() + ms;
  game.phaseTimer = setTimeout(() => {
    game.phaseTimer = null;
    game.phaseEndsAt = null;
    const klopfLevel = game.klopf.level;
    expire();
    game.onPhaseExpired?.(kind, klopfLevel);
  }, ms);
}

function cancelPhaseTimer(game: GameData): void {
  if (game.phaseTimer) {
    clearTimeout(game.phaseTimer);
    game.phaseTimer = null;
    game.phaseEndsAt = null;
  }
}

export function cancelAllTimers(game: GameData): void {
  cancelPlayerTimer(game);
  cancelPhaseTimer(game);
}

export function toGameStateInfo(game: GameData): GameStateInfo {
  return {
    state: game.state,
    players: game.players.map(toPlayerInfo),
    currentPlayerId: getCurrentPlayerId(game),
    trickNumber: game.trickNumber,
    roundNumber: game.roundNumber,
    stakes: game.stakes,
    redealCount: game.redealCount,
    maxRedeals: MAX_REDEALS,
    currentTrick: game.currentTrick ? toTrickInfo(game.currentTrick) : undefined,
    klopf: toKlopfStateInfo(game.klopf, activePlayers(game)),
    completedTricks: game.completedTricks.map((t) => ({
      cards: t.cards,
      leadSuit: t.leadSuit,
      winnerId: t.winnerId ?? '',
    })),
    phaseEndsAt: game.phaseEndsAt,
    hostId: getHostId(game),
    redealRequester: game.redealRequester,
  };
}
