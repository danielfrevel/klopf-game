import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { GameStateService, SessionService, WebsocketService } from '../../core/services';

@Component({
  selector: 'app-results',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="min-h-screen bg-base-200 flex items-center justify-center p-4">
      <div class="card bg-base-100 shadow-xl w-full max-w-md">
        <div class="card-body text-center">
          <h1 class="card-title text-3xl justify-center mb-6">Spielende</h1>

          @if (getWinner()) {
            <div class="mb-6">
              @if (gameState.perfectWin()) {
                <div class="mb-2">
                  <span class="text-5xl">🏆</span>
                </div>
              }
              <div class="avatar placeholder mb-4">
                <div class="bg-primary text-primary-content rounded-full w-20">
                  <span class="text-3xl">{{ getWinner()!.name.charAt(0).toUpperCase() }}</span>
                </div>
              </div>
              <h2 class="text-2xl font-bold">{{ getWinner()!.name }} gewinnt!</h2>
              @if (gameState.perfectWin()) {
                <p class="text-warning font-bold mt-2">Perfekter Sieg!</p>
                <p class="text-sm text-base-content/70">Ohne ein einziges Leben zu verlieren!</p>
              }
              @if (gameState.winnings() > 0) {
                <div class="bg-success/20 rounded-lg p-4 mt-4">
                  <p class="text-sm text-base-content/70">Gewinn</p>
                  <p class="text-2xl font-bold text-success">{{ gameState.winnings() }}€</p>
                  @if (gameState.perfectWin()) {
                    <p class="text-xs text-base-content/50">(Verdoppelt durch perfekten Sieg!)</p>
                  }
                </div>
              }
            </div>
          }

          @if (gameState.roundResults(); as results) {
            <div class="divider">Letzte Runde</div>
            <ul class="space-y-1 mb-4 text-sm">
              @for (result of results; track result.playerId) {
                <li class="flex justify-between">
                  <span>{{ result.playerName }}</span>
                  @if (result.folded) {
                    <span class="text-error">ausgestiegen, -{{ result.livesLost }}</span>
                  } @else if (result.livesLost > 0) {
                    <span class="text-error">-{{ result.livesLost }}</span>
                  } @else {
                    <span>Rundensieg</span>
                  }
                </li>
              }
            </ul>
          }

          <div class="divider">Endstand</div>

          <ul class="space-y-2 mb-6">
            @for (player of getSortedPlayers(); track player.id) {
              <li
                class="flex justify-between items-center p-3 rounded"
                [class.bg-primary/20]="player.lives > 0"
                [class.bg-base-200]="player.lives === 0"
              >
                <span class="font-medium">{{ player.name }}</span>
                <div class="flex items-center gap-1">
                  @for (life of getLivesArray(player.lives); track $index) {
                    <span class="text-red-500">&#9829;</span>
                  }
                  @if (player.lives === 0) {
                    <span class="text-base-content/50">Ausgeschieden</span>
                  }
                </div>
              </li>
            }
          </ul>

          @if (gameState.isHost()) {
            <button class="btn btn-primary w-full mb-2" (click)="restartGame()">Revanche</button>
          } @else {
            <p class="text-center text-base-content/70 mb-2">Warten auf Host...</p>
          }
          <button class="btn btn-ghost w-full" (click)="leave()">Zurück</button>
        </div>
      </div>
    </div>
  `
})
export class ResultsComponent {
  private router = inject(Router);
  private ws = inject(WebsocketService);
  private session = inject(SessionService);
  gameState = inject(GameStateService);

  getWinner() {
    const state = this.gameState.gameState();
    if (!state) return null;
    const winnerId = this.gameState.winnerId();
    return state.players.find(p => winnerId ? p.id === winnerId : p.lives > 0) || null;
  }

  getSortedPlayers() {
    const state = this.gameState.gameState();
    if (!state) return [];
    return [...state.players].sort((a, b) => b.lives - a.lives);
  }

  getLivesArray(lives: number): number[] {
    return Array(lives).fill(0);
  }

  restartGame(): void {
    this.ws.restartGame();
  }

  leave(): void {
    const code = this.gameState.roomCode();
    this.ws.leaveRoom();
    if (code) this.session.clear(code);
    this.gameState.reset();
    this.router.navigate(['/']);
  }
}
