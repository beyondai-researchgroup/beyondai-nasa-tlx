import { Routes } from '@angular/router';
import { sessionGuard } from './guards/session.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  {
    path: 'login',
    loadComponent: () => import('./login/login.component').then(m => m.LoginComponent),
  },
  {
    // BeyondAI → NASA TLX handoff entry (auto-login with participantId/sessionId/lang).
    path: 'start',
    loadComponent: () => import('./auto-start/auto-start.component').then(m => m.AutoStartComponent),
  },
  {
    path: 'instructions',
    loadComponent: () => import('./instructions/instructions.component').then(m => m.InstructionsComponent),
    canActivate: [sessionGuard],
  },
  {
    path: 'scales',
    loadComponent: () => import('./scales/scales.component').then(m => m.ScalesComponent),
    canActivate: [sessionGuard],
  },
  {
    path: 'comparisons',
    loadComponent: () => import('./comparisons/comparisons.component').then(m => m.ComparisonsComponent),
    canActivate: [sessionGuard],
  },
  {
    path: 'review',
    loadComponent: () => import('./review/review.component').then(m => m.ReviewComponent),
    canActivate: [sessionGuard],
  },
  {
    path: 'results',
    loadComponent: () => import('./results/results.component').then(m => m.ResultsComponent),
    canActivate: [sessionGuard],
  },
  { path: '**', redirectTo: 'login' },
];
