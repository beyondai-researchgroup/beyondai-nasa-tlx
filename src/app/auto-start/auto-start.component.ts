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
 * BeyondAI redirects here with `?participantId=…&sessionId=1|2|3&lang=sr|en&theme=dark|light`;
 * the component seeds the TLX session — its calculateScores/includeWeightings structure comes
 * from the participant's research config (BeyondAI Admin Dashboard's Study Configuration
 * page) instead of always hardcoding the full procedure — locks the language and theme chosen
 * at BeyondAI and jumps straight to the instructions — the manual /login page is bypassed
 * entirely.
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
    const participantId = params.get('participantId')?.trim() ?? '';
    const dbSessionId = Number(params.get('sessionId'));
    const lang = params.get('lang') === 'en' ? 'en' : 'sr';
    const theme = params.get('theme') === 'light' ? 'light' : 'dark';
    const tlxSessionId = DB_SESSION_TO_TLX[dbSessionId];

    if (!participantId || !tlxSessionId) {
      this.router.navigate(['/login']);
      return;
    }

    this.translate.use(lang);
    try { sessionStorage.setItem(TLX_LANG_KEY, lang); } catch { /* storage unavailable */ }
    this.themeService.setTheme(theme);

    const config = await this.db.getTlxConfig(participantId);

    this.state.reset();
    this.state.setSession({
      sessionId: tlxSessionId,
      participantId,
      config,
      dbSessionId,
    });

    this.router.navigate(['/instructions'], { replaceUrl: true });
  }
}