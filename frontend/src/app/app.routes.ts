import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/start/start.component').then(m => m.StartComponent)
  },
  {
    path: 'room/:code',
    loadComponent: () => import('./features/room/room.component').then(m => m.RoomComponent)
  },
  {
    path: '**',
    redirectTo: ''
  }
];
