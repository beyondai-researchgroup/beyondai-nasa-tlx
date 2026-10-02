import { Component, OnInit, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { TlxStateService } from '../services/tlx-state.service';
import { DatabaseService } from '../services/database.service';
import { TLX_LANG_KEY } from '../utils/study';

type LinkStatus = 'loading' | 'already' | 'error';
type LinkErrorCode = 'NOT_FOUND' | 'EXPIRED' | 'NOT_ACTIVE' | 'SERVER_ERROR';

/**
 * Landing page for the emailed magic-link (`/link/:token`, issued by the Consent app) — Part D
 * of the platform re-architecture (2026-09-07), making NASA-TLX usable as a standalone module for
 * a research that doesn't go through code-review-ai's Intro/AI/Report handoff at all (see
 * `/start`/AutoStartComponent for that other entry point, which stays unchanged). On a valid,
 * unexpired, not-yet-completed token this sets a single 'Samostalna sesija' TLX session straight
 * from the resolved participant/language/config (no login form, no session picker — everything's
 * already decided upstream) and routes to `/instructions`. Anything else shows a translated
 * explanation instead. Mirrors rei40-andrejkatin/bigfive-andrejkatin's own LinkAccessComponent.
 */
@Component({
  selector: 'app-link-access',
  standalone: true,
  imports: [TranslateModule],
  template: `
    <div class="page-centered">
      <div class="card link-card">
        @switch (status()) {
          @case ('loading') {
            <p class="link-text">{{ 'LINK.LOADING' | translate }}</p>
          }
          @case ('already') {
            <span class="link-icon" aria-hidden="true">✓</span>
            <h1 class="link-title">{{ 'LINK.ALREADY_TITLE' | translate }}</h1>
            <p class="link-text">{{ 'LINK.ALREADY_TEXT' | translate }}</p>
          }
          @case ('error') {
            <h1 class="link-title">{{ 'LINK.ERROR_TITLE' | translate }}</h1>
            @switch (errorCode()) {
              @case ('EXPIRED') {
                <p class="link-text">{{ 'LINK.ERROR_EXPIRED' | translate }}</p>
              }
              @case ('NOT_FOUND') {
                <p class="link-text">{{ 'LINK.ERROR_NOT_FOUND' | translate }}</p>
              }
              @case ('NOT_ACTIVE') {
                <p class="link-text">{{ 'LINK.ERROR_NOT_ACTIVE' | translate }}</p>
              }
              @default {
                <p class="link-text">{{ 'LINK.ERROR_SERVER' | translate }}</p>
              }
            }
          }
        }
      </div>
    </div>
  `,
  styles: [`
    .page-centered {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 24px;
    }
    .link-card {
      max-width: 460px;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      padding: 32px;
    }
    .link-icon {
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: rgba(var(--color-accent-rgb, 0, 255, 136), 0.15);
      color: var(--color-accent, #00ff88);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 28px;
      margin-bottom: 8px;
    }
    .link-title {
      font-size: 22px;
      font-weight: 700;
    }
    .link-text {
      color: var(--color-muted, #8a94a3);
      margin: 0;
      line-height: 1.6;
    }
  `],
})
export class LinkAccessComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private db = inject(DatabaseService);
  private state = inject(TlxStateService);
  private translate = inject(TranslateService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly status = signal<LinkStatus>('loading');
  readonly errorCode = signal<LinkErrorCode | null>(null);

  async ngOnInit(): Promise<void> {
    if (!this.isBrowser) return;

    const token = this.route.snapshot.paramMap.get('token');
    if (!token) {
      this.status.set('error');
      this.errorCode.set('NOT_FOUND');
      return;
    }

    const result = await this.db.resolveLink(token);
    if (result.ok) {
      this.translate.use(result.lang);
      try { sessionStorage.setItem(TLX_LANG_KEY, result.lang); } catch { /* storage unavailable */ }

      this.state.reset();
      this.state.setSession({
        sessionId: 'Samostalna sesija',
        participantId: result.participantId,
        config: result.config,
        // No dbSessionId — this participant isn't going through the fixed ParticipantSession
        // (Intro/AI/Report) rows at all, so there's nothing to mark finished after saving.
      });

      this.router.navigate(['/instructions'], { replaceUrl: true });
      return;
    }

    if (result.error === 'ALREADY_COMPLETED') {
      this.status.set('already');
    } else {
      this.status.set('error');
      this.errorCode.set(result.error);
    }
  }
}
