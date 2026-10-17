export function calendarDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

export function addCalendarDays(value: Date, days: number): Date {
  const result = calendarDay(value);
  result.setDate(result.getDate() + days);
  return result;
}

// Pickup changes require the customer to choose delivery again.
export function deliveryAfterPickupChange(
  previousPickup: Date,
  nextPickup: Date,
  delivery?: Date,
): Date | undefined {
  return previousPickup.getTime() !== nextPickup.getTime()
    ? undefined
    : delivery;
}

export function scheduleBounds(
  pickup: Date,
  now = new Date(),
  furniture = false,
) {
  return {
    minimum: addCalendarDays(pickup, furniture ? 0 : 1),
    maximum: addCalendarDays(furniture ? pickup : now, 5),
  };
}

export function validateSchedule({
  immediate,
  pickup,
  delivery,
  furniture = false,
  now = new Date(),
}: {
  immediate: boolean;
  pickup?: Date;
  delivery?: Date;
  furniture?: boolean;
  now?: Date;
}): string | null {
  const effectivePickup = immediate ? now : pickup;
  const maximum = addCalendarDays(now, 6).getTime();
  if (
    !effectivePickup ||
    !Number.isFinite(effectivePickup.getTime()) ||
    (!immediate && effectivePickup.getTime() <= now.getTime())
  )
    return "Scheduled pickup must be in the future.";
  if (!furniture && effectivePickup.getTime() >= maximum)
    return "Pickup must be between today and five days ahead.";
  if (furniture) {
    if (!delivery || !Number.isFinite(delivery.getTime()))
      return "Please select a delivery date.";
    const first = calendarDay(effectivePickup).getTime();
    const last = addCalendarDays(effectivePickup, 6).getTime();
    if (delivery.getTime() < first || delivery.getTime() >= last)
      return "Furniture delivery must be on pickup day or within five days after pickup.";
    return null;
  }
  if (!delivery || !Number.isFinite(delivery.getTime()))
    return "Please select a delivery date.";
  if (
    delivery.getTime() < calendarDay(now).getTime() ||
    delivery.getTime() >= maximum
  )
    return "Delivery must be between today and five days ahead.";
  if (calendarDay(delivery).getTime() <= calendarDay(effectivePickup).getTime())
    return "Delivery date must be after the pickup date.";
  return null;
}
