import { Component, OnInit, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { TlxStateService } from '../services/tlx-state.service';
import { ThemeService } from '../services/theme.service';
import { DatabaseService } from '../services/database.service';
import { DB_SESSION_TO_TLX, TLX_LANG_KEY } from '../utils/study';

/**
 * Entry point for the BeyondAI → NASA TLX handoff.
 *
 * Real (non-test) participants arrive with `?h=<handoff token>&theme=dark|light` — the token
 * (minted by code-review-ai on decision submit) is resolved server-side to the participant id,
 * study session, and locked language; nothing identifying the participant ever appears in this
 * URL. Test participants (repeatable, fixed — see Participant.IsTestParticipant) still arrive
 * with the legacy `?participantId=…&sessionId=1|2|3&lang=sr|en&theme=…` shape, since they have no
 * personal link to carry a token in the first place — that shape is now gated on
 * TlxConfigDto.isTestParticipant, resolved (fail-closed) via the same DB round-trip that already
 * fetches the TLX structure config, so it can no longer be used against a real participant just
 * by knowing/guessing their id.
 *
 * Either way, the component seeds the TLX session — its calculateScores/includeWeightings
 * structure comes from the participant's research config (BeyondAI Admin Dashboard's Study
 * Configuration page) instead of always hardcoding the full procedure — locks the language and
 * theme chosen at BeyondAI and jumps straight to the instructions — the manual /login page is
 * bypassed entirely.
 */
@Component({
  selector: 'app-auto-start',
  standalone: true,
  template: '',
})
export class AutoStartComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private state = inject(TlxStateService);
  private translate = inject(TranslateService);
  private themeService = inject(ThemeService);
  private db = inject(DatabaseService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  async ngOnInit(): Promise<void> {
    if (!this.isBrowser) return;

    const params = this.route.snapshot.queryParamMap;
    const theme = params.get('theme') === 'light' ? 'light' : 'dark';
    const handoffToken = params.get('h')?.trim();

    if (handoffToken) {
      await this.startFromHandoffToken(handoffToken, theme);
      return;
    }
    await this.startFromLegacyParams(theme);
  }

  private async startFromHandoffToken(token: string, theme: 'dark' | 'light'): Promise<void> {
    const result = await this.db.resolveHandoff(token);
    if (result.status !== 'ok') {
      this.router.navigate(['/login']);
      return;
    }

    const tlxSessionId = DB_SESSION_TO_TLX[result.dbSessionId];
    if (!tlxSessionId) {
      this.router.navigate(['/login']);
      return;
    }

    this.translate.use(result.lang);
    try { sessionStorage.setItem(TLX_LANG_KEY, result.lang); } catch { /* storage unavailable */ }
    this.themeService.setTheme(theme);

    this.state.reset();
    this.state.setSession({
      sessionId: tlxSessionId,
      participantId: result.participantId,
      config: result.config,
      dbSessionId: result.dbSessionId,
      codeReviewLinkToken: result.codeReviewLinkToken,
    });

    this.router.navigate(['/instructions'], { replaceUrl: true });
  }

  private async startFromLegacyParams(theme: 'dark' | 'light'): Promise<void> {
    const params = this.route.snapshot.queryParamMap;
    const participantId = params.get('participantId')?.trim() ?? '';
    const dbSessionId = Number(params.get('sessionId'));
    const lang = params.get('lang') === 'en' ? 'en' : 'sr';
    const tlxSessionId = DB_SESSION_TO_TLX[dbSessionId];

    if (!participantId || !tlxSessionId) {
      this.router.navigate(['/login']);
      return;
    }

    const config = await this.db.getTlxConfig(participantId);
    if (!config.isTestParticipant) {
      // Real participants can no longer reach /start with a bare participant id/session number —
      // only a valid handoff token (see startFromHandoffToken above).
      this.router.navigate(['/login']);
      return;
    }

    this.translate.use(lang);
    try { sessionStorage.setItem(TLX_LANG_KEY, lang); } catch { /* storage unavailable */ }
    this.themeService.setTheme(theme);

    this.state.reset();
    this.state.setSession({
      sessionId: tlxSessionId,
      participantId,
      config,
      dbSessionId,
      codeReviewLinkToken: null,
    });

    this.router.navigate(['/instructions'], { replaceUrl: true });
  }
}