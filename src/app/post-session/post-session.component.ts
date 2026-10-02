import { Component, computed, inject, signal } from '@angular/core';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { TlxStateService } from '../services/tlx-state.service';
import { DatabaseService, PostSessionResponseDto } from '../services/database.service';
import { resolveBeyondAiUrl } from '../utils/study';

type SubmitStatus = 'idle' | 'saving' | 'error';

/** The 5 Likert buttons, shared by Q1-Q4. */
const LIKERT_VALUES = [1, 2, 3, 4, 5] as const;

/**
 * Post-session questionnaire (2026-10-01) — a short, fixed 5-question form (3 generic Likert
 * questions + 1 Likert question whose wording varies by session type + 1 optional free-text
 * question), shown right after the TLX scale is saved, study-flow sessions only (dbSessionId
 * defined — see ResultsComponent.autoSave). The study session (ParticipantSession.IsFinished)
 * is deliberately NOT marked finished until this form is submitted — see submit() below, which
 * moved that logic (and the "session finished"/"intro done" popups) here from ResultsComponent.
 */
@Component({
  selector: 'app-post-session',
  standalone: true,
  imports: [TranslateModule],
  templateUrl: './post-session.component.html',
  styleUrl: './post-session.component.scss',
})
export class PostSessionComponent {
  private state = inject(TlxStateService);
  private translate = inject(TranslateService);
  private db = inject(DatabaseService);

  readonly likertValues = LIKERT_VALUES;

  readonly session = computed(() => this.state.session()!);
  readonly dbSessionId = computed(() => this.session().dbSessionId!);

  /** Which translated Q4 wording to show — one per session type (Intro/AI/Report/Hybrid). */
  readonly q4LabelKey = computed(() => {
    switch (this.dbSessionId()) {
      case 1: return 'POST_SESSION.Q4_INTRO';
      case 2: return 'POST_SESSION.Q4_AI';
      case 3: return 'POST_SESSION.Q4_REPORT';
      case 4: return 'POST_SESSION.Q4_HYBRID';
      default: return 'POST_SESSION.Q4_AI';
    }
  });

  readonly q1 = signal<number | null>(null);
  readonly q2 = signal<number | null>(null);
  readonly q3 = signal<number | null>(null);
  readonly q4 = signal<number | null>(null);
  readonly q5 = signal('');

  readonly canSubmit = computed(() =>
    this.q1() !== null && this.q2() !== null && this.q3() !== null && this.q4() !== null
  );

  readonly submitStatus = signal<SubmitStatus>('idle');
  readonly showSessionDonePopup = signal(false);
  // Intro's own "done" state is distinct from the generic one below — a participant who just
  // finished Intro+its TLX scale+this questionnaire should see a clear "we'll be in touch"
  // message instead of being auto-redirected back into code-review-ai (AI/Report requires a
  // researcher-administered Baseline measurement, so looping back there would just surface the
  // Baseline-pending banner — a worse experience than a clean stop here).
  readonly showIntroDonePopup = signal(false);

  async submit(): Promise<void> {
    if (!this.canSubmit() || this.submitStatus() === 'saving') return;
    this.submitStatus.set('saving');

    const session = this.session();
    const dto: PostSessionResponseDto = {
      participantId: session.participantId,
      sessionId: this.dbSessionId(),
      language: this.translate.currentLang || 'sr',
      answers: {
        q1: this.q1()!,
        q2: this.q2()!,
        q3: this.q3()!,
        q4: this.q4()!,
        q5: this.q5().trim() || null,
      },
    };

    try {
      await this.db.savePostSessionResponse(dto);
      await this.finishStudySession(session.participantId, this.dbSessionId());
    } catch (err) {
      console.error('[TLX] saving post-session response failed:', err);
      this.submitStatus.set('error');
    }
  }

  retrySubmit(): void {
    if (this.submitStatus() === 'saving') return;
    void this.submit();
  }

  /** Flips the ParticipantSession flag and pops the "session finished" notification — moved
   *  here from ResultsComponent (2026-10-01) so it only fires once this questionnaire is done,
   *  not right after the TLX scale. A flag-update failure is logged but does not disturb the
   *  participant — both the TLX result and this questionnaire's answer are already saved. */
  private async finishStudySession(participantId: string, dbSessionId: number): Promise<void> {
    try {
      await this.db.markSessionFinished(participantId, dbSessionId);
    } catch (err) {
      console.error('[TLX] marking study session finished failed:', err);
    }
    if (dbSessionId === 1) {
      this.showIntroDonePopup.set(true);
    } else {
      this.showSessionDonePopup.set(true);
    }
  }

  /** OK on the "session finished" popup → clear local state and return to BeyondAI — a real
   *  participant's own personal link when one was resolved (the handoff flow), a bare URL
   *  otherwise (a test participant). */
  closeSessionDonePopup(): void {
    const linkToken = this.session().codeReviewLinkToken ?? null;
    this.state.reset();
    window.location.href = resolveBeyondAiUrl(linkToken);
  }

  /** OK on the Intro-specific "done" popup — deliberately no redirect back into code-review-ai
   *  (see showIntroDonePopup's own doc comment above). Just clears local state. */
  closeIntroDonePopup(): void {
    this.state.reset();
    this.showIntroDonePopup.set(false);
  }
}
