import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CompletedTrick, Player, SUIT_SYMBOLS, SUIT_COLORS } from '@klopf/shared';

@Component({
  selector: 'app-trick-history',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (tricks.length > 0) {
      <div class="collapse collapse-arrow bg-base-100 border border-base-300">
        <input type="checkbox" />
        <div class="collapse-title text-sm font-medium">
          Stiche ({{ tricks.length }})
        </div>
        <div class="collapse-content">
          <div class="space-y-2">
            @for (trick of tricks; track $index; let i = $index) {
              <div class="flex items-center gap-2 text-sm p-1 rounded bg-base-200">
                <span class="badge badge-sm badge-ghost">{{ i + 1 }}</span>
                <div class="flex flex-wrap gap-1 flex-1">
                  @for (tc of trick.cards; track tc.playerId) {
                    <span class="whitespace-nowrap">
                      <span class="text-base-content/70">{{ getPlayerName(tc.playerId) }}:</span>
                      <span [style.color]="getColor(tc.card.suit)">{{ tc.card.rank }}{{ getSymbol(tc.card.suit) }}</span>
                    </span>
                  }
                </div>
                <span class="text-xs font-medium">{{ getPlayerName(trick.winnerId) }}</span>
              </div>
            }
          </div>
        </div>
      </div>
    }
  `
})
export class TrickHistoryComponent {
  @Input() tricks: CompletedTrick[] = [];
  @Input() players: Player[] = [];

  getPlayerName(playerId: string): string {
    return this.players.find(p => p.id === playerId)?.name || '?';
  }

  getSymbol(suit: string): string {
    return SUIT_SYMBOLS[suit as keyof typeof SUIT_SYMBOLS] || suit;
  }

  getColor(suit: string): string {
    return SUIT_COLORS[suit as keyof typeof SUIT_COLORS] || '#111827';
  }
}
