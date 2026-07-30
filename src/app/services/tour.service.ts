import { Injectable, signal, computed } from '@angular/core';

export interface TourStep {
  /** CSS selector of the element to spotlight, or null for a centered card with no target. */
  target: string | null;
  title: string;
  body: string;
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'center';
  /** Runs just before the step is shown — e.g. scroll into view, expand something. */
  beforeShow?: () => void;
  /** Runs when leaving this step (forward, back, skip, or on tour end while on this step). */
  afterLeave?: () => void;
}

/**
 * Drives the guided-tour overlay (spotlight + tooltip) shown to Intro-session participants on
 * each NASA-TLX page (scales, comparisons, review), so a researcher no longer has to narrate
 * the UI live. Mirrors the same TourService/TourOverlayComponent pair used in the BeyondAI app.
 */
@Injectable({ providedIn: 'root' })
export class TourService {
  private readonly _steps = signal<TourStep[]>([]);
  private readonly _index = signal(0);
  private readonly _active = signal(false);

  readonly steps = this._steps.asReadonly();
  readonly index = this._index.asReadonly();
  readonly active = this._active.asReadonly();

  readonly currentStep = computed<TourStep | null>(() => this._steps()[this._index()] ?? null);
  readonly isFirst = computed(() => this._index() === 0);
  readonly isLast = computed(() => this._index() === this._steps().length - 1);

  start(steps: TourStep[]): void {
    if (steps.length === 0) return;
    this._steps.set(steps);
    this._index.set(0);
    this._active.set(true);
    steps[0].beforeShow?.();
  }

  next(): void {
    const steps = this._steps();
    const i = this._index();
    if (i >= steps.length - 1) {
      this.end();
      return;
    }
    steps[i].afterLeave?.();
    this._index.set(i + 1);
    steps[i + 1].beforeShow?.();
  }

  back(): void {
    const steps = this._steps();
    const i = this._index();
    if (i <= 0) return;
    steps[i].afterLeave?.();
    this._index.set(i - 1);
    steps[i - 1].beforeShow?.();
  }

  end(): void {
    const steps = this._steps();
    const i = this._index();
    steps[i]?.afterLeave?.();
    this._active.set(false);
    this._steps.set([]);
    this._index.set(0);
  }
}
