import { Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { TlxStateService, ScaleName } from '../services/tlx-state.service';
import { SCALE_NAMES, scaleValuesToRecord } from '../utils/scoring';
import { SCALE_I18N_KEYS } from '../utils/scale-keys';

interface ReviewRow {
  name: ScaleName;
  nameKey: string;
  // Value as the participant saw it on the slider (Performance shown
  // un-inverted so it matches what they set).
  displayed: number;
}

@Component({
  selector: 'app-review',
  standalone: true,
  imports: [TranslateModule],
  templateUrl: './review.component.html',
  styleUrl: './review.component.scss',
})
export class ReviewComponent {
  private state = inject(TlxStateService);
  private router = inject(Router);

  readonly rows = computed<ReviewRow[]>(() => {
    const scales = this.state.scales();
    if (!scales) return [];
    const rec = scaleValuesToRecord(scales);
    return SCALE_NAMES.map(name => ({
      name,
      nameKey: SCALE_I18N_KEYS[name] + '.NAME',
      displayed: name === 'Performansa' ? 100 - rec[name] : rec[name],
    }));
  });

  back(): void {
    this.router.navigate(['/scales']);
  }

  confirm(): void {
    this.router.navigate(['/results']);
  }
}
