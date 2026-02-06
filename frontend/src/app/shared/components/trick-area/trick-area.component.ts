import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Trick, Player } from '@klopf/shared';
import { CardComponent } from '../card/card.component';

@Component({
  selector: 'app-trick-area',
  standalone: true,
  imports: [CommonModule, CardComponent],
  template: `
    <div class="bg-base-200 rounded-xl p-6 min-h-[200px] flex items-center justify-center">
      @if (trick && trick.cards.length > 0) {
        <div class="flex flex-wrap gap-4 justify-center">
          @for (trickCard of trick.cards; track trickCard.playerId) {
            <div class="flex flex-col items-center gap-1">
              <span class="text-sm font-medium text-base-content/70">
                {{ getPlayerName(trickCard.playerId) }}
              </span>
              <app-card [card]="trickCard.card" [disabled]="true" />
            </div>
          }
        </div>
      } @else {
        <p class="text-base-content/50">Warte auf ersten Stich...</p>
      }
    </div>
  `
})
export class TrickAreaComponent {
  @Input() trick: Trick | null = null;
  @Input() players: Player[] = [];

  getPlayerName(playerId: string): string {
    const player = this.players.find(p => p.id === playerId);
    return player?.name || 'Unbekannt';
  }
}
