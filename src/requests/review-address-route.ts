// Keep the whole current draft when opening an address from the final review.
// In particular, both pins are needed to restore the dropoff route preview.
export function reviewAddressRoute(
  kind: 'pickup' | 'dropoff',
  params: Record<string, string | string[] | undefined>,
) {
  const draft: Record<string, string> = {};
  for (const [key, raw] of Object.entries(params)) {
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (typeof value === 'string') draft[key] = value;
  }
  return {
    pathname: kind === 'pickup' ? '/pickup-location' as const : '/dropoff-location' as const,
    params: draft,
  };
}
