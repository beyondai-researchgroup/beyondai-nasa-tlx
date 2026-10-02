import { Component, computed, HostListener, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { TlxStateService } from '../services/tlx-state.service';
import { TourService } from '../services/tour.service';

interface ScaleConfig {
  key: 'mentalDemand' | 'physicalDemand' | 'temporalDemand' | 'performance' | 'effort' | 'frustration';
  nameKey: string;
  descKey: string;
  detailKey: string;
  exampleKey: string;
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
export class ScalesComponent implements OnInit, OnDestroy {
  private state = inject(TlxStateService);
  private router = inject(Router);
  private tour = inject(TourService);
  private translate = inject(TranslateService);

  readonly scaleConfigs: ScaleConfig[] = [
    {
      key: 'mentalDemand',
      nameKey: 'SCALE.MENTAL_DEMAND.NAME',
      descKey: 'SCALE.MENTAL_DEMAND.DESC_SCALES',
      detailKey: 'SCALE.MENTAL_DEMAND.DESC_DETAILED',
      exampleKey: 'SCALE.MENTAL_DEMAND.EXAMPLE',
      inverted: false,
      labelLowKey: 'SCALE.MENTAL_DEMAND.LABEL_LOW',
      labelHighKey: 'SCALE.MENTAL_DEMAND.LABEL_HIGH',
    },
    {
      key: 'physicalDemand',
      nameKey: 'SCALE.PHYSICAL_DEMAND.NAME',
      descKey: 'SCALE.PHYSICAL_DEMAND.DESC_SCALES',
      detailKey: 'SCALE.PHYSICAL_DEMAND.DESC_DETAILED',
      exampleKey: 'SCALE.PHYSICAL_DEMAND.EXAMPLE',
      inverted: false,
      labelLowKey: 'SCALE.PHYSICAL_DEMAND.LABEL_LOW',
      labelHighKey: 'SCALE.PHYSICAL_DEMAND.LABEL_HIGH',
    },
    {
      key: 'temporalDemand',
      nameKey: 'SCALE.TEMPORAL_DEMAND.NAME',
      descKey: 'SCALE.TEMPORAL_DEMAND.DESC_SCALES',
      detailKey: 'SCALE.TEMPORAL_DEMAND.DESC_DETAILED',
      exampleKey: 'SCALE.TEMPORAL_DEMAND.EXAMPLE',
      inverted: false,
      labelLowKey: 'SCALE.TEMPORAL_DEMAND.LABEL_LOW',
      labelHighKey: 'SCALE.TEMPORAL_DEMAND.LABEL_HIGH',
    },
    {
      key: 'performance',
      nameKey: 'SCALE.PERFORMANCE.NAME',
      descKey: 'SCALE.PERFORMANCE.DESC_SCALES',
      detailKey: 'SCALE.PERFORMANCE.DESC_DETAILED',
      exampleKey: 'SCALE.PERFORMANCE.EXAMPLE',
      inverted: true,
      labelLowKey: 'SCALE.PERFORMANCE.LABEL_LOW',
      labelHighKey: 'SCALE.PERFORMANCE.LABEL_HIGH',
    },
    {
      key: 'effort',
      nameKey: 'SCALE.EFFORT.NAME',
      descKey: 'SCALE.EFFORT.DESC_SCALES',
      detailKey: 'SCALE.EFFORT.DESC_DETAILED',
      exampleKey: 'SCALE.EFFORT.EXAMPLE',
      inverted: false,
      labelLowKey: 'SCALE.EFFORT.LABEL_LOW',
      labelHighKey: 'SCALE.EFFORT.LABEL_HIGH',
    },
    {
      key: 'frustration',
      nameKey: 'SCALE.FRUSTRATION.NAME',
      descKey: 'SCALE.FRUSTRATION.DESC_SCALES',
      detailKey: 'SCALE.FRUSTRATION.DESC_DETAILED',
      exampleKey: 'SCALE.FRUSTRATION.EXAMPLE',
      inverted: false,
      labelLowKey: 'SCALE.FRUSTRATION.LABEL_LOW',
      labelHighKey: 'SCALE.FRUSTRATION.LABEL_HIGH',
    },
  ];

  readonly selectedScale = signal<ScaleConfig | null>(null);

  constructor() {
    if (this.state.session()?.dbSessionId === 1 && !this.state.isTourShown('scales')) {
      this.state.markTourShown('scales');
      this.translate.get([
        'TOUR.SCALES_INTRO_TITLE', 'TOUR.SCALES_INTRO_BODY',
        'TOUR.SCALES_INFO_TITLE', 'TOUR.SCALES_INFO_BODY',
        'TOUR.SCALES_STATUS_TITLE', 'TOUR.SCALES_STATUS_BODY',
        'TOUR.SCALES_PERFORMANCE_TITLE', 'TOUR.SCALES_PERFORMANCE_BODY',
        'TOUR.SCALES_NEXT_TITLE', 'TOUR.SCALES_NEXT_BODY',
      ]).subscribe(t => {
        this.tour.start([
          {
            target: '.scales-list',
            placement: 'right',
            title: t['TOUR.SCALES_INTRO_TITLE'],
            body: t['TOUR.SCALES_INTRO_BODY'],
          },
          {
            target: '.scale-info-btn',
            placement: 'right',
            title: t['TOUR.SCALES_INFO_TITLE'],
            body: t['TOUR.SCALES_INFO_BODY'],
          },
          {
            target: '.scale-status',
            placement: 'left',
            title: t['TOUR.SCALES_STATUS_TITLE'],
            body: t['TOUR.SCALES_STATUS_BODY'],
          },
          {
            target: '.scale-row[data-scale="performance"]',
            placement: 'right',
            title: t['TOUR.SCALES_PERFORMANCE_TITLE'],
            body: t['TOUR.SCALES_PERFORMANCE_BODY'],
          },
          {
            target: '.scales-footer-next',
            placement: 'top',
            title: t['TOUR.SCALES_NEXT_TITLE'],
            body: t['TOUR.SCALES_NEXT_BODY'],
          },
        ]);
      });
    }
  }

  openModal(scale: ScaleConfig): void {
    this.selectedScale.set(scale);
  }

  closeModal(): void {
    this.selectedScale.set(null);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeModal();
  }

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

  isTouched(scale: ScaleConfig): boolean {
    return this.touchedKeys().has(scale.key);
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

  // Per-app participant timer (2026-09-11) — registered while this page is mounted so a global
  // timer expiry can pull in whatever's currently on the sliders before saving, even if the
  // participant never clicked Submit/Back (which are the only two points that normally call
  // persistCurrentValues()).
  private readonly flushFn = () => this.persistCurrentValues();

  ngOnInit(): void {
    this.state.registerFlush(this.flushFn);
  }

  ngOnDestroy(): void {
    this.state.unregisterFlush(this.flushFn);
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
      this.router.navigate(['/results']);
    }
  }
}
