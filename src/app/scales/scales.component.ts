import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { TlxStateService } from '../services/tlx-state.service';

interface ScaleConfig {
  key: 'mentalDemand' | 'physicalDemand' | 'temporalDemand' | 'performance' | 'effort' | 'frustration';
  nameKey: string;
  descKey: string;
  inverted: boolean;
  labelLowKey: string;
  labelHighKey: string;
}

@Component({
  selector: 'app-scales',
  standalone: true,
  imports: [TranslateModule],
  templateUrl: './scales.component.html',
  styleUrl: './scales.component.scss',
})
export class ScalesComponent {
  private state = inject(TlxStateService);
  private router = inject(Router);

  readonly scaleConfigs: ScaleConfig[] = [
    {
      key: 'mentalDemand',
      nameKey: 'SCALE.MENTAL_DEMAND.NAME',
      descKey: 'SCALE.MENTAL_DEMAND.DESC_SCALES',
      inverted: false,
      labelLowKey: 'SCALE.MENTAL_DEMAND.LABEL_LOW',
      labelHighKey: 'SCALE.MENTAL_DEMAND.LABEL_HIGH',
    },
    {
      key: 'physicalDemand',
      nameKey: 'SCALE.PHYSICAL_DEMAND.NAME',
      descKey: 'SCALE.PHYSICAL_DEMAND.DESC_SCALES',
      inverted: false,
      labelLowKey: 'SCALE.PHYSICAL_DEMAND.LABEL_LOW',
      labelHighKey: 'SCALE.PHYSICAL_DEMAND.LABEL_HIGH',
    },
    {
      key: 'temporalDemand',
      nameKey: 'SCALE.TEMPORAL_DEMAND.NAME',
      descKey: 'SCALE.TEMPORAL_DEMAND.DESC_SCALES',
      inverted: false,
      labelLowKey: 'SCALE.TEMPORAL_DEMAND.LABEL_LOW',
      labelHighKey: 'SCALE.TEMPORAL_DEMAND.LABEL_HIGH',
    },
    {
      key: 'performance',
      nameKey: 'SCALE.PERFORMANCE.NAME',
      descKey: 'SCALE.PERFORMANCE.DESC_SCALES',
      inverted: true,
      labelLowKey: 'SCALE.PERFORMANCE.LABEL_LOW',
      labelHighKey: 'SCALE.PERFORMANCE.LABEL_HIGH',
    },
    {
      key: 'effort',
      nameKey: 'SCALE.EFFORT.NAME',
      descKey: 'SCALE.EFFORT.DESC_SCALES',
      inverted: false,
      labelLowKey: 'SCALE.EFFORT.LABEL_LOW',
      labelHighKey: 'SCALE.EFFORT.LABEL_HIGH',
    },
    {
      key: 'frustration',
      nameKey: 'SCALE.FRUSTRATION.NAME',
      descKey: 'SCALE.FRUSTRATION.DESC_SCALES',
      inverted: false,
      labelLowKey: 'SCALE.FRUSTRATION.LABEL_LOW',
      labelHighKey: 'SCALE.FRUSTRATION.LABEL_HIGH',
    },
  ];

  values = signal<Record<string, number>>(this.buildInitialValues());

  // Participants must interact with every slider before continuing — a value
  // left at its default is indistinguishable from a deliberate rating.
  touchedKeys = signal<Set<string>>(new Set(this.state.scalesTouched()));
  readonly touchedCount = computed(() => this.touchedKeys().size);
  readonly allTouched = computed(() => this.touchedKeys().size === this.scaleConfigs.length);

  private buildInitialValues(): Record<string, number> {
    const existing = this.state.scales();
    if (!existing) {
      return {
        mentalDemand: 0,
        physicalDemand: 0,
        temporalDemand: 0,
        performance: 100,
        effort: 0,
        frustration: 0,
      };
    }
    return {
      mentalDemand: existing.mentalDemand,
      physicalDemand: existing.physicalDemand,
      temporalDemand: existing.temporalDemand,
      performance: 100 - existing.performance,
      effort: existing.effort,
      frustration: existing.frustration,
    };
  }

  get includeWeightings(): boolean {
    return this.state.session()?.config.includeWeightings ?? true;
  }

  fillPercent(value: number): string {
    return `${value}%`;
  }

  nativeValue(scale: ScaleConfig): number {
    const v = this.values()[scale.key];
    return scale.inverted ? 100 - v : v;
  }

  onSliderChange(scale: ScaleConfig, event: Event): void {
    const raw = Number((event.target as HTMLInputElement).value);
    const displayed = scale.inverted ? 100 - raw : raw;
    this.values.update(v => ({ ...v, [scale.key]: displayed }));
    if (!this.touchedKeys().has(scale.key)) {
      const next = new Set(this.touchedKeys());
      next.add(scale.key);
      this.touchedKeys.set(next);
      this.state.setScalesTouched([...next]);
    }
  }

  private persistCurrentValues(): void {
    const v = this.values();
    this.state.setScales({
      mentalDemand: v['mentalDemand'],
      physicalDemand: v['physicalDemand'],
      temporalDemand: v['temporalDemand'],
      performance: 100 - v['performance'],
      effort: v['effort'],
      frustration: v['frustration'],
    });
  }

  goBack(): void {
    this.persistCurrentValues();
    this.router.navigate(['/instructions']);
  }

  submit(): void {
    if (!this.allTouched()) return;
    this.persistCurrentValues();
    this.state.markScalesCompleted();

    if (this.includeWeightings && !this.state.weightings()) {
      this.router.navigate(['/comparisons']);
    } else {
      this.router.navigate(['/review']);
    }
  }
}
