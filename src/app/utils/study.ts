import { SessionId } from '../services/tlx-state.service';

/**
 * Constants for the BeyondAI ↔ NASA TLX study flow.
 * BeyondAI hands participants off to `/start?participantId=…&sessionId=…&lang=…`;
 * after the TLX result is saved the participant is sent back to the BeyondAI login.
 */
export const BEYONDAI_URL = 'https://beyondai-code-review.vercel.app';

/** sessionStorage key holding the language chosen at BeyondAI login (locked for the whole run). */
export const TLX_LANG_KEY = 'tlx-lang';

/** Maps the shared "Sessions" table ids (1=Intro, 2=AI, 3=Report) to TlxResult session names. */
export const DB_SESSION_TO_TLX: Record<number, SessionId> = {
  1: 'Uvodna sesija',
  2: 'Sesija 1',
  3: 'Sesija 2',
};