import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { GameStateService } from '../../core/services';

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
              <div class="avatar placeholder mb-4">
                <div class="bg-primary text-primary-content rounded-full w-20">
                  <span class="text-3xl">{{ getWinner()!.name.charAt(0).toUpperCase() }}</span>
                </div>
              </div>
              <h2 class="text-2xl font-bold">{{ getWinner()!.name }} gewinnt!</h2>
            </div>
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

          <button class="btn btn-primary w-full" (click)="newGame()">
            Neues Spiel
          </button>
        </div>
      </div>
    </div>
  `
})
export class ResultsComponent {
  constructor(
    public gameState: GameStateService,
    private router: Router
  ) {}

  getWinner() {
    const winnerId = this.gameState.winnerId();
    const state = this.gameState.gameState();
    if (!winnerId || !state) return null;
    return state.players.find(p => p.id === winnerId) || null;
  }

  getSortedPlayers() {
    const state = this.gameState.gameState();
    if (!state) return [];
    return [...state.players].sort((a, b) => b.lives - a.lives);
  }

  getLivesArray(lives: number): number[] {
    return Array(lives).fill(0);
  }

  newGame(): void {
    this.gameState.clearSession();
    this.router.navigate(['/']);
  }
}
