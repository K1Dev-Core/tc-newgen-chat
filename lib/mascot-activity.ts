let pendingMeters = 0;
export const MASCOT_ACTIVITY_EVENT = 'tc-newgen:mascot-activity';

export function recordMascotActivity(meters: number) {
  if (!Number.isFinite(meters) || meters <= 0) return;
  pendingMeters = Math.min(50_000, pendingMeters + Math.floor(meters));
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(MASCOT_ACTIVITY_EVENT));
}

export function takePendingMascotMeters(maximum = 500) {
  const amount = Math.min(pendingMeters, maximum);
  pendingMeters -= amount;
  return amount;
}

export function restorePendingMascotMeters(meters: number) {
  pendingMeters = Math.min(50_000, pendingMeters + Math.max(0, Math.floor(meters)));
}
