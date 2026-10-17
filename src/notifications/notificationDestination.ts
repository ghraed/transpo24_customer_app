import type { Href } from "expo-router";
import { getCustomerRequestOffers, getCustomerRequestStatus } from "@/lib/api";
import { resolveNotificationRoute } from "./notificationRoute";
import type { PushNotificationData } from "./types";

// Always load the current reservation and its accepted offer, rather than trusting
// the price, offer, or payment eligibility in an older notification payload.
export async function resolveNotificationDestination(
  data: PushNotificationData,
): Promise<Href | null> {
  if (data.type !== "FURNITURE_CONFIRMATION_DUE")
    return resolveNotificationRoute(data);
  const id = data.requestId || data.tripId;
  if (typeof id !== "string" || !id.trim()) return null;
  const requestId = id.trim();
  const [request, result] = await Promise.all([
    getCustomerRequestStatus(requestId),
    getCustomerRequestOffers(requestId),
  ]);
  const offer = result.offers.find(
    (row) => (row.offerStatus ?? row.status) === "ACCEPTED",
  );
  if (
    request.status !== "RESERVED" ||
    !request.reservation?.canConfirmAndPay ||
    !offer
  )
    return { pathname: "/request-status", params: { requestId } };
  const deadline = Date.parse(request.reservation.paymentDeadlineAt);
  const opens = Date.parse(request.reservation.confirmationOpensAt);
  if (!(Date.now() >= opens && Date.now() < deadline))
    return { pathname: "/request-status", params: { requestId } };
  return {
    pathname: "/request-payment",
    params: {
      requestId,
      offerId: offer.offerId || offer.id,
      request: JSON.stringify(request),
      offer: JSON.stringify(offer),
    },
  };
}
