import { Injectable, computed, signal, inject } from '@angular/core';
import { WebsocketService, ServerMessage } from './websocket.service';
import { Card, GameStateInfo, Player, RoundResult, GameState } from '@klopf/shared';
import { LoggerService } from './logger.service';

@Injectable({
  providedIn: 'root'
})
export class GameStateService {
  private logger = inject(LoggerService);

  // Signals for reactive state
  private _roomCode = signal<string | null>(null);
  private _playerId = signal<string | null>(null);
  private _gameState = signal<GameStateInfo | null>(null);
  private _myCards = signal<Card[]>([]);
  private _lastPlayedCard = signal<{ playerId: string; card: Card } | null>(null);
  private _klopfResponseNeeded = signal<boolean>(false);
  private _redealResponseNeeded = signal<boolean>(false);
  private _redealRequesterName = signal<string | null>(null);
  private _roundResults = signal<RoundResult[] | null>(null);
  private _winnerId = signal<string | null>(null);
  private _perfectWin = signal<boolean>(false);
  private _winnings = signal<number>(0);
  private _error = signal<string | null>(null);

  // Public readonly signals
  readonly roomCode = this._roomCode.asReadonly();
  readonly playerId = this._playerId.asReadonly();
  readonly gameState = this._gameState.asReadonly();
  readonly myCards = this._myCards.asReadonly();
  readonly lastPlayedCard = this._lastPlayedCard.asReadonly();
  readonly klopfResponseNeeded = this._klopfResponseNeeded.asReadonly();
  readonly redealResponseNeeded = this._redealResponseNeeded.asReadonly();
  readonly redealRequesterName = this._redealRequesterName.asReadonly();
  readonly roundResults = this._roundResults.asReadonly();
  readonly winnerId = this._winnerId.asReadonly();
  readonly perfectWin = this._perfectWin.asReadonly();
  readonly winnings = this._winnings.asReadonly();
  readonly error = this._error.asReadonly();

  // Computed values
  readonly isInGame = computed(() => this._gameState()?.state !== 'lobby');
  readonly isMyTurn = computed(() => {
    const state = this._gameState();
    const myId = this._playerId();
    return state?.currentPlayerId === myId && state?.state === 'playing';
  });
  readonly currentPlayer = computed(() => {
    const state = this._gameState();
    if (!state) return null;
    return state.players.find(p => p.id === state.currentPlayerId) || null;
  });
  readonly me = computed(() => {
    const state = this._gameState();
    const myId = this._playerId();
    if (!state || !myId) return null;
    return state.players.find(p => p.id === myId) || null;
  });
  readonly otherPlayers = computed(() => {
    const state = this._gameState();
    const myId = this._playerId();
    if (!state) return [];
    return state.players.filter(p => p.id !== myId);
  });
  readonly isOwner = computed(() => {
    const state = this._gameState();
    const myId = this._playerId();
    if (!state || !myId || state.players.length === 0) return false;
    return state.players[0]?.id === myId; // First player is owner
  });

  constructor(private ws: WebsocketService) {
    this.ws.messages.subscribe(msg => this.handleMessage(msg));
  }

  private handleMessage(msg: ServerMessage): void {
    this.logger.debug('GameState', `Handling message: ${msg.type}`, msg);

    switch (msg.type) {
      case 'room_created':
        this._roomCode.set(msg.roomCode || null);
        this._playerId.set(msg.playerId || null);
        this.logger.info('GameState', 'Room joined', { roomCode: msg.roomCode, playerId: msg.playerId });
        break;

      case 'game_state': {
        const prevState = this._gameState()?.state;
        this._gameState.set(msg.state);
        this.logger.info('GameState', 'State updated', {
          state: msg.state.state,
          prevState,
          currentPlayerId: msg.state.currentPlayerId,
          trickCards: msg.state.currentTrick?.cards?.length || 0
        });
        // Derive klopf state on reconnect
        if (msg.state.state === 'klopf_pending' && msg.state.klopf) {
          const myId = this._playerId();
          const klopf = msg.state.klopf;
          if (myId && klopf.initiator !== myId) {
            const myResponse = klopf.responses?.find(r => r.playerId === myId);
            if (!myResponse || myResponse.mitgehen === null) {
              this._klopfResponseNeeded.set(true);
            }
          }
        }
        break;
      }

      case 'game_started':
        this.logger.info('GameState', 'Game started');
        // Game state update will follow in a separate message
        break;

      case 'cards_dealt':
        if (msg.cards) {
          this._myCards.set(msg.cards);
          this.logger.info('GameState', 'Cards dealt', { cardCount: msg.cards.length, cards: msg.cards.map(c => `${c.rank}${c.suit}`) });
        }
        break;

      case 'card_played':
        if (msg.playerId && msg.card) {
          this._lastPlayedCard.set({ playerId: msg.playerId, card: msg.card });
          this.logger.info('GameState', 'Card played', { playerId: msg.playerId, card: `${msg.card.rank}${msg.card.suit}` });
          // Remove card from my hand if I played it
          if (msg.playerId === this._playerId()) {
            const before = this._myCards().length;
            this._myCards.update(cards => cards.filter(c => c.id !== msg.card!.id));
            this.logger.debug('GameState', 'Removed card from hand', { before, after: this._myCards().length });
          }
        }
        break;

      case 'klopf_initiated':
        this._klopfResponseNeeded.set(msg.playerId !== this._playerId());
        this.logger.info('GameState', 'Klopf initiated', { initiator: msg.playerId });
        break;

      case 'klopf_response_needed':
        this._klopfResponseNeeded.set(true);
        this.logger.info('GameState', 'Klopf response needed');
        break;

      case 'klopf_resolved':
        this._klopfResponseNeeded.set(false);
        this.logger.info('GameState', 'Klopf resolved');
        break;

      case 'redeal_requested':
        this.logger.info('GameState', 'Redeal requested', { playerId: msg.playerId });
        break;

      case 'redeal_response_needed':
        this._redealResponseNeeded.set(true);
        // Note: requester name should be fetched from game state
        this.logger.info('GameState', 'Redeal response needed', { redealCount: msg.redealCount, maxRedeals: msg.maxRedeals });
        break;

      case 'redeal_performed':
        this._redealResponseNeeded.set(false);
        this._redealRequesterName.set(null);
        this.logger.info('GameState', 'Redeal performed', { count: msg.redealCount });
        break;

      case 'redeal_declined':
        this._redealResponseNeeded.set(false);
        this._redealRequesterName.set(null);
        this.logger.info('GameState', 'Redeal declined');
        break;

      case 'round_ended':
        if (msg.results) {
          this._roundResults.set(msg.results);
          this.logger.info('GameState', 'Round ended', { results: msg.results });
        }
        break;

      case 'game_over':
        if (msg.winnerId) {
          this._winnerId.set(msg.winnerId);
          this._perfectWin.set(msg.perfectWin || false);
          this._winnings.set(msg.winnings || 0);
          this.logger.info('GameState', 'Game over', { winnerId: msg.winnerId, perfectWin: msg.perfectWin, winnings: msg.winnings });
        }
        break;

      case 'error':
        this._error.set(msg.error || 'Unknown error');
        this.logger.error('GameState', 'Server error', { error: msg.error });
        setTimeout(() => this._error.set(null), 5000);
        break;

      case 'player_joined':
        this.logger.info('GameState', 'Player joined', { player: msg.player });
        // Game state update will follow
        break;

      case 'player_left':
        this.logger.info('GameState', 'Player left', { playerId: msg.playerId });
        // Game state update will follow
        break;

      case 'room_closed':
        this.logger.warn('GameState', 'Room closed');
        this.clearSession();
        break;

      default:
        this.logger.warn('GameState', 'Unknown message type', { type: msg.type });
    }
  }

  clearSession(): void {
    sessionStorage.removeItem('klopf_room');
    sessionStorage.removeItem('klopf_player');
    this._roomCode.set(null);
    this._playerId.set(null);
    this._gameState.set(null);
    this._myCards.set([]);
    this._winnerId.set(null);
    this._perfectWin.set(false);
    this._winnings.set(0);
    this._roundResults.set(null);
    this._redealResponseNeeded.set(false);
    this._redealRequesterName.set(null);
  }
}
