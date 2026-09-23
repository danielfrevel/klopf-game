import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ThemeSwitcherComponent } from './shared/components/theme-switcher/theme-switcher.component';
import { WebsocketService } from './core/services';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, ThemeSwitcherComponent],
  template: `
    <div class="fixed bottom-4 right-4 z-50">
      <app-theme-switcher />
    </div>
    <router-outlet />
  `
})
export class App {
  constructor() {
    inject(WebsocketService).connect();
  }
}
