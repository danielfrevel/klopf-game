import type { GameState, GameStateInfo, RoundResult } from '@klopf/shared';
import {
  MIN_PLAYERS,
  MAX_PLAYERS,
  CARDS_PER_PLAYER,
  MAX_REDEALS,
  TRICKS_PER_ROUND,
  DEFAULT_STAKES,
  INITIAL_LIVES,
} from '@klopf/shared';
import { Player } from './player.js';
import { Deck } from './deck.js';
import { Trick } from './trick.js';
import { KlopfState, KlopfErrors } from './klopf.js';

// Error messages
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

const TURN_TIMEOUT_MS = 60_000; // 60 seconds

export class Game {
  state: GameState = 'lobby';
  players: Player[] = [];
  currentPlayerIndex: number = 0;
  deck: Deck | null = null;
  currentTrick: Trick | null = null;
  trickNumber: number = 0;
  klopf: KlopfState;
  roundNumber: number = 0;
  stakes: number = DEFAULT_STAKES;

  // Redeal tracking (Einigung)
  redealCount: number = 0;
  redealRequester: string = '';
  redealResponses: Map<string, boolean> = new Map();

  // Timers
  private turnTimer: ReturnType<typeof setTimeout> | null = null;

  // Callbacks
  onTimeout?: (playerId: string) => void;
  onUpdate?: () => void;

  constructor() {
    this.klopf = new KlopfState();
  }

  // Add a player to the game
  addPlayer(player: Player): string | null {
    if (this.state !== 'lobby') {
      return GameErrors.GAME_ALREADY_STARTED;
    }

    if (this.players.length >= MAX_PLAYERS) {
      return GameErrors.TOO_MANY_PLAYERS;
    }

    this.players.push(player);
    return null;
  }

  // Remove a player from the game
  removePlayer(playerId: string): void {
    const index = this.players.findIndex((p) => p.id === playerId);
    if (index !== -1) {
      this.players.splice(index, 1);
    }
  }

  // Get a player by ID
  getPlayer(playerId: string): Player | undefined {
    return this.players.find((p) => p.id === playerId);
  }

  // Get all alive players
  getAlivePlayers(): Player[] {
    return this.players.filter((p) => p.isAlive());
  }

  // Count alive players
  private countAlivePlayers(): number {
    return this.players.filter((p) => p.isAlive()).length;
  }

  // Start the game
  start(): string | null {
    if (this.state !== 'lobby') {
      return GameErrors.GAME_ALREADY_STARTED;
    }

    if (this.players.length < MIN_PLAYERS) {
      return GameErrors.NOT_ENOUGH_PLAYERS;
    }

    this.state = 'dealing';
    this.klopf.resetForNewGame();
    this.startRound();

    return null;
  }

  // Start a new round
  private startRound(): void {
    this.roundNumber++;
    this.trickNumber = 0;
    this.klopf.reset();

    // Create and shuffle deck
    this.deck = new Deck();
    this.deck.shuffle();

    // Check for 1-life auto-klopf and deal cards
    for (const player of this.players) {
      if (player.isAlive()) {
        player.hasSeenCards = true;
        player.hand = this.deck.deal(CARDS_PER_PLAYER);

        if (player.lives === 1) {
          player.mustMitgehen = true;
          this.klopf.initiate(player.id);
        } else {
          player.mustMitgehen = false;
        }
      }
    }

    this.currentTrick = new Trick();
    this.state = 'dealing';

    // If there's an auto-klopf, go to klopf pending
    if (this.klopf.active) {
      this.state = 'klopf_pending';
    }
  }

  // Transition from dealing to playing
  startPlaying(): void {
    if (this.state === 'dealing' || this.state === 'klopf_pending') {
      this.state = 'playing';
      this.trickNumber = 1;
      this.startPlayerTimer();
    }
  }

  // Blind auf 3 - klopf blind for +3
  blindDrei(playerId: string): string | null {
    if (this.state !== 'dealing') {
      return GameErrors.WRONG_STATE;
    }

    const player = this.getPlayer(playerId);
    if (!player) {
      return GameErrors.PLAYER_NOT_FOUND;
    }

    if (!player.hasSeenCards) {
      return 'Already declared blind';
    }

    player.hasSeenCards = false;
    this.klopf.level = 2; // Will become 3 when klopf is initiated
    this.klopf.initiate(playerId);
    this.state = 'klopf_pending';

    return null;
  }

  // Initiate a klopf
  initiateKlopf(playerId: string): string | null {
    if (this.state !== 'playing' && this.state !== 'dealing') {
      return GameErrors.WRONG_STATE;
    }

    const player = this.getPlayer(playerId);
    if (!player) {
      return GameErrors.PLAYER_NOT_FOUND;
    }

    // Check klopf limit: new level cannot exceed player's lives + 1
    const newLevel = this.klopf.level + 1;
    if (newLevel > player.lives + 1) {
      return KlopfErrors.KLOPF_LIMIT_EXCEEDED;
    }

    const err = this.klopf.initiate(playerId);
    if (err) return err;

    this.cancelPlayerTimer();
    this.state = 'klopf_pending';

    return null;
  }

  // Respond to a klopf
  respondToKlopf(playerId: string, mitgehen: boolean): string | null {
    if (this.state !== 'klopf_pending') {
      return GameErrors.WRONG_STATE;
    }

    const player = this.getPlayer(playerId);
    if (!player) {
      return GameErrors.PLAYER_NOT_FOUND;
    }

    const err = this.klopf.respond(playerId, mitgehen, player.mustMitgehen);
    if (err) return err;

    // If player doesn't mitgehen, they lose 1 life immediately
    if (!mitgehen) {
      player.loseLives(1);
    }

    // Check if all alive players have responded
    const aliveIds = this.players.filter((p) => p.isAlive()).map((p) => p.id);

    if (this.klopf.allResponded(aliveIds)) {
      this.state = 'playing';
      this.startPlayerTimer();
    }

    return null;
  }

  // Play a card
  playCard(playerId: string, cardId: string): string | null {
    if (this.state !== 'playing') {
      return GameErrors.WRONG_STATE;
    }

    // Check if it's this player's turn
    const currentPlayer = this.getCurrentPlayer();
    if (!currentPlayer || currentPlayer.id !== playerId) {
      return GameErrors.NOT_YOUR_TURN;
    }

    // Check if player has the card
    if (!currentPlayer.hasCard(cardId)) {
      return GameErrors.CARD_NOT_IN_HAND;
    }

    // Get the card
    const cardToPlay = currentPlayer.hand.find((c) => c.id === cardId);
    if (!cardToPlay) {
      return GameErrors.CARD_NOT_IN_HAND;
    }

    // Check if must follow suit
    if (this.currentTrick && this.currentTrick.cards.length > 0) {
      const leadSuit = this.currentTrick.getLeadSuit();
      const suitCards = currentPlayer.getCardsOfSuit(leadSuit);
      if (suitCards.length > 0 && cardToPlay.suit !== leadSuit) {
        return GameErrors.MUST_FOLLOW_SUIT;
      }
    }

    // Remove card from hand and add to trick
    const card = currentPlayer.removeCard(cardId);
    if (!card || !this.currentTrick) return GameErrors.CARD_NOT_IN_HAND;

    this.currentTrick.addCard(playerId, card);
    this.cancelPlayerTimer();

    // Check if trick is complete
    const aliveCount = this.countAlivePlayers();
    if (this.currentTrick.isComplete(aliveCount)) {
      this.completeTrick();
    } else {
      this.advanceToNextPlayer();
      this.startPlayerTimer();
    }

    return null;
  }

  // Play a random valid card (for timeout)
  playRandomCard(playerId: string): void {
    const player = this.getPlayer(playerId);
    if (!player || player.hand.length === 0) return;

    // Find valid cards
    let validCards = player.hand;
    if (this.currentTrick && this.currentTrick.cards.length > 0) {
      const leadSuit = this.currentTrick.getLeadSuit();
      const suitCards = player.getCardsOfSuit(leadSuit);
      if (suitCards.length > 0) {
        validCards = suitCards;
      }
    }

    // Pick random valid card
    const card = validCards[Math.floor(Math.random() * validCards.length)];
    this.playCard(playerId, card.id);
  }

  // Complete a trick
  private completeTrick(): void {
    if (!this.currentTrick) return;

    const winnerId = this.currentTrick.determineWinner();
    this.state = 'trick_complete';

    // If this is the last trick of the round
    if (this.trickNumber >= TRICKS_PER_ROUND) {
      this.endRound(winnerId);
    } else {
      // Set winner as next player
      const winnerIndex = this.players.findIndex((p) => p.id === winnerId);
      if (winnerIndex !== -1) {
        this.currentPlayerIndex = winnerIndex;
      }

      // Start new trick
      this.trickNumber++;
      this.currentTrick = new Trick();
      this.state = 'playing';
      this.startPlayerTimer();
    }
  }

  // End a round
  private endRound(loserId: string): void {
    this.state = 'round_end';

    const loser = this.getPlayer(loserId);
    if (!loser) return;

    // Calculate penalty
    let penalty = 1;
    if (this.klopf.active && this.klopf.isParticipant(loserId)) {
      penalty = this.klopf.getPenalty();
    }

    loser.loseLives(penalty);

    // Check for game over
    const aliveCount = this.countAlivePlayers();
    if (aliveCount <= 1) {
      this.state = 'game_over';
      return;
    }

    // Start new round
    this.startRound();
  }

  // Advance to the next alive player
  private advanceToNextPlayer(): void {
    const startIdx = this.currentPlayerIndex;
    do {
      this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
      if (this.players[this.currentPlayerIndex].isAlive()) break;
    } while (this.currentPlayerIndex !== startIdx);
  }

  // Get current player
  getCurrentPlayer(): Player | undefined {
    if (this.currentPlayerIndex < 0 || this.currentPlayerIndex >= this.players.length) {
      return undefined;
    }
    return this.players[this.currentPlayerIndex];
  }

  // Get current player ID
  getCurrentPlayerId(): string {
    const player = this.getCurrentPlayer();
    return player?.id ?? '';
  }

  // Get the winner (if game is over)
  getWinner(): Player | undefined {
    if (this.state !== 'game_over') return undefined;
    return this.players.find((p) => p.isAlive());
  }

  // Set stakes (only in lobby)
  setStakes(stakes: number): string | null {
    if (this.state !== 'lobby') {
      return GameErrors.WRONG_STATE;
    }
    this.stakes = Math.max(0, stakes);
    return null;
  }

  // Request a redeal (Einigung)
  requestRedeal(playerId: string): string | null {
    if (this.state !== 'dealing') {
      return GameErrors.WRONG_STATE;
    }

    // Only allowed with exactly 2 alive players
    const aliveCount = this.countAlivePlayers();
    if (aliveCount !== 2) {
      return GameErrors.REDEAL_NOT_ALLOWED;
    }

    // Check redeal limit
    if (this.redealCount >= MAX_REDEALS) {
      return GameErrors.REDEAL_LIMIT_REACHED;
    }

    // Check if already requested
    if (this.redealRequester === playerId) {
      return GameErrors.ALREADY_REQUESTED_REDEAL;
    }

    this.redealRequester = playerId;
    this.redealResponses = new Map();
    this.state = 'redeal_pending';

    return null;
  }

  // Respond to a redeal request
  respondToRedeal(playerId: string, agree: boolean): string | null {
    if (this.state !== 'redeal_pending') {
      return GameErrors.WRONG_STATE;
    }

    // The requester doesn't respond
    if (playerId === this.redealRequester) {
      return null;
    }

    this.redealResponses.set(playerId, agree);

    if (agree) {
      // Both players agree - perform redeal
      this.redealCount++;
      this.performRedeal();
    } else {
      // Other player declined - go back to dealing state
      this.redealRequester = '';
      this.redealResponses = new Map();
      this.state = 'dealing';
    }

    return null;
  }

  // Perform the redeal
  private performRedeal(): void {
    this.klopf.reset();

    // Create and shuffle new deck
    this.deck = new Deck();
    this.deck.shuffle();

    // Deal new cards to alive players
    for (const player of this.players) {
      if (player.isAlive()) {
        player.hand = this.deck.deal(CARDS_PER_PLAYER);
        player.hasSeenCards = true;
        if (player.lives === 1) {
          player.mustMitgehen = true;
          this.klopf.initiate(player.id);
        } else {
          player.mustMitgehen = false;
        }
      }
    }

    this.currentTrick = new Trick();
    this.redealRequester = '';
    this.redealResponses = new Map();
    this.state = 'dealing';

    // If there's an auto-klopf, go to klopf pending
    if (this.klopf.active) {
      this.state = 'klopf_pending';
    }
  }

  // Check if player can request redeal
  canRequestRedeal(playerId: string): boolean {
    if (this.state !== 'dealing') return false;
    if (this.countAlivePlayers() !== 2) return false;
    if (this.redealCount >= MAX_REDEALS) return false;
    return true;
  }

  // Get redeal info
  getRedealInfo(): { requester: string; count: number; maxRedeals: number } {
    return {
      requester: this.redealRequester,
      count: this.redealCount,
      maxRedeals: MAX_REDEALS,
    };
  }

  // Timer management
  private startPlayerTimer(): void {
    const currentPlayer = this.getCurrentPlayer();
    if (!currentPlayer) return;

    this.cancelPlayerTimer();

    this.turnTimer = setTimeout(() => {
      if (this.onTimeout) {
        this.onTimeout(currentPlayer.id);
      } else {
        this.playRandomCard(currentPlayer.id);
      }
    }, TURN_TIMEOUT_MS);
  }

  private cancelPlayerTimer(): void {
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }
  }

  // Get round results for broadcasting
  getRoundResults(): RoundResult[] {
    return this.players.map((p) => ({
      playerId: p.id,
      playerName: p.name,
      livesLost: 0, // This should be tracked separately if needed
      livesLeft: p.lives,
      isLoser: false, // This should be set by the caller
    }));
  }

  // Convert to GameStateInfo for broadcasting
  toGameStateInfo(): GameStateInfo {
    return {
      state: this.state,
      players: this.players.map((p) => p.toPlayerInfo()),
      currentPlayerId: this.getCurrentPlayerId(),
      trickNumber: this.trickNumber,
      roundNumber: this.roundNumber,
      stakes: this.stakes,
      redealCount: this.redealCount,
      maxRedeals: MAX_REDEALS,
      currentTrick: this.currentTrick?.toTrickInfo(),
      klopf: this.klopf.active ? this.klopf.toKlopfStateInfo() : undefined,
    };
  }
}
