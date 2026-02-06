import { Component, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { WebsocketService, GameStateService } from '../../core/services';
import { Card } from '@klopf/shared';
import { PlayerHandComponent } from '../../shared/components/player-hand/player-hand.component';
import { TrickAreaComponent } from '../../shared/components/trick-area/trick-area.component';
import { TrickHistoryComponent } from '../../shared/components/trick-history/trick-history.component';
import { KlopfDialogComponent } from '../../shared/components/klopf-dialog/klopf-dialog.component';

@Component({
  selector: 'app-game',
  standalone: true,
  imports: [CommonModule, PlayerHandComponent, TrickAreaComponent, TrickHistoryComponent, KlopfDialogComponent],
  template: `
    <div class="min-h-screen bg-base-200 flex flex-col">
      <!-- Header -->
      <header class="navbar bg-base-100 shadow-sm">
        <div class="flex-1">
          <span class="text-xl font-bold px-4">Klopf!</span>
        </div>
        <div class="flex-none gap-2">
          <span class="text-sm">Runde {{ gameState.gameState()?.roundNumber }}</span>
          <span class="badge badge-outline">{{ gameState.roomCode() }}</span>
        </div>
      </header>

      <!-- Main Game Area -->
      <main class="flex-1 p-4 flex flex-col gap-4">
        <!-- Other Players -->
        <div class="flex flex-wrap justify-center gap-4">
          @for (player of gameState.otherPlayers(); track player.id) {
            <div
              class="card bg-base-100 shadow-sm p-3 min-w-[120px]"
              [class.ring-2]="gameState.gameState()?.currentPlayerId === player.id"
              [class.ring-primary]="gameState.gameState()?.currentPlayerId === player.id"
            >
              <div class="flex items-center gap-2">
                <div class="avatar placeholder">
                  <div
                    class="rounded-full w-10"
                    [class.bg-primary]="player.connected"
                    [class.bg-gray-400]="!player.connected"
                    [class.text-primary-content]="player.connected"
                  >
                    <span>{{ player.name.charAt(0).toUpperCase() }}</span>
                  </div>
                </div>
                <div>
                  <p class="font-medium text-sm">{{ player.name }}</p>
                  <div class="flex items-center gap-1">
                    @for (life of getLivesArray(player.lives); track $index) {
                      <span class="text-red-500 text-xs">&#9829;</span>
                    }
                  </div>
                </div>
              </div>
              <div class="mt-2 text-center text-sm text-base-content/70">
                {{ player.cardCount }} Karten
              </div>
            </div>
          }
        </div>

        <!-- Trick Area -->
        <div class="flex-1 flex items-center justify-center">
          <div class="w-full max-w-2xl">
            <app-trick-area
              [trick]="gameState.gameState()?.currentTrick || null"
              [players]="gameState.gameState()?.players || []"
            />
          </div>
        </div>

        <!-- Trick History -->
        <div class="w-full max-w-2xl mx-auto">
          <app-trick-history
            [tricks]="gameState.gameState()?.completedTricks || []"
            [players]="gameState.gameState()?.players || []"
          />
        </div>

        <!-- Current Turn Indicator -->
        <div class="text-center">
          @if (gameState.isMyTurn()) {
            <p class="text-lg font-bold text-primary animate-pulse">Du bist dran!</p>
          } @else if (currentPlayerName()) {
            <p class="text-base-content/70">{{ currentPlayerName() }} ist am Zug...</p>
          }
        </div>

        <!-- Action Buttons -->
        <div class="flex justify-center gap-4">
          @if (canKlopf()) {
            <button class="btn btn-warning btn-lg" [disabled]="klopfPending()" (click)="klopf()">
              @if (klopfPending()) {
                <span class="loading loading-spinner loading-sm"></span>
              } @else {
                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              }
              Klopfen!
            </button>
          }
          @if (canRequestRedeal()) {
            <button class="btn btn-secondary btn-lg" (click)="requestRedeal()">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Einigung ({{ getRedealInfo() }})
            </button>
          }
        </div>

        <!-- My Hand -->
        <div class="bg-base-100 rounded-xl shadow-lg p-4">
          <div class="flex justify-between items-center mb-2">
            <div class="flex items-center gap-2">
              <span class="font-medium">{{ gameState.me()?.name }}</span>
              <div class="flex items-center gap-1">
                @for (life of getLivesArray(gameState.me()?.lives || 0); track $index) {
                  <span class="text-red-500">&#9829;</span>
                }
              </div>
            </div>
            @if (selectedCard()) {
              <button class="btn btn-primary btn-sm" (click)="playSelectedCard()">
                Karte spielen
              </button>
            }
          </div>
          <app-player-hand
            [cards]="gameState.myCards()"
            [canPlay]="gameState.isMyTurn()"
            [selectedCardId]="selectedCard()?.id || null"
            (cardSelected)="selectCard($event)"
          />
        </div>
      </main>

      <!-- Klopf Status Panel (for initiator) -->
      @if (isKlopfInitiator()) {
        <div class="fixed bottom-4 right-4 z-40 card bg-base-100 shadow-xl border border-warning p-4 min-w-[200px]">
          <h4 class="font-bold text-sm mb-2">Klopf-Status (Stufe {{ gameState.gameState()?.klopf?.level }})</h4>
          <ul class="space-y-1">
            @for (resp of gameState.gameState()?.klopf?.responses || []; track resp.playerId) {
              <li class="flex items-center justify-between text-sm gap-2">
                <span>{{ resp.playerName }}</span>
                @if (resp.mitgehen === null) {
                  <span class="badge badge-ghost badge-sm">...</span>
                } @else if (resp.mitgehen) {
                  <span class="badge badge-success badge-sm">Mit</span>
                } @else {
                  <span class="badge badge-error badge-sm">Nein</span>
                }
              </li>
            }
          </ul>
        </div>
      }

      <!-- Klopf Dialog -->
      @if (gameState.klopfResponseNeeded()) {
        <app-klopf-dialog
          [initiatorName]="getKlopfInitiatorName()"
          [level]="gameState.gameState()?.klopf?.level || 1"
          [mustMitgehen]="gameState.me()?.lives === 1"
          (response)="respondToKlopf($event)"
        />
      }

      <!-- Redeal Dialog -->
      @if (gameState.redealResponseNeeded()) {
        <div class="modal modal-open">
          <div class="modal-box">
            <h3 class="font-bold text-lg mb-4">Einigung?</h3>
            <p class="mb-4">
              <span class="font-bold">{{ gameState.redealRequesterName() }}</span>
              möchte neue Karten austeilen.
            </p>
            <p class="text-sm text-base-content/70 mb-4">
              Bereits {{ gameState.gameState()?.redealCount || 0 }} von {{ gameState.gameState()?.maxRedeals || 3 }} Neuverteilungen verwendet.
            </p>
            <div class="modal-action">
              <button class="btn btn-error" (click)="respondToRedeal(false)">Ablehnen</button>
              <button class="btn btn-success" (click)="respondToRedeal(true)">Zustimmen</button>
            </div>
          </div>
          <div class="modal-backdrop bg-black/50"></div>
        </div>
      }

      <!-- Round Results -->
      @if (gameState.roundResults()) {
        <div class="modal modal-open">
          <div class="modal-box">
            <h3 class="font-bold text-lg mb-4">Runde beendet</h3>
            <ul class="space-y-2">
              @for (result of gameState.roundResults(); track result.playerId) {
                <li class="flex justify-between items-center p-2 rounded"
                    [class.bg-error/20]="result.isLoser">
                  <span>{{ result.playerName }}</span>
                  <span>
                    @if (result.livesLost > 0) {
                      <span class="text-error">-{{ result.livesLost }}</span>
                    }
                    ({{ result.livesLeft }} Leben)
                  </span>
                </li>
              }
            </ul>
            <div class="modal-action">
              <button class="btn btn-primary" (click)="continueGame()">Weiter</button>
            </div>
          </div>
          <div class="modal-backdrop bg-black/50"></div>
        </div>
      }

      <!-- Game Over -->
      @if (gameState.winnerId()) {
        <div class="modal modal-open">
          <div class="modal-box text-center">
            <h3 class="font-bold text-2xl mb-4">Spiel beendet!</h3>
            @if (gameState.perfectWin()) {
              <div class="mb-4">
                <span class="text-4xl">🏆</span>
                <p class="text-lg text-warning font-bold">Perfekter Sieg!</p>
              </div>
            }
            <p class="text-lg mb-4">
              <span class="font-bold text-primary">{{ getWinnerName() }}</span> gewinnt!
            </p>
            @if (gameState.perfectWin()) {
              <p class="text-sm text-base-content/70 mb-4">
                Ohne ein einziges Leben zu verlieren!
              </p>
            }
            @if (gameState.winnings() > 0) {
              <div class="bg-success/20 rounded-lg p-4 mb-4">
                <p class="text-sm text-base-content/70">Gewinn</p>
                <p class="text-2xl font-bold text-success">{{ gameState.winnings() }}€</p>
                @if (gameState.perfectWin()) {
                  <p class="text-xs text-base-content/50">(Verdoppelt durch perfekten Sieg!)</p>
                }
              </div>
            }
            <div class="modal-action justify-center">
              <button class="btn btn-primary" (click)="backToLobby()">Zur Lobby</button>
            </div>
          </div>
          <div class="modal-backdrop bg-black/50"></div>
        </div>
      }
    </div>
  `
})
export class GameComponent implements OnInit, OnDestroy {
  selectedCard = signal<Card | null>(null);
  klopfPending = signal<boolean>(false);
  private msgSub?: Subscription;

  currentPlayerName = computed(() => {
    const state = this.gameState.gameState();
    if (!state) return '';
    const player = state.players.find(p => p.id === state.currentPlayerId);
    return player?.name || '';
  });

  constructor(
    private ws: WebsocketService,
    public gameState: GameStateService,
    private router: Router
  ) {}

  ngOnInit(): void {
    if (!this.gameState.roomCode()) {
      this.router.navigate(['/']);
    }

    this.msgSub = this.ws.messages.subscribe(msg => {
      if (msg.type === 'klopf_resolved' || msg.type === 'klopf_initiated') {
        this.klopfPending.set(false);
      }
    });
  }

  ngOnDestroy(): void {
    this.msgSub?.unsubscribe();
  }

  selectCard(card: Card): void {
    if (this.gameState.isMyTurn()) {
      this.selectedCard.set(card);
    }
  }

  playSelectedCard(): void {
    const card = this.selectedCard();
    if (card && this.gameState.isMyTurn()) {
      this.ws.playCard(card.id);
      this.selectedCard.set(null);
    }
  }

  canKlopf(): boolean {
    const state = this.gameState.gameState();
    const klopf = state?.klopf;
    const myId = this.gameState.playerId();
    const me = this.gameState.me();

    if (!me || state?.state !== 'playing') {
      return false;
    }

    // Check klopf limit: new level cannot exceed player's lives + 1
    const currentLevel = klopf?.level || 0;
    const newLevel = currentLevel + 1;
    if (newLevel > me.lives + 1) {
      return false;
    }

    // Can klopf if:
    // - No active klopf
    // - Counter-klopf (last klopper is not me)
    return !klopf?.active || klopf.initiator !== myId;
  }

  klopf(): void {
    this.klopfPending.set(true);
    this.ws.klopf();
  }

  respondToKlopf(mitgehen: boolean): void {
    this.ws.respondToKlopf(mitgehen);
  }

  canRequestRedeal(): boolean {
    const state = this.gameState.gameState();
    if (!state || state.state !== 'dealing') {
      return false;
    }

    // Only allowed with exactly 2 alive players
    const alivePlayers = state.players.filter(p => p.lives > 0);
    if (alivePlayers.length !== 2) {
      return false;
    }

    // Check redeal limit
    if (state.redealCount >= state.maxRedeals) {
      return false;
    }

    return true;
  }

  requestRedeal(): void {
    this.ws.requestRedeal();
  }

  respondToRedeal(agree: boolean): void {
    this.ws.respondToRedeal(agree);
  }

  getRedealInfo(): string {
    const state = this.gameState.gameState();
    const remaining = (state?.maxRedeals || 3) - (state?.redealCount || 0);
    return `${remaining} übrig`;
  }

  isKlopfInitiator(): boolean {
    const state = this.gameState.gameState();
    return !!(state?.klopf?.active && state.klopf.initiator === this.gameState.playerId());
  }

  getKlopfInitiatorName(): string {
    const state = this.gameState.gameState();
    if (!state?.klopf) return '';
    const player = state.players.find(p => p.id === state.klopf?.initiator);
    return player?.name || '';
  }

  getWinnerName(): string {
    const state = this.gameState.gameState();
    const winnerId = this.gameState.winnerId();
    if (!state || !winnerId) return '';
    const player = state.players.find(p => p.id === winnerId);
    return player?.name || '';
  }

  getLivesArray(lives: number): number[] {
    return Array(lives).fill(0);
  }

  continueGame(): void {
    // Clear round results - game continues automatically
    this.gameState['_roundResults'].set(null);
  }

  backToLobby(): void {
    this.gameState.clearSession();
    this.router.navigate(['/']);
  }
}
