import { beforeEach, afterEach, expect, jest, test } from "@jest/globals";
import { resolveNotificationDestination } from "./notificationDestination";
import { getCustomerRequestStatus, getCustomerRequestOffers } from "@/lib/api";
jest.mock("@/lib/api", () => ({
  getCustomerRequestStatus: jest.fn(),
  getCustomerRequestOffers: jest.fn(),
}));
const getStatus = jest.mocked(getCustomerRequestStatus);
const getOffers = jest.mocked(getCustomerRequestOffers);
const now = new Date("2026-10-17T12:00:00Z");
const reservation = {
  canConfirmAndPay: true,
  confirmationOpensAt: "2026-10-17T10:00:00Z",
  paymentDeadlineAt: "2026-10-18T10:00:00Z",
};
const request = { id: "job/a", status: "RESERVED", reservation };
const offer = {
  id: "offer",
  offerId: "accepted-offer",
  offerStatus: "ACCEPTED",
  price: 150,
  currency: "CHF",
};
const data = { type: "FURNITURE_CONFIRMATION_DUE", requestId: "job/a" };
beforeEach(() => {
  jest.useFakeTimers().setSystemTime(now);
  jest.clearAllMocks();
  getStatus.mockResolvedValue(request as never);
  getOffers.mockResolvedValue({ offers: [offer] } as never);
});
afterEach(() => { jest.useRealTimers(); });
test("opens payment with current server data and the accepted offer", async () => {
  expect(
    await resolveNotificationDestination({
      ...data,
      offerId: "stale-offer",
      price: 1,
    }),
  ).toEqual({
    pathname: "/request-payment",
    params: {
      requestId: "job/a",
      offerId: "accepted-offer",
      request: JSON.stringify(request),
      offer: JSON.stringify(offer),
    },
  });
});
test.each(["COMPLETED", "CANCELLED", "DRIVER_ASSIGNED"])(
  "opens request details instead of charging a %s booking",
  async (status) => {
    getStatus.mockResolvedValue({ ...request, status } as never);
    expect(await resolveNotificationDestination(data)).toEqual({
      pathname: "/request-status",
      params: { requestId: "job/a" },
    });
  },
);
test.each(["2026-10-17T09:59:59Z", "2026-10-18T10:00:00Z"])(
  "blocks payment outside the window at %s",
  async (time) => {
    jest.setSystemTime(new Date(time));
    expect(await resolveNotificationDestination(data)).toEqual({
      pathname: "/request-status",
      params: { requestId: "job/a" },
    });
  },
);
test("does not choose a pending or missing offer", async () => {
  getOffers.mockResolvedValue({
    offers: [{ id: "other", status: "PENDING" }],
  } as never);
  expect(await resolveNotificationDestination(data)).toEqual({
    pathname: "/request-status",
    params: { requestId: "job/a" },
  });
});
test("propagates network failures so Alerts can offer a retry", async () => {
  getStatus.mockRejectedValue(new Error("Offline"));
  await expect(resolveNotificationDestination(data)).rejects.toThrow("Offline");
});
test("does not load payment data for ordinary notifications or missing request IDs", async () => {
  expect(
    await resolveNotificationDestination({
      type: "FURNITURE_CONFIRMATION_DUE",
    }),
  ).toBeNull();
  expect(
    await resolveNotificationDestination({
      type: "TEST_NOTIFICATION",
      reminderPreview: true,
    }),
  ).toBe("/(tabs)/notifications");
  expect(getStatus).not.toHaveBeenCalled();
});
