import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Card, SUIT_SYMBOLS, SUIT_COLORS } from '../../../core/models';

@Component({
  selector: 'app-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      class="card bg-white shadow-lg cursor-pointer transition-all duration-200 hover:shadow-xl"
      [class.opacity-50]="disabled"
      [class.ring-2]="selected"
      [class.ring-primary]="selected"
      [class.card-face]="!disabled"
      (click)="onCardClick()"
    >
      <div class="card-body p-2 items-center justify-center min-w-[60px] min-h-[90px]">
        <span class="text-2xl font-bold" [ngClass]="getSuitColor()">
          {{ card.rank }}
        </span>
        <span class="text-3xl" [ngClass]="getSuitColor()">
          {{ getSuitSymbol() }}
        </span>
      </div>
    </div>
  `
})
export class CardComponent {
  @Input({ required: true }) card!: Card;
  @Input() disabled = false;
  @Input() selected = false;
  @Output() cardClicked = new EventEmitter<Card>();

  getSuitSymbol(): string {
    return SUIT_SYMBOLS[this.card.suit];
  }

  getSuitColor(): string {
    return SUIT_COLORS[this.card.suit];
  }

  onCardClick(): void {
    if (!this.disabled) {
      this.cardClicked.emit(this.card);
    }
  }
}
