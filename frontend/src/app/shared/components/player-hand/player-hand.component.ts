import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Card } from '@klopf/shared';
import { CardComponent } from '../card/card.component';

@Component({
  selector: 'app-player-hand',
  standalone: true,
  imports: [CommonModule, CardComponent],
  template: `
    <div class="flex flex-wrap gap-2 justify-center p-4">
      @for (card of cards; track card.id) {
        <app-card
          [card]="card"
          [disabled]="!canPlay"
          [selected]="selectedCardId === card.id"
          (cardClicked)="onCardSelect($event)"
        />
      }
    </div>
  `
})
export class PlayerHandComponent {
  @Input() cards: Card[] = [];
  @Input() canPlay = false;
  @Input() selectedCardId: string | null = null;
  @Output() cardSelected = new EventEmitter<Card>();

  onCardSelect(card: Card): void {
    this.cardSelected.emit(card);
  }
}
