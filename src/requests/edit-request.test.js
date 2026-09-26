import React from "react";
import { act, create } from "react-test-renderer";
import { Alert, Text, TextInput, View } from "react-native";
import { beforeEach, expect, it, jest } from "@jest/globals";
import EditRequestScreen from "@/app/edit-request";
import { getCustomerRequestStatus, getRequestForEdit, getServices, submitRequestEdit } from "@/lib/api";
import { editRequestPayload, prepareRequestForEdit } from "./edit-request";
import { AddressEditor } from "./address-editor";
import { ScheduleEditor } from "./schedule-editor";

const mockReplace = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
let mockOfferListener;
const mockUnsubscribe = jest.fn();
jest.mock('@/services/socketService', () => ({
  connectSocket: jest.fn(),
  onOfferNew: listener => { mockOfferListener = listener; return mockUnsubscribe; },
}));
jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ requestId: "request" }),
  useRouter: () => ({ replace: mockReplace, back: mockBack }),
}));
jest.mock("@/lib/api", () => ({
  getRequestForEdit: jest.fn(),
  getCustomerRequestStatus: jest.fn(),
  getServices: jest.fn(),
  submitRequestEdit: jest.fn(),
}));
jest.mock("@/lib/auth-token", () => ({
  useAuthSession: () => ({ user: { countryCode: "CH" } }),
  getAccessToken: () => 'token',
}));
jest.mock("@/config/backend", () => ({
  getApiBaseUrl: () => "https://example.test",
}));
jest.mock("./address-editor", () => ({ AddressEditor: () => null }));
jest.mock("./schedule-editor", () => ({ ScheduleEditor: () => null }));
jest.mock("react-i18next", () => {
  const t = (key) => key;
  return {
    useTranslation: () => ({ t, i18n: { dir: () => "ltr", language: "en" } }),
  };
});
const fixture = () => ({
  serviceId: "goods",
  updatedAt: "2026-09-21T10:00:00.000Z",
  isImmediate: true,
  scheduledPickupAt: null,
  pickupLocation: { latitude: 47, longitude: 8, address: "Pickup" },
  dropoffLocation: { latitude: 48, longitude: 9, address: "Dropoff" },
  itemTitle: "Original boxes",
  goodsShipmentSize: "S",
  goodsDescription: "Original description",
  goodsApproximateWeightKg: 20,
  goodsNumberOfPieces: 2,
  retainedPhotoIds: ["photo"],
  photos: [{ id: "photo", url: "/uploads/photo.jpg" }],
});
beforeEach(() => {
  jest.clearAllMocks();
  getRequestForEdit.mockResolvedValue(fixture());
  getCustomerRequestStatus.mockResolvedValue({ canEdit: true });
  getServices.mockResolvedValue([
    { id: "goods", key: "GOODS_TRANSPORT", nameEn: "Goods", isActive: true },
  ]);
  submitRequestEdit.mockResolvedValue(undefined);
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
});
async function render() {
  let tree;
  await act(async () => {
    tree = create(<EditRequestScreen />);
  });
  return tree;
}
function button(tree, label) {
  return tree.root.findAll(
    (node) =>
      typeof node.props.onPress === "function" &&
      node.props.children?.props?.children === label,
  )[0];
}
async function confirmSubmission(tree) {
  const previousCalls = submitRequestEdit.mock.calls.length;
  await act(async () => button(tree, "editRequest.submit").props.onPress());
  expect(submitRequestEdit).toHaveBeenCalledTimes(previousCalls);
  await act(async () => button(tree, "Confirm").props.onPress());
}

it("prefills and keeps edits local until submission, preserving request identity", async () => {
  const tree = await render();
  const weight = tree.root
    .findAllByType(TextInput)
    .find((node) => node.props.accessibilityLabel === "Goods weight (kg)");
  expect(weight.props.value).toBe("20");
  await act(async () => {
    weight.props.onChangeText("75");
    tree.root.findAllByType(AddressEditor)[0].props.onChange({
      latitude: 46,
      longitude: 7,
      address: "Changed pickup",
    });
    tree.root
      .findByType(ScheduleEditor)
      .props.onChange({ immediate: false, at: "2099-01-01T10:00:00.000Z" });
    button(tree, "Remove").props.onPress();
  });
  expect(submitRequestEdit).not.toHaveBeenCalled();
  await confirmSubmission(tree);
  expect(submitRequestEdit).toHaveBeenCalledWith(
    "request",
    expect.objectContaining({
      updatedAt: fixture().updatedAt,
      goodsApproximateWeightKg: 75,
      pickupLocation: { latitude: 46, longitude: 7, address: "Changed pickup" },
      isImmediate: false,
      scheduledPickupAt: "2099-01-01T10:00:00.000Z",
      retainedPhotoIds: [],
    }),
    [],
  );
  expect(submitRequestEdit.mock.calls[0][1]).not.toHaveProperty("photos");
  expect(mockReplace).toHaveBeenCalledWith(
    expect.objectContaining({
      pathname: "/request-status",
      params: expect.objectContaining({ requestId: "request" }),
    }),
  );
  await act(async () => tree.unmount());
});
it("locks an open form when the API rejects an edit after an offer", async () => {
  submitRequestEdit.mockRejectedValue(
    Object.assign(new Error("A driver sent an offer."), { code: 'REQUEST_EDIT_LOCKED' }),
  );
  const tree = await render();
  await confirmSubmission(tree);
  expect(mockReplace).not.toHaveBeenCalled();
  expect(
    tree.root
      .findAllByType(Text)
      .some(
        (node) => node.props.children === "editRequest.locked",
      ),
  ).toBe(true);
  expect(button(tree, 'editRequest.submit')).toBeUndefined();
  await act(async () => tree.unmount());
});
it('locks all fields and dismisses confirmation when a driver sends an offer', async () => {
  const tree = await render();
  await act(async () => button(tree, 'editRequest.submit').props.onPress());
  await act(async () => mockOfferListener({ requestId: 'other' }));
  expect(button(tree, 'editRequest.submit')).toBeDefined();
  await act(async () => mockOfferListener({ requestId: 'request' }));
  expect(button(tree, 'editRequest.submit')).toBeUndefined();
  expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
  expect(submitRequestEdit).not.toHaveBeenCalled();
  await act(async () => tree.unmount());
  expect(mockUnsubscribe).toHaveBeenCalled();
});
it('locks an open form when polling detects an offer missed by realtime', async () => {
  jest.useFakeTimers();
  const tree = await render();
  try {
    getCustomerRequestStatus.mockResolvedValue({ canEdit: false });
    await act(async () => jest.advanceTimersByTime(10000));
    expect(button(tree, 'editRequest.submit')).toBeUndefined();
    expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
  } finally {
    await act(async () => tree.unmount());
    jest.useRealTimers();
  }
});
it("does not display a form for a request that can no longer be edited", async () => {
  getRequestForEdit.mockRejectedValue(new Error("Request no longer editable"));
  const tree = await render();
  expect(button(tree, "editRequest.submit")).toBeUndefined();
  expect(submitRequestEdit).not.toHaveBeenCalled();
  await act(async () => tree.unmount());
});
it("preserves explicit clearing and rejects invalid numeric input", () => {
  expect(
    editRequestPayload({ ...fixture(), itemYear: "", customerNote: "" }),
  ).toMatchObject({ itemYear: null, customerNote: null });
  expect(() =>
    editRequestPayload({ ...fixture(), goodsApproximateWeightKg: "invalid" }),
  ).toThrow("editRequest.invalidNumber");
});

it.each([
  [
    "GOODS_TRANSPORT",
    "Optional Note",
    "customerNote",
    "Goods description",
    [
      "Vehicle brand",
      "Furniture description",
      "Brand",
      "Item title",
      "Loading help",
    ],
  ],
  [
    "FURNITURE_TRANSPORT",
    "Optional Note",
    "customerNote",
    "Furniture description",
    ["Goods description", "Vehicle brand", "Brand", "Item title"],
  ],
  [
    "MOTORCYCLE_TRANSPORT",
    "Additional Notes (optional)",
    "specialInstructions",
    "Chassis number",
    [
      "Goods description",
      "Furniture description",
      "Vehicle brand",
      "Item title",
    ],
  ],
  [
    "VEHICLE_TRANSPORT",
    "Condition notes",
    "vehicleConditionNotes",
    "Vehicle brand",
    [
      "Goods description",
      "Furniture description",
      "Chassis number",
      "Item title",
      "Optional Note",
    ],
  ],
])(
  "shows only %s fields and its empty note input",
  async (key, noteLabel, noteKey, expectedField, absentFields) => {
    getRequestForEdit.mockResolvedValue({ ...fixture(), [noteKey]: null });
    getServices.mockResolvedValue([
      { id: "goods", key, nameEn: "Chosen service", isActive: true },
      {
        id: "other",
        key: "FURNITURE_TRANSPORT",
        nameEn: "Other service",
        isActive: true,
      },
    ]);
    const tree = await render();
    const inputs = tree.root.findAllByType(TextInput);
    const labels = inputs.map((node) => node.props.accessibilityLabel);
    expect(labels).toContain(expectedField);
    for (const label of absentFields) expect(labels).not.toContain(label);
    expect(button(tree, "Chosen service")).toBeUndefined();
    expect(button(tree, "Other service")).toBeUndefined();
    const note = inputs.find(
      (node) => node.props.accessibilityLabel === noteLabel,
    );
    expect(note.props.value).toBe("");
    await act(async () => note.props.onChangeText("Call before pickup"));
    await confirmSubmission(tree);
    expect(submitRequestEdit).toHaveBeenCalledWith(
      "request",
      expect.objectContaining({
        serviceId: "goods",
        [noteKey]: "Call before pickup",
      }),
      [],
    );
    await act(async () => tree.unmount());
  },
);

it("shows bicycle fields and additional notes without motorcycle-only inputs", async () => {
  getRequestForEdit.mockResolvedValue({
    ...fixture(),
    itemType: "OTHER",
    customerNote: "Existing bicycle note",
    specialInstructions: null,
  });
  getServices.mockResolvedValue([
    {
      id: "goods",
      key: "MOTORCYCLE_TRANSPORT",
      nameEn: "Bicycle transport",
      isActive: true,
    },
  ]);
  const tree = await render();
  const inputs = tree.root.findAllByType(TextInput);
  const labels = inputs.map((node) => node.props.accessibilityLabel);
  expect(labels).toEqual([
    "Bicycle Type",
    "Brand (optional)",
    "Model (optional)",
    "Additional Notes (optional)",
  ]);
  expect(inputs[3].props.value).toBe("Existing bicycle note");
  expect(button(tree, "Motorcycle")).toBeUndefined();
  await act(async () => tree.unmount());
});

it.each([
  ["Requested pickup: Immediate pickup\nCall at the gate", "Call at the gate"],
  [
    "Requested pickup: 9/22/2026, 14:30:00\nHandle carefully\nCall at the gate",
    "Handle carefully\nCall at the gate",
  ],
  ["Requested pickup: Immediate pickup", ""],
  [
    "Call first\nRequested pickup: front gate",
    "Call first\nRequested pickup: front gate",
  ],
  ["Requested pickup: front gate", "Requested pickup: front gate"],
])("shows only the customer's saved note for %s", async (saved, expected) => {
  getRequestForEdit.mockResolvedValue({ ...fixture(), customerNote: saved });
  const tree = await render();
  const note = tree.root
    .findAllByType(TextInput)
    .find((node) => node.props.accessibilityLabel === "Optional Note");
  expect(note.props.value).toBe(expected);
  await confirmSubmission(tree);
  expect(submitRequestEdit.mock.calls[0][1].customerNote).toBe(
    expected || null,
  );
  await act(async () => tree.unmount());
});

it("moves legacy helper metadata to the helper field without losing the customer's note", () => {
  expect(
    prepareRequestForEdit(
      {
        ...fixture(),
        customerNote: "Requested helpers: 3\nUse the rear entrance",
      },
      "FURNITURE_TRANSPORT",
    ),
  ).toMatchObject({
    loadingWorkersCount: 3,
    customerNote: "Use the rear entrance",
  });
  expect(
    prepareRequestForEdit(
      {
        ...fixture(),
        loadingWorkersCount: 2,
        customerNote: "Requested helpers: 3",
      },
      "FURNITURE_TRANSPORT",
    ),
  ).toMatchObject({ loadingWorkersCount: 2, customerNote: "" });
});

it("can cancel confirmation without submitting or leaving the edit screen", async () => {
  const tree = await render();
  await act(async () => button(tree, "editRequest.submit").props.onPress());
  expect(submitRequestEdit).not.toHaveBeenCalled();
  await act(async () => button(tree, "Cancel").props.onPress());
  expect(submitRequestEdit).not.toHaveBeenCalled();
  expect(mockBack).not.toHaveBeenCalled();
  expect(mockReplace).not.toHaveBeenCalled();
  await act(async () => tree.unmount());
});

it("returns to request status after confirmation without a success alert", async () => {
  const tree = await render();
  await confirmSubmission(tree);
  expect(submitRequestEdit).toHaveBeenCalledTimes(1);
  expect(mockReplace).toHaveBeenCalled();
  expect(Alert.alert).not.toHaveBeenCalled();
  await act(async () => tree.unmount());
});

it("keeps the native form parent stable while saving a note and retrying a failed save", async () => {
  let rejectSave;
  submitRequestEdit.mockReturnValueOnce(new Promise((_, reject) => { rejectSave = reject; }));
  const tree = await render();
  const form = () => tree.root.findAllByType(View).find(node => node.props.pointerEvents != null);
  const originalForm = form();
  expect(originalForm.props.collapsable).toBe(false);
  const note = tree.root.findAllByType(TextInput).find(node => node.props.accessibilityLabel === "Optional Note");
  await act(async () => note.props.onChangeText("Updated note"));
  await confirmSubmission(tree);
  expect(form()).toBe(originalForm);
  expect(form().props.pointerEvents).toBe("none");
  expect(form().props.collapsable).toBe(false);
  await act(async () => rejectSave(new Error("Connection failed")));
  expect(form()).toBe(originalForm);
  expect(form().props.pointerEvents).toBe("auto");
  expect(form().props.collapsable).toBe(false);
  await confirmSubmission(tree);
  expect(submitRequestEdit).toHaveBeenLastCalledWith("request", expect.objectContaining({ customerNote: "Updated note" }), []);
  expect(mockReplace).toHaveBeenCalled();
  await act(async () => tree.unmount());
});
