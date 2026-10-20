import { describe, expect, it } from "@jest/globals";
import {
  addCalendarDays,
  scheduleBounds,
  validateSchedule,
} from "./schedule-rules";
const now = new Date(2026, 9, 17, 10);
const day = (offset: number, hour = 12) => {
  const date = addCalendarDays(now, offset);
  date.setHours(hour);
  return date;
};
const check = (
  pickup: Date | undefined,
  delivery: Date | undefined,
  furniture = false,
  immediate = false,
) => validateSchedule({ pickup, delivery, furniture, immediate, now });

describe("six calendar day scheduling window", () => {
  it.each([0, 1, 2, 3, 4])(
    "accepts pickup today + %i and delivery the next day",
    (offset) => {
      expect(check(day(offset), day(offset + 1))).toBeNull();
    },
  );
  it("accepts the entire sixth pickup day, but requires a later delivery day", () => {
    expect(check(day(5, 23), day(5))).toBe(
      "Delivery date must be after the pickup date.",
    );
    expect(check(day(6), day(5))).toBe(
      "Pickup must be between today and five days ahead.",
    );
  });
  it.each([-1, 6, 7])(
    "rejects delivery outside today + five days: %i",
    (offset) => {
      expect(check(day(0), day(offset))).toBe(
        "Delivery must be between today and five days ahead.",
      );
    },
  );
  it.each([0, 1, 2])("rejects delivery on or before pickup: %i", (offset) => {
    expect(check(day(2), day(offset))).toBe(
      "Delivery date must be after the pickup date.",
    );
  });
  it("requires a delivery date, including immediate pickup", () => {
    expect(check(day(0), undefined)).toBe("Please select a delivery date.");
    expect(check(undefined, undefined, false, true)).toBe(
      "Please select a delivery date.",
    );
    expect(check(undefined, day(1), false, true)).toBeNull();
    expect(check(undefined, day(0), false, true)).toBe(
      "Delivery date must be after the pickup date.",
    );
  });
  it("invalidates delivery after pickup changes", () => {
    expect(check(day(1), day(2))).toBeNull();
    expect(check(day(3), day(2))).toBe(
      "Delivery date must be after the pickup date.",
    );
  });
  it("allows furniture delivery on pickup day through five days after any future pickup", () => {
    expect(check(day(20), day(20), true)).toBeNull();
    expect(check(day(20), day(25), true)).toBeNull();
    expect(check(day(20), day(19), true)).toBe(
      "Furniture delivery must be on pickup day or within five days after pickup.",
    );
    expect(check(day(20), day(26), true)).toBe(
      "Furniture delivery must be on pickup day or within five days after pickup.",
    );
    expect(scheduleBounds(day(20), now, true)).toEqual({
      minimum: addCalendarDays(now, 20),
      maximum: addCalendarDays(now, 25),
    });
  });

  it("rejects past or malformed dates", () => {
    expect(check(day(-1), day(1))).toBe(
      "Scheduled pickup must be in the future.",
    );
    expect(check(new Date("invalid"), day(1))).toBe(
      "Scheduled pickup must be in the future.",
    );
    expect(check(day(0), new Date("invalid"))).toBe(
      "Please select a delivery date.",
    );
  });
  it("uses calendar boundaries across month, year, and daylight-saving changes", () => {
    for (const date of [
      new Date(2026, 11, 29, 23),
      new Date(2026, 9, 23, 23),
      new Date(2028, 1, 27),
    ]) {
      const bounds = scheduleBounds(date, date);
      expect(bounds.minimum.getHours()).toBe(0);
      expect(bounds.maximum).toEqual(
        new Date(date.getFullYear(), date.getMonth(), date.getDate() + 5),
      );
    }
  });
  it("rechecks against the current date after a form has been left open", () => {
    expect(
      validateSchedule({
        immediate: false,
        pickup: day(0),
        delivery: day(1),
        now: day(1),
      }),
    ).toBe("Scheduled pickup must be in the future.");
  });
});

describe("vehicle scheduling follows goods rules", () => {
  it("accepts a pickup and later delivery inside the six-day window", () => {
    expect(check(day(0), day(1))).toBeNull();
    expect(check(day(4), day(5))).toBeNull();
  });
  it("rejects distant pickup, same-day delivery, and delivery outside the window", () => {
    expect(check(day(6), day(7))).toBe(
      "Pickup must be between today and five days ahead.",
    );
    expect(check(day(0), day(0))).toBe(
      "Delivery date must be after the pickup date.",
    );
    expect(check(day(4), day(6))).toBe(
      "Delivery must be between today and five days ahead.",
    );
  });
});

describe("required schedule fields for every service", () => {
  it("allows immediate bicycle pickup without delivery but requires delivery for scheduled bicycles", () => {
    expect(validateSchedule({ immediate: true, bicycle: true, now })).toBeNull();
    expect(validateSchedule({ immediate: false, bicycle: true, pickup: day(1), now }))
      .toBe("Please select a delivery date.");
    expect(validateSchedule({ immediate: true, bicycle: true, delivery: new Date('invalid'), now }))
      .toBe("Please select a delivery date.");
  });
  it.each([false, true])(
    "requires scheduled pickup and delivery (furniture=%s)",
    (furniture) => {
      expect(
        validateSchedule({ immediate: false, furniture, now }),
      ).not.toBeNull();
      expect(
        validateSchedule({
          immediate: false,
          furniture,
          now,
          delivery: day(2),
        }),
      ).not.toBeNull();
      expect(
        validateSchedule({ immediate: false, furniture, now, pickup: day(1) }),
      ).toBe("Please select a delivery date.");
    },
  );
});
