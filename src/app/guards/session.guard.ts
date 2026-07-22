import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { TlxStateService } from '../services/tlx-state.service';

export const sessionGuard: CanActivateFn = (route) => {
  const state = inject(TlxStateService);
  const router = inject(Router);
  const path = route.routeConfig?.path;

  const hasSession = !!state.session();
  const hasScales = !!state.scales();

  if (path === 'instructions' || path === 'scales') {
    if (!hasSession) return router.createUrlTree(['/login']);
  }

  if (path === 'comparisons') {
    if (!hasSession) return router.createUrlTree(['/login']);
    if (!hasScales) return router.createUrlTree(['/scales']);
    if (!state.session()!.config.includeWeightings) return router.createUrlTree(['/results']);
  }

  if (path === 'review') {
    if (!hasSession) return router.createUrlTree(['/login']);
    if (!hasScales) return router.createUrlTree(['/scales']);
    if (state.session()!.config.includeWeightings && !state.weightings()) {
      return router.createUrlTree(['/comparisons']);
    }
  }

  if (path === 'results') {
    if (!hasSession) return router.createUrlTree(['/login']);
    if (!hasScales) return router.createUrlTree(['/scales']);
  }

  return true;
};
