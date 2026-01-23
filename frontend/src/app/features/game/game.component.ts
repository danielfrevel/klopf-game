import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { WebsocketService, GameStateService } from '../../core/services';
import { Card } from '../../core/models';
import { PlayerHandComponent } from '../../shared/components/player-hand/player-hand.component';
import { TrickAreaComponent } from '../../shared/components/trick-area/trick-area.component';
import { KlopfDialogComponent } from '../../shared/components/klopf-dialog/klopf-dialog.component';

@Component({
  selector: 'app-game',
  standalone: true,
  imports: [CommonModule, PlayerHandComponent, TrickAreaComponent, KlopfDialogComponent],
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

        <!-- Current Turn Indicator -->
        <div class="text-center">
          @if (gameState.isMyTurn()) {
            <p class="text-lg font-bold text-primary animate-pulse">Du bist dran!</p>
          } @else if (currentPlayerName()) {
            <p class="text-base-content/70">{{ currentPlayerName() }} ist am Zug...</p>
          }
        </div>

        <!-- Klopf Button -->
        @if (canKlopf()) {
          <div class="flex justify-center">
            <button class="btn btn-warning btn-lg" (click)="klopf()">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              Klopfen!
            </button>
          </div>
        }

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

      <!-- Klopf Dialog -->
      @if (gameState.klopfResponseNeeded()) {
        <app-klopf-dialog
          [initiatorName]="getKlopfInitiatorName()"
          [level]="gameState.gameState()?.klopf?.level || 1"
          [mustMitgehen]="gameState.me()?.lives === 1"
          (response)="respondToKlopf($event)"
        />
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
            <p class="text-lg mb-4">
              <span class="font-bold text-primary">{{ getWinnerName() }}</span> gewinnt!
            </p>
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
export class GameComponent implements OnInit {
  selectedCard = signal<Card | null>(null);

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
    // Redirect to lobby if not in game
    if (!this.gameState.roomCode()) {
      this.router.navigate(['/']);
    }
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

    // Can klopf if game is in playing state and either:
    // - No active klopf
    // - Counter-klopf (last klopper is not me)
    return (
      state?.state === 'playing' &&
      (!klopf?.active || klopf.initiator !== myId)
    );
  }

  klopf(): void {
    this.ws.klopf();
  }

  respondToKlopf(mitgehen: boolean): void {
    this.ws.respondToKlopf(mitgehen);
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
