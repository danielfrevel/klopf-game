import { Injectable, computed, signal, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { map, of, switchMap, timer } from 'rxjs';
import { WebsocketService, ServerMessage } from './websocket.service';
import { Card, GameStateInfo, Player, RoundResult, GameState } from '@klopf/shared';
import { LoggerService } from './logger.service';
import { SessionService } from './session.service';
import { errorText } from './error-text';

const ROUND_RESULTS_MS = 8000;

@Injectable({
  providedIn: 'root'
})
export class GameStateService {
  private logger = inject(LoggerService);
  private roundResultsTimer?: ReturnType<typeof setTimeout>;
  private session = inject(SessionService);

  // Signals for reactive state
  private _roomCode = signal<string | null>(null);
  private _playerId = signal<string | null>(null);
  private _gameState = signal<GameStateInfo | null>(null);
  private _myCards = signal<Card[]>([]);
  private _lastPlayedCard = signal<{ playerId: string; card: Card } | null>(null);
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
  readonly roundResults = this._roundResults.asReadonly();
  readonly winnerId = this._winnerId.asReadonly();
  readonly perfectWin = this._perfectWin.asReadonly();
  readonly winnings = this._winnings.asReadonly();
  readonly error = this._error.asReadonly();

  private readonly phaseEndsAt = computed(() => this._gameState()?.phaseEndsAt ?? null);
  readonly phaseSecondsLeft = toSignal(
    toObservable(this.phaseEndsAt).pipe(
      switchMap(endsAt => endsAt === null
        ? of(null)
        : timer(0, 1000).pipe(map(() => Math.max(0, Math.ceil((endsAt - Date.now()) / 1000))))),
    ),
    { initialValue: null },
  );
  readonly klopfResponseNeeded = computed(() => {
    const state = this._gameState();
    const myResponse = state?.klopf.responses?.find(r => r.playerId === this._playerId());
    return state?.state === 'klopf_pending' && myResponse?.mitgehen === null;
  });
  readonly redealResponseNeeded = computed(() => {
    const state = this._gameState();
    return state?.state === 'redeal_pending' && this.isActive() && state.redealRequester !== this._playerId();
  });
  readonly redealRequesterName = computed(() => {
    const state = this._gameState();
    return state?.players.find(p => p.id === state.redealRequester)?.name ?? null;
  });
  readonly activePlayers = computed(() => (this._gameState()?.players ?? []).filter(p => p.lives > 0 && !p.folded));
  readonly isActive = computed(() => {
    const me = this.me();
    return !!me && me.lives > 0 && !me.folded;
  });

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
  readonly isHost = computed(() => {
    const myId = this._playerId();
    return !!myId && this._gameState()?.hostId === myId;
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
        this.session.save(msg.roomCode, msg.playerId, msg.token);
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
        if (msg.state.state === 'lobby') this.resetRoundState();
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
        this.logger.info('GameState', 'Klopf initiated', { initiator: msg.playerId });
        break;

      case 'klopf_response_needed':
        this.logger.info('GameState', 'Klopf response needed');
        break;

      case 'klopf_resolved':
        this.logger.info('GameState', 'Klopf resolved');
        break;

      case 'redeal_requested':
        this.logger.info('GameState', 'Redeal requested', { playerId: msg.playerId });
        break;

      case 'redeal_response_needed':
        this.logger.info('GameState', 'Redeal response needed', { redealCount: msg.redealCount, maxRedeals: msg.maxRedeals });
        break;

      case 'redeal_performed':
        this.logger.info('GameState', 'Redeal performed', { count: msg.redealCount });
        break;

      case 'redeal_declined':
        this.logger.info('GameState', 'Redeal declined');
        break;

      case 'round_ended':
        if (msg.results) {
          this._roundResults.set(msg.results);
          clearTimeout(this.roundResultsTimer);
          this.roundResultsTimer = setTimeout(() => this._roundResults.set(null), ROUND_RESULTS_MS);
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
        this._error.set(errorText(msg.error));
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
        break;

      default:
        this.logger.warn('GameState', 'Unknown message type', { type: msg.type });
    }
  }

  dismissRoundResults(): void {
    this._roundResults.set(null);
  }

  reset(): void {
    this._roomCode.set(null);
    this._playerId.set(null);
    this._gameState.set(null);
    this.resetRoundState();
  }

  private resetRoundState(): void {
    this._myCards.set([]);
    this._winnerId.set(null);
    this._perfectWin.set(false);
    this._winnings.set(0);
    this._roundResults.set(null);
  }
}
