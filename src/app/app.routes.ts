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
    // Standalone magic-link entry (Part D of the platform re-architecture) — for a research
    // using NASA-TLX as its own module, independent of code-review-ai's handoff above.
    path: 'link/:token',
    loadComponent: () => import('./link-access/link-access.component').then(m => m.LinkAccessComponent),
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
    path: 'results',
    loadComponent: () => import('./results/results.component').then(m => m.ResultsComponent),
    canActivate: [sessionGuard],
  },
  {
    // Post-session questionnaire (2026-10-01) — shown after the TLX result is saved, before the
    // study session is actually marked finished. Study-flow sessions only (dbSessionId defined).
    path: 'post-session',
    loadComponent: () => import('./post-session/post-session.component').then(m => m.PostSessionComponent),
    canActivate: [sessionGuard],
  },
  { path: '**', redirectTo: 'login' },
];
