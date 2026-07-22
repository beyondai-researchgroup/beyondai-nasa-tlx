import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { TlxStateService, SessionId } from '../services/tlx-state.service';
import { DatabaseService } from '../services/database.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, TranslateModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  private fb = inject(FormBuilder);
  private state = inject(TlxStateService);
  private router = inject(Router);
  private db = inject(DatabaseService);

  readonly sessions: SessionId[] = ['Uvodna sesija', 'Sesija 1', 'Sesija 2'];

  readonly isChecking = signal(false);
  readonly participantNotFound = signal(false);
  readonly checkFailed = signal(false);

  form = this.fb.group({
    sessionId: ['Sesija 1' as SessionId, Validators.required],
    participantId: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(50)]],
    calculateScores: [true],
    includeWeightings: [true],
  });

  selectSession(id: SessionId): void {
    this.form.patchValue({ sessionId: id });
  }

  sessionLabelKey(s: SessionId): string {
    const map: Record<SessionId, string> = {
      'Uvodna sesija': 'LOGIN.SESSION_INTRO',
      'Sesija 1': 'LOGIN.SESSION_1',
      'Sesija 2': 'LOGIN.SESSION_2',
    };
    return map[s];
  }

  onParticipantIdInput(): void {
    this.participantNotFound.set(false);
    this.checkFailed.set(false);
  }

  async submit(): Promise<void> {
    if (this.form.invalid || this.isChecking()) return;

    const v = this.form.value;
    const participantId = v.participantId!.trim();

    this.participantNotFound.set(false);
    this.checkFailed.set(false);
    this.isChecking.set(true);

    try {
      const exists = await this.db.checkParticipantExists(participantId);
      if (!exists) {
        this.participantNotFound.set(true);
        this.isChecking.set(false);
        return;
      }
    } catch {
      this.checkFailed.set(true);
      this.isChecking.set(false);
      return;
    }

    this.isChecking.set(false);
    this.state.setSession({
      sessionId: v.sessionId as SessionId,
      participantId,
      config: {
        calculateScores: !!v.calculateScores,
        includeWeightings: !!v.includeWeightings,
      },
    });
    this.router.navigate(['/instructions']);
  }
}
