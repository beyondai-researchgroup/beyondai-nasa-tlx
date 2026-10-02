import { SessionId } from '../services/tlx-state.service';

/**
 * Constants for the BeyondAI ↔ NASA TLX study flow.
 * BeyondAI hands participants off to `/start?participantId=…&sessionId=…&lang=…`;
 * after the TLX result is saved the participant is sent back to the BeyondAI login.
 */
const BEYONDAI_URL_PROD = 'https://beyondai-code-review.vercel.app';
const BEYONDAI_URL_LOCAL = 'http://localhost:4202';

/**
 * Where to send the participant back to after TLX — inferred from where THIS app (NASA-TLX)
 * is currently being accessed from, not hardcoded, so local dev/testing (this app on
 * localhost:4201) returns to the local BeyondAI frontend, while the real deployed study (this
 * app on the Vercel domain) still returns to the real deployed BeyondAI. Computed at call time
 * (not module load) so it works the same whether or not this ran through SSR first.
 */
/**
 * codeReviewLinkToken: a real (non-test) participant's own personal Code Review link token
 * (TlxSession.codeReviewLinkToken) — appended as `?link=` so "session finished" sends them back
 * to the exact link that still works (the bare-id login is test-participants-only now). Omitted
 * for a test participant, or when no valid token could be resolved.
 */
export function resolveBeyondAiUrl(codeReviewLinkToken?: string | null): string {
  const base = (() => {
    if (typeof window === 'undefined') return BEYONDAI_URL_PROD;
    const host = window.location.hostname;
    return host === 'localhost' || host === '127.0.0.1' ? BEYONDAI_URL_LOCAL : BEYONDAI_URL_PROD;
  })();
  return codeReviewLinkToken ? `${base}?link=${encodeURIComponent(codeReviewLinkToken)}` : base;
}

/** sessionStorage key holding the language chosen at BeyondAI login (locked for the whole run). */
export const TLX_LANG_KEY = 'tlx-lang';

/** Maps the shared "Sessions" table ids (1=Intro, 2=AI, 3=Report, 4=Hybrid) to TlxResult
 *  session names. Id 4 is experimental — BeyondAI's Hybrid mode, participant "004" only, local
 *  dev only — named descriptively rather than continuing the numeric sequence since it isn't
 *  step 3 of the normal Intro→AI→Report progression. */
export const DB_SESSION_TO_TLX: Record<number, SessionId> = {
  1: 'Uvodna sesija',
  2: 'Sesija 1',
  3: 'Sesija 2',
  4: 'Hibridna sesija',
};