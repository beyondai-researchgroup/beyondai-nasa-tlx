import { Component, HostListener, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { TlxStateService } from '../services/tlx-state.service';

interface ScaleInfo {
  nameKey: string;
  descKey: string;
  detailKey: string;
  exampleKey: string;
}

@Component({
  selector: 'app-instructions',
  standalone: true,
  imports: [TranslateModule],
  templateUrl: './instructions.component.html',
  styleUrl: './instructions.component.scss',
})
export class InstructionsComponent {
  private state = inject(TlxStateService);
  private router = inject(Router);

  readonly scales: ScaleInfo[] = [
    { nameKey: 'SCALE.MENTAL_DEMAND.NAME',  descKey: 'SCALE.MENTAL_DEMAND.DESC_INSTRUCTIONS',  detailKey: 'SCALE.MENTAL_DEMAND.DESC_DETAILED',  exampleKey: 'SCALE.MENTAL_DEMAND.EXAMPLE'  },
    { nameKey: 'SCALE.PHYSICAL_DEMAND.NAME', descKey: 'SCALE.PHYSICAL_DEMAND.DESC_INSTRUCTIONS', detailKey: 'SCALE.PHYSICAL_DEMAND.DESC_DETAILED', exampleKey: 'SCALE.PHYSICAL_DEMAND.EXAMPLE' },
    { nameKey: 'SCALE.TEMPORAL_DEMAND.NAME', descKey: 'SCALE.TEMPORAL_DEMAND.DESC_INSTRUCTIONS', detailKey: 'SCALE.TEMPORAL_DEMAND.DESC_DETAILED', exampleKey: 'SCALE.TEMPORAL_DEMAND.EXAMPLE' },
    { nameKey: 'SCALE.PERFORMANCE.NAME',     descKey: 'SCALE.PERFORMANCE.DESC_INSTRUCTIONS',     detailKey: 'SCALE.PERFORMANCE.DESC_DETAILED',     exampleKey: 'SCALE.PERFORMANCE.EXAMPLE'     },
    { nameKey: 'SCALE.EFFORT.NAME',          descKey: 'SCALE.EFFORT.DESC_INSTRUCTIONS',          detailKey: 'SCALE.EFFORT.DESC_DETAILED',          exampleKey: 'SCALE.EFFORT.EXAMPLE'          },
    { nameKey: 'SCALE.FRUSTRATION.NAME',     descKey: 'SCALE.FRUSTRATION.DESC_INSTRUCTIONS',     detailKey: 'SCALE.FRUSTRATION.DESC_DETAILED',     exampleKey: 'SCALE.FRUSTRATION.EXAMPLE'     },
  ];

  readonly selectedScale = signal<ScaleInfo | null>(null);

  openModal(scale: ScaleInfo): void {
    this.selectedScale.set(scale);
  }

  closeModal(): void {
    this.selectedScale.set(null);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeModal();
  }

  proceed(): void {
    this.state.markInstructionsViewed();
    this.router.navigate(['/scales']);
  }
}
