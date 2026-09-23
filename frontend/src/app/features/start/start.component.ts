import { Component, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { first } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { WebsocketService, GameStateService } from '../../core/services';

@Component({
  selector: 'app-start',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="min-h-screen bg-base-200 flex items-center justify-center p-4">
      <div class="card bg-base-100 shadow-xl w-full max-w-md">
        <div class="card-body">
          <h1 class="card-title text-3xl justify-center mb-6">Klopf!</h1>

          <div class="form-control mb-4">
            <label class="label">
              <span class="label-text">Dein Name</span>
            </label>
            <input
              type="text"
              class="input input-bordered"
              [(ngModel)]="playerName"
              placeholder="Name eingeben..."
              maxlength="20"
            />
          </div>

          <div class="divider">Neues Spiel</div>

          <button class="btn btn-primary w-full mb-4" [disabled]="!playerName.trim()" (click)="createRoom()">
            Raum erstellen
          </button>

          <div class="divider">Oder beitreten</div>

          <div class="form-control mb-4">
            <label class="label">
              <span class="label-text">Raum-Code</span>
            </label>
            <input
              type="text"
              class="input input-bordered uppercase"
              [(ngModel)]="roomCode"
              placeholder="ABC123"
              maxlength="6"
            />
          </div>

          <button class="btn btn-secondary w-full" [disabled]="roomCode.length !== 6" (click)="joinRoom()">
            Beitreten
          </button>

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
export class StartComponent {
  private ws = inject(WebsocketService);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);
  gameState = inject(GameStateService);

  playerName = '';
  roomCode = '';

  createRoom(): void {
    const name = this.playerName.trim();
    if (!name) return;
    this.ws.messages
      .pipe(first(msg => msg.type === 'room_created'), takeUntilDestroyed(this.destroyRef))
      .subscribe(msg => {
        if (msg.type === 'room_created') this.router.navigate(['/room', msg.roomCode]);
      });
    this.ws.createRoom(name);
  }

  joinRoom(): void {
    this.router.navigate(['/room', this.roomCode.toLowerCase()], { state: { playerName: this.playerName.trim() } });
  }
}
