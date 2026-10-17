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
import { Platform, Switch } from "react-native";
import { DeliveryDateEditor } from "./delivery-date-editor";
import { ScheduleEditor } from "./schedule-editor";
import { addCalendarDays } from "./schedule-rules";
jest.mock("@react-native-community/datetimepicker", () => "DateTimePicker");
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key) => key }),
}));
jest.mock("@/localization/format", () => ({ getActiveLocale: () => "en-GB" }));
let tree;
const originalOS = Platform.OS;
beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2026, 9, 17, 10));
  Platform.OS = "android";
});
afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
  jest.useRealTimers();
  Platform.OS = originalOS;
});
const button = (label) =>
  tree.root.findAll(
    (node) =>
      node.props.accessibilityLabel === label &&
      typeof node.props.onPress === "function",
  )[0];
describe("delivery date picker", () => {
  it("bounds delivery to the day after pickup through today + five and saves the date", async () => {
    const onChange = jest.fn();
    await act(async () => {
      tree = create(
        <DeliveryDateEditor pickup={new Date()} onChange={onChange} />,
      );
    });
    await act(async () => button("Delivery Date").props.onPress());
    const picker = tree.root.findByType("DateTimePicker");
    expect(picker.props.minimumDate).toEqual(addCalendarDays(new Date(), 1));
    expect(picker.props.maximumDate).toEqual(addCalendarDays(new Date(), 5));
    await act(async () =>
      picker.props.onChange({ type: "dismissed" }, undefined),
    );
    expect(onChange).not.toHaveBeenCalled();
    await act(async () => button("Delivery Date").props.onPress());
    await act(async () =>
      tree.root
        .findByType("DateTimePicker")
        .props.onChange({ type: "set" }, addCalendarDays(new Date(), 5)),
    );
    expect(onChange.mock.calls[0][0].getDate()).toBe(22);
  });
  it("disables delivery selection when pickup leaves no later date in the window", async () => {
    await act(async () => {
      tree = create(
        <DeliveryDateEditor
          pickup={addCalendarDays(new Date(), 5)}
          onChange={jest.fn()}
        />,
      );
    });
    expect(button("Delivery Date").props.disabled).toBe(true);
    expect(tree.root.findAllByType("DateTimePicker")).toHaveLength(0);
  });
  it("caps regular pickup, preserves furniture exemption and shows delivery for immediate pickup", async () => {
    await act(async () => {
      tree = create(
        <ScheduleEditor
          value={{ immediate: false, at: new Date().toISOString() }}
          onChange={jest.fn()}
          invalid={false}
        />,
      );
    });
    const dateButton = tree.root.findAll(
      (node) =>
        typeof node.props.onPress === "function" &&
        node.findAll((child) => child.props.children === "vehicleRequest.date")
          .length,
    )[0];
    await act(async () => dateButton.props.onPress());
    expect(tree.root.findByType("DateTimePicker").props.maximumDate).toEqual(
      addCalendarDays(new Date(), 5),
    );
    await act(async () =>
      tree.update(
        <ScheduleEditor
          furniture
          value={{ immediate: false, at: new Date().toISOString() }}
          onChange={jest.fn()}
          invalid={false}
        />,
      ),
    );
    expect(
      tree.root.findByType("DateTimePicker").props.maximumDate,
    ).toBeUndefined();
    await act(async () =>
      tree.update(
        <ScheduleEditor
          value={{ immediate: true, at: new Date().toISOString() }}
          onChange={jest.fn()}
          invalid={false}
        />,
      ),
    );
    expect(button("Delivery Date")).toBeDefined();
  });
});

it("allows same-day through pickup + five for distant furniture bookings", async () => {
  const pickup = addCalendarDays(new Date(), 30);
  await act(async () => {
    tree = create(
      <DeliveryDateEditor furniture pickup={pickup} onChange={jest.fn()} />,
    );
  });
  await act(async () => button("Delivery Date").props.onPress());
  const picker = tree.root.findByType("DateTimePicker");
  expect(picker.props.minimumDate).toEqual(pickup);
  expect(picker.props.maximumDate).toEqual(addCalendarDays(pickup, 5));
});

it("vehicle pickup and later delivery stay within today through five days ahead", async () => {
  const pickup = addCalendarDays(new Date(), 2);
  const onChange = jest.fn();
  await act(async () => {
    tree = create(
      <ScheduleEditor
        value={{ immediate: false, at: pickup.toISOString() }}
        onChange={onChange}
        invalid={false}
      />,
    );
  });
  const dateButton = tree.root.findAll(
    (node) =>
      typeof node.props.onPress === "function" &&
      node.findAll((child) => child.props.children === "vehicleRequest.date")
        .length,
  )[0];
  await act(async () => dateButton.props.onPress());
  expect(tree.root.findByType("DateTimePicker").props.maximumDate).toEqual(
    addCalendarDays(new Date(), 5),
  );
  await act(async () =>
    tree.root
      .findByType("DateTimePicker")
      .props.onChange({ type: "dismissed" }, undefined),
  );
  await act(async () => button("Delivery Date").props.onPress());
  const picker = tree.root.findByType("DateTimePicker");
  expect(picker.props.minimumDate).toEqual(addCalendarDays(pickup, 1));
  expect(picker.props.maximumDate).toEqual(addCalendarDays(new Date(), 5));
  await act(async () =>
    picker.props.onChange({ type: "set" }, addCalendarDays(pickup, 1)),
  );
  expect(onChange.mock.calls[0][0].deliveryAt).toBeDefined();
});

it.each(
  ["android", "ios"].flatMap((os) =>
    ["vehicle", "furniture"].map((service) => [os, service]),
  ),
)(
  "%s %s clears delivery on pickup changes and requires manual reselection",
  async (os, service) => {
    Platform.OS = os;
    const pickup = addCalendarDays(new Date(), 2);
    pickup.setHours(10);
    function Booking() {
      const [value, onChange] = React.useState({
        immediate: false,
        at: pickup.toISOString(),
        deliveryAt: addCalendarDays(pickup, 3).toISOString(),
      });
      return (
        <ScheduleEditor
          furniture={service === "furniture"}
          value={value}
          onChange={onChange}
          invalid={false}
        />
      );
    }
    await act(async () => {
      tree = create(<Booking />);
    });
    const option = (label) =>
      tree.root.findAll(
        (node) =>
          typeof node.props.onPress === "function" &&
          node.findAll((child) => child.props.children === label).length,
      )[0];
    const select = async (mode, date) => {
      await act(async () => option(`vehicleRequest.${mode}`).props.onPress());
      await act(async () =>
        tree.root
          .findByType("DateTimePicker")
          .props.onChange({ type: "set" }, date),
      );
      if (os === "ios")
        await act(async () => option("vehicleRequest.save").props.onPress());
    };
    const changedPickup = addCalendarDays(pickup, 1);
    await select("date", changedPickup);
    const value = () => tree.root.findByType(ScheduleEditor).props.value;
    expect(value().deliveryAt).toBeUndefined();
    const customDelivery = addCalendarDays(changedPickup, 1);
    await act(async () =>
      tree.root.findByType(DeliveryDateEditor).props.onChange(customDelivery),
    );
    expect(value().deliveryAt).toBe(customDelivery.toISOString());
    const laterTime = new Date(changedPickup);
    laterTime.setHours(16);
    await select("time", laterTime);
    expect(value().deliveryAt).toBeUndefined();
    await act(async () =>
      tree.root.findByType(DeliveryDateEditor).props.onChange(customDelivery),
    );
    await act(async () => option("vehicleRequest.date").props.onPress());
    if (os === "ios")
      await act(async () => option("vehicleRequest.close").props.onPress());
    else
      await act(async () =>
        tree.root
          .findByType("DateTimePicker")
          .props.onChange({ type: "dismissed" }, undefined),
      );
    expect(value().deliveryAt).toBe(customDelivery.toISOString());
    const secondPickup = addCalendarDays(changedPickup, 1);
    await select("date", secondPickup);
    expect(value().deliveryAt).toBeUndefined();
    await act(async () =>
      tree.root.findByType(Switch).props.onValueChange(true),
    );
    expect(value().deliveryAt).toBeUndefined();
  },
);
