import { Component, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { GlobalHeaderComponent } from './global-header/global-header.component';
import { TLX_LANG_KEY } from './utils/study';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, GlobalHeaderComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  private translate = inject(TranslateService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

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
}
