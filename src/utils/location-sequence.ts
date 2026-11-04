/** Measurement timestamps order location events independently of network arrival. */
export function createLocationSequence() {
  const last = new Map<string, number>();
  return (sample: { tripId: string; recordedAt: string }) => {
    const measured = Date.parse(sample.recordedAt);
    if (!Number.isFinite(measured) || measured <= (last.get(sample.tripId) ?? -Infinity)) return false;
    last.set(sample.tripId, measured);
    return true;
  };
}
export function newerLocation<T extends { recordedAt: string }>(current: T | null, next: T | null): T | null {
  if (!next || !Number.isFinite(Date.parse(next.recordedAt))) return current;
  return current && Date.parse(current.recordedAt) >= Date.parse(next.recordedAt) ? current : next;
}
