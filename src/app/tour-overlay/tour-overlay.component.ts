import { Component, HostListener, effect, inject, signal } from '@angular/core';
import { NgStyle } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { TourService } from '../services/tour.service';

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * Renders the spotlight backdrop + tooltip for whatever step TourService currently points at.
 * `.tour-backdrop` is a real full-viewport div (always present while a step is active) that
 * blocks every click — a `clip-path` polygon punches an actual hole over the target rect, so
 * the background genuinely cannot be clicked through (a box-shadow "hole" only dims visually
 * and is never hit-tested). `.tour-spotlight` sits on top of that hole purely as a visual/pointer
 * placeholder; it stays non-interactive since no NASA-TLX tour step needs the target itself to
 * be clickable. Ported from the BeyondAI app's identical component.
 */
@Component({
  selector: 'app-tour-overlay',
  standalone: true,
  imports: [NgStyle, TranslateModule],
  templateUrl: './tour-overlay.component.html',
  styleUrl: './tour-overlay.component.scss',
})
export class TourOverlayComponent {
  readonly tour = inject(TourService);

  private static readonly PAD = 8;
  private static readonly MAX_ATTEMPTS = 20;
  private static readonly RETRY_MS = 50;

  readonly rect = signal<Rect | null>(null);
  readonly stepIndex = () => this.tour.index() + 1;
  readonly stepCount = () => this.tour.steps().length;

  constructor() {
    effect(() => {
      const step = this.tour.currentStep();
      if (!step) {
        this.rect.set(null);
        return;
      }
      this.locate(step.target, 0);
    }, { allowSignalWrites: true });
  }

  @HostListener('window:resize')
  @HostListener('window:scroll')
  onViewportChange(): void {
    const step = this.tour.currentStep();
    if (step) this.locate(step.target, 0);
  }

  private locate(selector: string | null, attempt: number): void {
    if (!selector) {
      this.rect.set(null);
      return;
    }
    const el = document.querySelector(selector);
    if (!el) {
      if (attempt < TourOverlayComponent.MAX_ATTEMPTS) {
        setTimeout(() => this.locate(selector, attempt + 1), TourOverlayComponent.RETRY_MS);
      } else {
        this.rect.set(null);
      }
      return;
    }
    const r = el.getBoundingClientRect();
    const pad = TourOverlayComponent.PAD;
    this.rect.set({ top: r.top - pad, left: r.left - pad, width: r.width + pad * 2, height: r.height + pad * 2 });
  }

  backdropClipPath(): string {
    const r = this.rect();
    if (!r) return 'none';
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const l = Math.max(0, r.left);
    const t = Math.max(0, r.top);
    const right = Math.min(vw, r.left + r.width);
    const bottom = Math.min(vh, r.top + r.height);
    return `polygon(evenodd, 0px 0px, ${vw}px 0px, ${vw}px ${vh}px, 0px ${vh}px, 0px 0px, ${l}px ${t}px, ${l}px ${bottom}px, ${right}px ${bottom}px, ${right}px ${t}px, ${l}px ${t}px)`;
  }

  tooltipStyle(): Record<string, string> {
    const r = this.rect();
    const step = this.tour.currentStep();
    const placement = step?.placement ?? (r ? 'bottom' : 'center');
    if (!r || placement === 'center') {
      return { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
    }
    const gap = 16;
    const width = 360;
    const heightEstimate = 260;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const maxLeft = Math.max(12, vw - width - 12);
    const maxTop = Math.max(12, vh - heightEstimate - 12);
    let top: number;
    let left: number;
    switch (placement) {
      case 'top':
        left = clamp(r.left + r.width / 2 - width / 2, 12, maxLeft);
        top = clamp(r.top - gap - heightEstimate, 12, maxTop);
        break;
      case 'left':
        left = clamp(r.left - gap - width, 12, maxLeft);
        top = clamp(r.top, 12, maxTop);
        break;
      case 'right':
        left = clamp(r.left + r.width + gap, 12, maxLeft);
        top = clamp(r.top, 12, maxTop);
        break;
      case 'bottom':
      default:
        left = clamp(r.left + r.width / 2 - width / 2, 12, maxLeft);
        top = clamp(r.top + r.height + gap, 12, maxTop);
        break;
    }
    return { position: 'fixed', left: `${left}px`, top: `${top}px`, width: `${width}px` };
  }

  next(): void { this.tour.next(); }
  back(): void { this.tour.back(); }
  skip(): void { this.tour.end(); }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(v, max));
}
