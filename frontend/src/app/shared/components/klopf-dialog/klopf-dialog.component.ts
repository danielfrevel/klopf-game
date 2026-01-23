import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-klopf-dialog',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="modal modal-open">
      <div class="modal-box">
        <h3 class="font-bold text-lg flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          Klopfen!
        </h3>
        <p class="py-4">
          {{ initiatorName }} hat geklopft!
          <span class="badge badge-warning ml-2">Stufe {{ level }}</span>
        </p>
        <p class="text-sm text-base-content/70 mb-4">
          Verlust bei Niederlage: <strong>{{ level + 1 }} Leben</strong>
        </p>

        @if (mustMitgehen) {
          <div class="alert alert-info mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="stroke-current shrink-0 w-6 h-6">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <span>Du hast nur 1 Leben - du musst mitgehen!</span>
          </div>
        }

        <div class="modal-action">
          @if (!mustMitgehen) {
            <button class="btn btn-error" (click)="onResponse(false)">
              Nicht mitgehen (-1 Leben)
            </button>
          }
          <button class="btn btn-success" (click)="onResponse(true)">
            Mitgehen
          </button>
        </div>
      </div>
      <div class="modal-backdrop bg-black/50"></div>
    </div>
  `
})
export class KlopfDialogComponent {
  @Input() initiatorName = '';
  @Input() level = 1;
  @Input() mustMitgehen = false;
  @Output() response = new EventEmitter<boolean>();

  onResponse(mitgehen: boolean): void {
    this.response.emit(mitgehen);
  }
}
