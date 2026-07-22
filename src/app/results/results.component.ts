import { Component, inject, computed, signal, OnInit, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { TranslateService, TranslateModule } from '@ngx-translate/core';
import { TlxStateService, ScaleName } from '../services/tlx-state.service';
import { SCALE_NAMES, computeRawTLX, computeWeightedTLX, scaleValuesToRecord } from '../utils/scoring';
import { SCALE_I18N_KEYS } from '../utils/scale-keys';
import { buildExportJson, buildFilename, downloadJson } from '../utils/export';
import { DatabaseService, TlxResultDto } from '../services/database.service';
import { BEYONDAI_URL } from '../utils/study';

interface ScaleRow {
  name: ScaleName;
  nameKey: string;
  raw: number;
  weight: number | null;
  weighted: number | null;
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

@Component({
  selector: 'app-results',
  standalone: true,
  imports: [TranslateModule],
  templateUrl: './results.component.html',
  styleUrl: './results.component.scss',
})
export class ResultsComponent implements OnInit {
  private state = inject(TlxStateService);
  private router = inject(Router);
  private translate = inject(TranslateService);
  private db = inject(DatabaseService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly session = computed(() => this.state.session()!);
  readonly scales = computed(() => this.state.scales()!);
  readonly weightings = computed(() => this.state.weightings());

  readonly showScores = computed(() => this.session().config.calculateScores);
  readonly hasWeightings = computed(() => !!this.weightings() && this.session().config.includeWeightings);

  readonly rawTLX = computed(() => computeRawTLX(this.scales()));

  readonly weightedTLX = computed(() => {
    const w = this.weightings();
    return w && this.hasWeightings() ? computeWeightedTLX(this.scales(), w) : null;
  });

  readonly scaleRows = computed<ScaleRow[]>(() => {
    const rec = scaleValuesToRecord(this.scales());
    const w = this.weightings();
    return SCALE_NAMES.map(name => {
      const raw = rec[name];
      const weight = w ? w[name] : null;
      const weighted = w && this.hasWeightings() ? Math.round((raw * w[name] / 15) * 10) / 10 : null;
      return { name, nameKey: SCALE_I18N_KEYS[name] + '.NAME', raw, weight, weighted };
    });
  });

  readonly saveStatus = signal<SaveStatus>('idle');
  readonly confirmingRestart = signal(false);
  readonly showSessionDonePopup = signal(false);

  ngOnInit(): void {
    if (!this.isBrowser) return;
    if (this.state.resultSaved()) {
      this.saveStatus.set('saved');
      return;
    }
    this.autoSave();
  }

  retrySave(): void {
    if (this.saveStatus() === 'saving' || this.state.resultSaved()) return;
    this.autoSave();
  }

  private async autoSave(): Promise<void> {
    const session = this.state.session();
    const scales = this.state.scales();
    if (!session || !scales) return;

    this.saveStatus.set('saving');

    const w = this.state.weightings();
    const dto: TlxResultDto = {
      participantId: session.participantId,
      sessionId: session.sessionId,
      language: this.translate.currentLang || 'sr',
      mentalDemand: scales.mentalDemand,
      physicalDemand: scales.physicalDemand,
      temporalDemand: scales.temporalDemand,
      performance: scales.performance,
      effort: scales.effort,
      frustration: scales.frustration,
      weightMental: w ? w['Mentalni zahtev'] : null,
      weightPhysical: w ? w['Fizički zahtev'] : null,
      weightTemporal: w ? w['Vremenski pritisak'] : null,
      weightPerf: w ? w['Performansa'] : null,
      weightEffort: w ? w['Napor'] : null,
      weightFrust: w ? w['Frustracija'] : null,
      rawTLX: session.config.calculateScores ? computeRawTLX(scales) : null,
      weightedTLX:
        session.config.calculateScores && session.config.includeWeightings && w
          ? computeWeightedTLX(scales, w)
          : null,
      configScores: session.config.calculateScores,
      configWeightings: session.config.includeWeightings,
      ...this.computeDurations(),
    };

    try {
      await this.db.saveTlxResult(dto);
      this.state.markResultSaved();
      this.saveStatus.set('saved');
      await this.finishStudySession(session.participantId, session.dbSessionId);
    } catch (err) {
      console.error('[TLX] saving result failed:', err);
      this.saveStatus.set('error');
    }
  }

  /**
   * Study flow (BeyondAI handoff) only: flips the ParticipantSession flag and pops
   * the "session finished" notification. A flag-update failure is logged but does
   * not disturb the participant — the TLX result itself is already saved.
   */
  private async finishStudySession(participantId: string, dbSessionId: number | undefined): Promise<void> {
    if (dbSessionId === undefined) return;
    try {
      await this.db.markSessionFinished(participantId, dbSessionId);
    } catch (err) {
      console.error('[TLX] marking study session finished failed:', err);
    }
    this.showSessionDonePopup.set(true);
  }

  /** OK on the "session finished" popup → clear local state and return to BeyondAI login. */
  closeSessionDonePopup(): void {
    this.state.reset();
    window.location.href = BEYONDAI_URL;
  }

  private computeDurations(): {
    durationTotalSec: number | null;
    durationScalesSec: number | null;
    durationComparisonsSec: number | null;
  } {
    const started = this.state.startedAt();
    const scalesDone = this.state.scalesCompletedAt();
    const comparisonsDone = this.state.comparisonsCompletedAt();
    const sec = (from: number | null, to: number | null) =>
      from !== null && to !== null && to >= from ? Math.round((to - from) / 1000) : null;
    return {
      durationTotalSec: sec(started, comparisonsDone ?? scalesDone),
      durationScalesSec: sec(started, scalesDone),
      durationComparisonsSec: sec(scalesDone, comparisonsDone),
    };
  }

  download(): void {
    const lang = this.translate.currentLang || 'sr';
    const d = this.computeDurations();
    const data = buildExportJson(this.session(), this.scales(), this.weightings(), lang, {
      totalSec: d.durationTotalSec,
      scalesSec: d.durationScalesSec,
      comparisonsSec: d.durationComparisonsSec,
    });
    downloadJson(data, buildFilename(this.session()));
  }

  restart(): void {
    this.confirmingRestart.set(true);
  }

  cancelRestart(): void {
    this.confirmingRestart.set(false);
  }

  confirmRestart(): void {
    this.state.reset();
    this.router.navigate(['/login']);
  }
}
