import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { filter } from 'rxjs';
import { WebsocketService, GameStateService, SessionService, ServerMessage, errorText } from '../../core/services';
import { LobbyComponent } from '../lobby/lobby.component';
import { GameComponent } from '../game/game.component';
import { ResultsComponent } from '../results/results.component';

@Component({
  selector: 'app-room',
  standalone: true,
  imports: [FormsModule, RouterLink, LobbyComponent, GameComponent, ResultsComponent],
  template: `
    @if (joined()) {
      @switch (gameState.gameState()?.state) {
        @case ('lobby') { <app-lobby /> }
        @case ('game_over') { <app-results /> }
        @default { <app-game /> }
      }
    } @else {
      <div class="min-h-screen bg-base-200 flex items-center justify-center p-4">
        <div class="card bg-base-100 shadow-xl w-full max-w-md">
          <div class="card-body">
            <h1 class="card-title text-3xl justify-center mb-2">Klopf!</h1>
            <p class="text-center font-mono uppercase mb-4">Raum {{ code }}</p>

            @if (roomMissing()) {
              <div class="alert alert-error mb-4">
                <span>Diesen Raum gibt es nicht mehr.</span>
              </div>
              <a class="btn btn-primary w-full" routerLink="/">Zur Startseite</a>
            } @else if (awaitingSession()) {
              <p class="text-center"><span class="loading loading-spinner"></span> Verbinde...</p>
            } @else {
              <div class="form-control mb-4">
                <label class="label">
                  <span class="label-text">Dein Name</span>
                </label>
                <input
                  type="text"
                  class="input input-bordered"
                  [class.input-error]="joinError()"
                  [(ngModel)]="playerName"
                  (keyup.enter)="join()"
                  placeholder="Name eingeben..."
                  maxlength="20"
                />
                @if (joinError()) {
                  <label class="label">
                    <span class="label-text-alt text-error">{{ joinError() }}</span>
                  </label>
                }
              </div>
              <button class="btn btn-primary w-full" [disabled]="!playerName.trim()" (click)="join()">
                Beitreten
              </button>
            }
          </div>
        </div>
      </div>
    }
  `
})
export class RoomComponent {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private ws = inject(WebsocketService);
  private session = inject(SessionService);
  gameState = inject(GameStateService);

  readonly code = (this.route.snapshot.paramMap.get('code') ?? '').toLowerCase();
  playerName: string = history.state?.playerName ?? '';
  private autoJoinPending = !!this.playerName;

  readonly joinError = signal<string | null>(null);
  readonly roomMissing = signal(false);
  readonly awaitingSession = signal(!!this.session.load(this.code));
  readonly joined = computed(() => this.gameState.roomCode() === this.code && !!this.gameState.gameState());

  constructor() {
    this.ws.messages.pipe(takeUntilDestroyed()).subscribe(msg => this.onMessage(msg));
    this.ws.isConnected$.pipe(filter(Boolean), takeUntilDestroyed()).subscribe(() => this.onConnected());
  }

  join(): void {
    const name = this.playerName.trim();
    if (!name) return;
    this.joinError.set(null);
    this.ws.joinRoom(this.code, name);
  }

  private onConnected(): void {
    const session = this.session.load(this.code);
    if (session) {
      this.awaitingSession.set(true);
      this.ws.reconnect(this.code, session.playerId, session.token);
    } else if (this.autoJoinPending) {
      this.autoJoinPending = false;
      this.join();
    }
  }

  private onMessage(msg: ServerMessage): void {
    switch (msg.type) {
      case 'room_created':
        this.awaitingSession.set(false);
        break;
      case 'room_closed':
        this.session.clear(this.code);
        this.gameState.reset();
        this.router.navigate(['/']);
        break;
      case 'error':
        if (msg.code === 'room_not_found' || msg.code === 'invalid_session') {
          this.session.clear(this.code);
          this.gameState.reset();
          this.awaitingSession.set(false);
          this.roomMissing.set(msg.code === 'room_not_found');
        } else if (msg.code === 'name_taken') {
          this.joinError.set('Diesen Namen gibt es in diesem Raum schon.');
        } else if (!this.joined()) {
          this.joinError.set(errorText(msg.error));
        }
        break;
    }
  }
}
