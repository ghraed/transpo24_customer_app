import type { CustomerNotification, PickupPaymentReminder } from "@/lib/api";

export function isPickupReminderNotification(
  item: Pick<CustomerNotification, "type" | "data">,
): boolean {
  return (
    item.type === "FURNITURE_CONFIRMATION_DUE" ||
    (__DEV__ &&
      item.type === "TEST_NOTIFICATION" &&
      item.data.reminderPreview === true)
  );
}

export function previewReminder(
  item: CustomerNotification,
  now = Date.now(),
): PickupPaymentReminder | null {
  if (
    !__DEV__ ||
    item.readAt ||
    item.type !== "TEST_NOTIFICATION" ||
    item.data.reminderPreview !== true
  )
    return null;
  const { pickupAt, deadlineAt, price, currency } = item.data;
  if (
    typeof pickupAt !== "string" ||
    typeof deadlineAt !== "string" ||
    !Number.isFinite(Date.parse(pickupAt)) ||
    !(Date.parse(deadlineAt) > now) ||
    typeof price !== "number" ||
    typeof currency !== "string"
  )
    return null;
  return {
    requestId: item.id,
    offerId: "",
    pickupAt,
    deadlineAt,
    price,
    currency,
    pickupAddress:
      typeof item.data.pickupAddress === "string"
        ? item.data.pickupAddress
        : null,
    dropoffAddress:
      typeof item.data.dropoffAddress === "string"
        ? item.data.dropoffAddress
        : null,
  };
}
