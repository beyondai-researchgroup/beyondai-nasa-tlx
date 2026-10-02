import { Component, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router, RouterOutlet } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { GlobalHeaderComponent } from './global-header/global-header.component';
import { TourOverlayComponent } from './tour-overlay/tour-overlay.component';
import { TimerDisplayComponent } from './shared/timer-display/timer-display.component';
import { TlxStateService } from './services/tlx-state.service';
import { DatabaseService, TlxResultDto } from './services/database.service';
import { computeRawTLX, computeWeightedTLX } from './utils/scoring';
import { TLX_LANG_KEY } from './utils/study';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, GlobalHeaderComponent, TourOverlayComponent, TimerDisplayComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  private translate = inject(TranslateService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  // Per-app participant timer (2026-09-11) — hosted globally (not on a single page, unlike
  // REI-40/Big Five's one-page test) since NASA-TLX's flow spans instructions → scales →
  // (optional) comparisons → results; the timer covers the whole thing from the moment a session
  // exists, mirroring what "reaching the test page" means for the single-page apps.
  private state = inject(TlxStateService);
  private db = inject(DatabaseService);
  private router = inject(Router);
  readonly tlxState = this.state;

  constructor() {
    this.translate.setDefaultLang('sr');
    // The language is chosen once at BeyondAI login and handed off via /start,
    // which stores it in sessionStorage — restore it here so a mid-flow page
    // refresh keeps the locked language instead of falling back to Serbian.
    let lang = 'sr';
    if (this.isBrowser) {
      try { lang = sessionStorage.getItem(TLX_LANG_KEY) === 'en' ? 'en' : 'sr'; } catch { /* ignore */ }
    }
    this.translate.use(lang);
  }

  /** Fired by <app-timer-display> exactly once, on expiry. Pulls in whatever the currently-
   *  mounted page has uncommitted (see TlxStateService.flushCurrentPage), then saves a
   *  timed-out result built from whatever's actually there — an untouched scale is sent as
   *  `null`, never a slider's default position, matching REI-40/Big Five's "never fabricate an
   *  answer nobody gave" rule for their own timer auto-submit. */
  async onTimerExpired(): Promise<void> {
    if (this.state.resultSaved()) return; // already finished normally in the meantime
    const session = this.state.session();
    if (!session) return; // timer shouldn't be rendered without a session, but guard anyway

    this.state.flushCurrentPage();

    const scales = this.state.scales();
    const touched = new Set(this.state.scalesTouched());
    const w = this.state.weightings();
    // Only a genuinely complete, all-touched set of scales counts as real data for a raw/
    // weighted score — a mean over untouched slider defaults would be fabricated, not just
    // incomplete (same "never fabricate" rule REI-40/Big Five's own timer changes follow).
    const allTouched = scales !== null && (['mentalDemand', 'physicalDemand', 'temporalDemand', 'performance', 'effort', 'frustration'] as const).every((k) => touched.has(k));

    const valueOrNull = (key: 'mentalDemand' | 'physicalDemand' | 'temporalDemand' | 'performance' | 'effort' | 'frustration'): number | null =>
      scales && touched.has(key) ? scales[key] : null;

    const started = this.state.startedAt();
    const scalesDone = this.state.scalesCompletedAt();
    const comparisonsDone = this.state.comparisonsCompletedAt();
    const sec = (from: number | null, to: number | null) =>
      from !== null && to !== null && to >= from ? Math.round((to - from) / 1000) : null;

    const dto: TlxResultDto = {
      participantId: session.participantId,
      sessionId: session.sessionId,
      language: this.translate.currentLang || 'sr',
      mentalDemand: valueOrNull('mentalDemand'),
      physicalDemand: valueOrNull('physicalDemand'),
      temporalDemand: valueOrNull('temporalDemand'),
      performance: valueOrNull('performance'),
      effort: valueOrNull('effort'),
      frustration: valueOrNull('frustration'),
      weightMental: w ? w['Mentalni zahtev'] : null,
      weightPhysical: w ? w['Fizički zahtev'] : null,
      weightTemporal: w ? w['Vremenski pritisak'] : null,
      weightPerf: w ? w['Performansa'] : null,
      weightEffort: w ? w['Napor'] : null,
      weightFrust: w ? w['Frustracija'] : null,
      rawTLX: allTouched && session.config.calculateScores ? computeRawTLX(scales!) : null,
      weightedTLX:
        allTouched && session.config.calculateScores && session.config.includeWeightings && w
          ? computeWeightedTLX(scales!, w)
          : null,
      configScores: session.config.calculateScores,
      configWeightings: session.config.includeWeightings,
      durationTotalSec: sec(started, comparisonsDone ?? scalesDone),
      durationScalesSec: sec(started, scalesDone),
      durationComparisonsSec: sec(scalesDone, comparisonsDone),
      isTimedOut: true,
    };

    try {
      await this.db.saveTlxResult(dto);
      this.state.markResultSaved();
    } catch (err) {
      console.error('[TLX] timed-out save failed:', err);
      // Falls through to navigation regardless — ResultsComponent's own autoSave() will retry
      // from whatever state.scales()/weightings() now hold (flushed above), same as a normal
      // page-load-time save attempt.
    }
    this.router.navigate(['/results']);
  }
}
