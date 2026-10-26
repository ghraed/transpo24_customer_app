import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import React from "react";
import { act, create } from "react-test-renderer";
import GoodsDetails from "@/app/goods-details";
import FurnitureDetails from "@/app/furniture-details";
import { DeliveryDateEditor } from "./delivery-date-editor";
import { addCalendarDays } from "./schedule-rules";
const mockPush = jest.fn();
let mockParams = {};
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ push: mockPush }),
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key) => key }),
}));
jest.mock("expo-symbols", () => ({ SymbolView: () => null }));
jest.mock("@react-native-community/datetimepicker", () => "DateTimePicker");
jest.mock("expo-image-picker", () => ({}));
jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: "SafeAreaView",
  useSafeAreaInsets: () => ({ top: 0, bottom: 0 }),
}));
jest.mock("@/localization/i18n", () => ({
  __esModule: true,
  default: { t: (key) => key },
}));
let tree;
beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2026, 9, 17, 10));
  mockPush.mockClear();
});
afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
  jest.useRealTimers();
});
const press = (label) =>
  act(async () =>
    tree.root
      .findAll(
        (node) =>
          typeof node.props.onPress === "function" &&
          node.findAll((child) => child.props.children === label).length,
      )[0]
      .props.onPress(),
  );
const services = [
  [
    GoodsDetails,
    "GOODS_TRANSPORT",
    "pendingGoodsDetails",
    {
      shipmentSize: "S",
      goodsDescription: "Boxes",
      approximateWeightKg: 10,
      numberOfPieces: 1,
      isImmediate: true,
    },
  ],
  [
    FurnitureDetails,
    "FURNITURE_TRANSPORT",
    "pendingFurnitureDetails",
    {
      furnitureDescription: "Sofa",
      approximateItemCount: 1,
      isImmediate: true,
      movingDate: new Date(2026, 9, 18, 10).toISOString(),
    },
  ],
];
describe.each(services)(
  "%s delivery scheduling",
  (Screen, serviceKey, detailsKey, details) => {
    it("requires a manually chosen delivery date before continuing", async () => {
      mockParams = {
        serviceId: "service",
        serviceKey,
        [detailsKey]: JSON.stringify(details),
        pendingFurniturePhotoAssets: JSON.stringify([
          { uri: "file:///sofa.jpg" },
        ]),
      };
      await act(async () => {
        tree = create(<Screen />);
      });
      await press("Continue to Pickup Location");
      expect(
        tree.root.findByType(DeliveryDateEditor).props.value,
      ).toBeUndefined();
      expect(mockPush).not.toHaveBeenCalled();
      const delivery = addCalendarDays(new Date(), 2);
      await act(async () =>
        tree.root.findByType(DeliveryDateEditor).props.onChange(delivery),
      );
      await press("Continue to Pickup Location");
      expect(
        JSON.parse(mockPush.mock.calls[0][0].params[detailsKey])
          .scheduledDeliveryAt,
      ).toBe(delivery.toISOString());
    });
    it("blocks restored delivery dates outside the six-day window", async () => {
      mockParams = {
        serviceId: "service",
        serviceKey,
        [detailsKey]: JSON.stringify({
          ...details,
          scheduledDeliveryAt: addCalendarDays(new Date(), 6).toISOString(),
        }),
        pendingFurniturePhotoAssets: JSON.stringify([
          { uri: "file:///sofa.jpg" },
        ]),
      };
      await act(async () => {
        tree = create(<Screen />);
      });
      await press("Continue to Pickup Location");
      expect(mockPush).not.toHaveBeenCalled();
      expect(JSON.stringify(tree.toJSON())).toContain(
        serviceKey === "FURNITURE_TRANSPORT"
          ? "Furniture delivery must be on pickup day or within five days after pickup."
          : "Delivery must be between today and five days ahead.",
      );
    });
  },
);

it("furniture pickup clears delivery and blocks continuation until delivery is chosen again", async () => {
  const pickup = addCalendarDays(new Date(), 10);
  pickup.setHours(10);
  mockParams = {
    serviceId: "service",
    serviceKey: "FURNITURE_TRANSPORT",
    pendingFurnitureDetails: JSON.stringify({
      furnitureDescription: "Sofa",
      approximateItemCount: 1,
      isImmediate: false,
      movingDate: pickup.toISOString(),
      scheduledDeliveryAt: addCalendarDays(pickup, 3).toISOString(),
    }),
    pendingFurniturePhotoAssets: JSON.stringify([{ uri: "file:///sofa.jpg" }]),
  };
  await act(async () => {
    tree = create(<FurnitureDetails />);
  });
  await press("Pickup Date");
  const next = addCalendarDays(pickup, 4);
  await act(async () =>
    tree.root
      .findByType("DateTimePicker")
      .props.onChange({ type: "set" }, next),
  );
  await press("Save");
  expect(tree.root.findByType(DeliveryDateEditor).props.value).toBeUndefined();
  await press("Continue to Pickup Location");
  expect(mockPush).not.toHaveBeenCalled();
  const custom = addCalendarDays(next, 2);
  await act(async () =>
    tree.root.findByType(DeliveryDateEditor).props.onChange(custom),
  );
  await press("Continue to Pickup Location");
  expect(
    JSON.parse(mockPush.mock.calls[0][0].params.pendingFurnitureDetails)
      .scheduledDeliveryAt,
  ).toBe(custom.toISOString());
});

it("goods pickup changes clear delivery instead of choosing a replacement", async () => {
  const pickup = addCalendarDays(new Date(), 1);
  pickup.setHours(10);
  mockParams = {
    serviceId: "service",
    serviceKey: "GOODS_TRANSPORT",
    pendingGoodsDetails: JSON.stringify({
      shipmentSize: "S",
      goodsDescription: "Boxes",
      approximateWeightKg: 10,
      numberOfPieces: 1,
      isImmediate: false,
      scheduledPickupAt: pickup.toISOString(),
      scheduledDeliveryAt: addCalendarDays(pickup, 2).toISOString(),
    }),
  };
  await act(async () => {
    tree = create(<GoodsDetails />);
  });
  await press("Pickup Date");
  await act(async () =>
    tree.root
      .findByType("DateTimePicker")
      .props.onChange({ type: "set" }, addCalendarDays(pickup, 1)),
  );
  await press("Save");
  expect(tree.root.findByType(DeliveryDateEditor).props.value).toBeUndefined();
  await press("Continue to Pickup Location");
  expect(mockPush).not.toHaveBeenCalled();
});
