import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { WebsocketService, GameStateService } from '../../core/services';

@Component({
  selector: 'app-lobby',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="min-h-screen bg-base-200 flex items-center justify-center p-4">
      <div class="card bg-base-100 shadow-xl w-full max-w-md">
        <div class="card-body">
          <h1 class="card-title text-3xl justify-center mb-6">Klopf!</h1>

          <div class="text-center mb-4">
            <p class="text-sm text-base-content/70">Raum-Code</p>
            <p class="text-3xl font-mono font-bold tracking-wider uppercase">
              {{ gameState.roomCode() }}
            </p>
            <button class="btn btn-ghost btn-sm mt-2" (click)="copyRoomLink()">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
              </svg>
              {{ copied() ? 'Kopiert' : 'Link kopieren' }}
            </button>
          </div>

          <div class="divider">Spieler</div>

          <ul class="space-y-2 mb-4">
            @for (player of gameState.gameState()?.players; track player.id) {
              <li class="flex items-center gap-2 p-2 rounded bg-base-200">
                <div class="avatar placeholder">
                  <div class="bg-primary text-primary-content rounded-full w-8 h-8 flex items-center justify-center">
                    <span class="text-sm">{{ player.name.charAt(0).toUpperCase() }}</span>
                  </div>
                </div>
                <span class="flex-1">{{ player.name }}</span>
                @if (player.id === gameState.gameState()?.hostId) {
                  <span class="badge badge-primary badge-sm">Host</span>
                }
                @if (!player.connected) {
                  <span class="badge badge-error badge-sm">Offline</span>
                }
              </li>
            }
          </ul>

          <p class="text-center text-sm text-base-content/70 mb-4">
            {{ gameState.gameState()?.players?.length || 0 }}/4 Spieler
            (mind. 2 zum Starten)
          </p>

          @if (gameState.isHost()) {
            <div class="form-control mb-4">
              <label class="label">
                <span class="label-text">Einsatz (optional)</span>
              </label>
              <div class="input-group">
                <input
                  type="number"
                  class="input input-bordered w-full"
                  [(ngModel)]="stakes"
                  (change)="updateStakes()"
                  placeholder="0"
                  min="0"
                />
                <span class="bg-base-200 px-4 flex items-center">€</span>
              </div>
              <label class="label">
                <span class="label-text-alt text-base-content/50">
                  Gewinn: {{ (gameState.gameState()?.players?.length || 1) - 1 }} × {{ stakes || 0 }}€ = {{ ((gameState.gameState()?.players?.length || 1) - 1) * (stakes || 0) }}€
                </span>
              </label>
            </div>

            <button
              class="btn btn-primary w-full"
              [disabled]="(gameState.gameState()?.players?.length || 0) < 2"
              (click)="startGame()"
            >
              Spiel starten
            </button>
            <button
              class="btn btn-outline btn-error w-full mt-2"
              (click)="closeRoom()"
            >
              Raum schließen
            </button>
          } @else {
            @if ((gameState.gameState()?.stakes || 0) > 0) {
              <div class="text-center mb-4 p-3 bg-base-200 rounded-lg">
                <p class="text-sm text-base-content/70">Einsatz</p>
                <p class="text-xl font-bold">{{ gameState.gameState()?.stakes }}€</p>
              </div>
            }
            <p class="text-center text-base-content/70">
              Warte auf Host...
            </p>
          }

          @if (gameState.error()) {
            <div class="alert alert-error mt-4">
              <span>{{ gameState.error() }}</span>
            </div>
          }
        </div>
      </div>
    </div>
  `
})
export class LobbyComponent {
  private ws = inject(WebsocketService);
  gameState = inject(GameStateService);

  stakes = this.gameState.gameState()?.stakes ?? 0;
  copied = signal(false);

  startGame(): void {
    this.ws.startGame();
  }

  closeRoom(): void {
    this.ws.closeRoom();
  }

  updateStakes(): void {
    if (this.stakes < 0) {
      this.stakes = 0;
    }
    this.ws.setStakes(this.stakes);
  }

  copyRoomLink(): void {
    const code = this.gameState.roomCode();
    if (code) {
      navigator.clipboard.writeText(`${location.origin}/room/${code}`);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    }
  }
}
