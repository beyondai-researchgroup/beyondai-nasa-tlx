// Best-effort remote control of the local EEG data-collection console app
// (EmotivEEG_DataCollecting), gated by EEG_CONTROL_ENABLED so the deployed Vercel
// functions (which never have access to a local device) don't even attempt a call.
// A missing/offline EEG app must never block the session-finished flow.

const controlUrl = process.env['EEG_CONTROL_URL'] ?? 'http://localhost:5900';

function isEnabled(): boolean {
  return process.env['EEG_CONTROL_ENABLED'] === 'true';
}

async function notifyEeg(route: string): Promise<void> {
  if (!isEnabled()) return;
  try {
    // The EEG app's control listener (System.Net.HttpListener) requires a Content-Length
    // on POST requests — send an empty JSON body rather than none.
    const res = await fetch(`${controlUrl}/${route}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!res.ok) {
      console.warn(`[EEG] control call ${route} returned ${res.status}`);
    }
  } catch (err) {
    console.warn(`[EEG] control call ${route} failed — is the EEG app running?`, err);
  }
}

export function notifyEegMarker(code: string): Promise<void> {
  return notifyEeg(`marker/${encodeURIComponent(code)}`);
}

export function notifyEegStop(): Promise<void> {
  return notifyEeg('stop');
}
