import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { TlxStateService, ScaleName, Weightings } from '../services/tlx-state.service';
import { SCALE_NAMES } from '../utils/scoring';
import { SCALE_I18N_KEYS } from '../utils/scale-keys';
import { fisherYatesShuffle } from '../utils/shuffle';

interface ScaleInfo {
  name: ScaleName;
  nameKey: string;
  descKey: string;
}

interface Pair {
  a: ScaleInfo;
  b: ScaleInfo;
}

const SCALE_DESC_KEYS: Record<ScaleName, string> = {
  'Mentalni zahtev':  'SCALE.MENTAL_DEMAND.DESC_COMPARISONS',
  'Fizički zahtev':   'SCALE.PHYSICAL_DEMAND.DESC_COMPARISONS',
  'Vremenski pritisak':'SCALE.TEMPORAL_DEMAND.DESC_COMPARISONS',
  'Performansa':       'SCALE.PERFORMANCE.DESC_COMPARISONS',
  'Napor':             'SCALE.EFFORT.DESC_COMPARISONS',
  'Frustracija':       'SCALE.FRUSTRATION.DESC_COMPARISONS',
};

function buildAllPairs(): Pair[] {
  const pairs: Pair[] = [];
  for (let i = 0; i < SCALE_NAMES.length; i++) {
    for (let j = i + 1; j < SCALE_NAMES.length; j++) {
      const a = SCALE_NAMES[i];
      const b = SCALE_NAMES[j];
      pairs.push({
        a: { name: a, nameKey: SCALE_I18N_KEYS[a] + '.NAME', descKey: SCALE_DESC_KEYS[a] },
        b: { name: b, nameKey: SCALE_I18N_KEYS[b] + '.NAME', descKey: SCALE_DESC_KEYS[b] },
      });
    }
  }
  return pairs;
}

@Component({
  selector: 'app-comparisons',
  standalone: true,
  imports: [TranslateModule],
  templateUrl: './comparisons.component.html',
  styleUrl: './comparisons.component.scss',
})
export class ComparisonsComponent implements OnInit, OnDestroy {
  private state = inject(TlxStateService);
  private router = inject(Router);

  pairs: Pair[] = [];
  currentIndex = signal(0);
  selecting = signal(false);
  private advanceTimer: ReturnType<typeof setTimeout> | null = null;

  get total(): number { return this.pairs.length; }
  get current(): Pair { return this.pairs[this.currentIndex()]; }
  get progressPct(): number { return (this.currentIndex() / this.total) * 100; }

  ngOnInit(): void {
    this.pairs = fisherYatesShuffle(buildAllPairs());
  }

  ngOnDestroy(): void {
    if (this.advanceTimer !== null) clearTimeout(this.advanceTimer);
  }

  choose(winner: ScaleName): void {
    if (this.selecting()) return;
    this.selecting.set(true);

    this.advanceTimer = setTimeout(() => {
      this.advanceTimer = null;
      this.tally(winner);
      if (this.currentIndex() < this.total - 1) {
        this.currentIndex.update(i => i + 1);
        this.selecting.set(false);
      } else {
        this.finalize();
      }
    }, 220);
  }

  goBack(): void {
    if (this.selecting()) return;
    if (this.currentIndex() === 0) {
      this.router.navigate(['/scales']);
      return;
    }
    this.picks.pop();
    this.currentIndex.update(i => i - 1);
  }

  private picks: ScaleName[] = [];

  private tally(winner: ScaleName): void {
    this.picks.push(winner);
  }

  private finalize(): void {
    const w: Weightings = Object.fromEntries(SCALE_NAMES.map(n => [n, 0])) as Weightings;
    for (const pick of this.picks) w[pick]++;
    this.state.setWeightings(w);
    this.state.markComparisonsCompleted();
    this.router.navigate(['/review']);
  }
}
