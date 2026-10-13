import React from 'react';
import { act, create } from 'react-test-renderer';
import { ScrollView } from 'react-native';
import { RegistrationScan } from './registration-scan';
import { newVehicleDraft } from './vehicle-draft';
import { REGISTRATION_FIELDS } from '@/types/registration';
import { extractRegistrationCard, getVehicleModels } from '@/lib/api';
import * as ImagePicker from 'expo-image-picker';

let mockAuthListener;
let mockOwner = 'customer';
let mockSavedCounter = 0;
const mockDelete = jest.fn();
const mockSave = jest.fn(async () => ({
  uri: `file:///cache/normalized-${++mockSavedCounter}.jpg`,
}));
jest.mock('@/lib/auth-token', () => ({
  getAuthSessionSnapshot: () => ({ user: { id: mockOwner } }),
  subscribeAuthSession: (listener) => {
    mockAuthListener = listener;
    return () => {};
  },
}));
jest.mock('@/lib/api', () => ({
  extractRegistrationCard: jest.fn(),
  getVehicleModels: jest.fn(async () => [
    { id: 'golf', name: 'Golf', brandId: 'vw' },
  ]),
}));
jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));
jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  ImageManipulator: {
    manipulate: () => ({
      rotate: jest.fn(),
      resize: jest.fn(),
      release: jest.fn(),
      renderAsync: async () => ({
        width: 2000,
        height: 1000,
        release: jest.fn(),
        saveAsync: mockSave,
      }),
    }),
  },
}));
jest.mock('expo-file-system', () => ({
  Paths: { cache: { uri: 'file:///cache/' } },
  File: class {
    size = 1000;
    exists = true;
    delete() {
      mockDelete();
    }
  },
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key) => key, i18n: { dir: () => 'rtl' } }),
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: 'SafeAreaView',
}));

const brands = [{ id: 'vw', name: 'Volkswagen' }];
const button = (tree, key) =>
  tree.root
    .findAll(
      (node) =>
        node.props.accessibilityRole === 'button' &&
        typeof node.props.onPress === 'function',
    )
    .find((node) => node.props.accessibilityLabel === key);
const click = async (tree, key) => {
  await act(async () => {
    button(tree, key).props.onPress();
  });
};
function result() {
  const value = {
    status: 'partial',
    fields: Object.fromEntries(
      REGISTRATION_FIELDS.map((name) => [
        name,
        { value: null, status: 'missing', evidence: [] },
      ]),
    ),
    missingFields: [],
    warnings: [],
  };
  for (const [name, data] of Object.entries({
    vin: 'WDD1770511N100321',
    brand: 'Volkswagen',
    model: 'Golf',
    emptyWeightKg: 1550,
    manufactureYear: 2019,
  }))
    value.fields[name] = { value: data, status: 'extracted', evidence: [] };
  return value;
}
let tree;
let onApply;
let vehicle;
async function render(value = {}) {
  vehicle = { ...newVehicleDraft('customer', 'service').vehicle, ...value };
  onApply = jest.fn();
  await act(async () => {
    tree = create(
      <RegistrationScan value={vehicle} brands={brands} onApply={onApply} />,
    );
  });
  await click(tree, 'vehicleRequest.scan.title');
}
async function review() {
  await click(tree, 'vehicleRequest.scan.gallery');
  await click(tree, 'vehicleRequest.scan.extract');
}
beforeEach(() => {
  jest.clearAllMocks();
  mockOwner = 'customer';
  mockSavedCounter = 0;
  ImagePicker.requestCameraPermissionsAsync.mockResolvedValue({
    granted: true,
  });
  const chosen = {
    canceled: false,
    assets: [{ uri: 'file:///cache/selected.jpg', width: 2000, height: 1000 }],
  };
  ImagePicker.launchCameraAsync.mockResolvedValue(chosen);
  ImagePicker.launchImageLibraryAsync.mockResolvedValue(chosen);
  extractRegistrationCard.mockResolvedValue(result());
  getVehicleModels.mockResolvedValue([
    { id: 'golf', name: 'Golf', brandId: 'vw' },
  ]);
});
afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
});
it('fills the main fields immediately, maps catalog IDs and removes apply controls', async () => {
  await render({ weight: '1700' });
  await review();
  expect(onApply).toHaveBeenCalledTimes(1);
  expect(onApply).toHaveBeenCalledWith(expect.objectContaining({
    vin: 'WDD1770511N100321', brand: 'Volkswagen', model: 'Golf',
    brandId: 'vw', modelId: 'golf', weight: '1550', source: 'REGISTRATION_CARD',
  }));
  expect(tree.root.findAll((node) => node.props.testID?.startsWith('scan-apply-'))).toHaveLength(0);
  expect(button(tree, 'vehicleRequest.scan.confirm')).toBeUndefined();
  expect(mockDelete).toHaveBeenCalled();
});
it('preserves newer form edits made while extraction is pending', async () => {
  let resolveScan;
  extractRegistrationCard.mockImplementationOnce(() => new Promise((resolve) => { resolveScan = resolve; }));
  await render();
  await review();
  await act(async () => tree.update(
    <RegistrationScan value={{ ...vehicle, weight: '1800' }} brands={brands} onApply={onApply} />,
  ));
  await act(async () => resolveScan(result()));
  expect(onApply.mock.calls[0][0].weight).toBe('1800');
});
it('fills separate make and model text fields when the model is absent from the catalog', async () => {
  getVehicleModels.mockResolvedValue([]);
  const extracted = result();
  extracted.fields.brand.value = 'Ford';
  extracted.fields.model.value = 'Transit Courier';
  extractRegistrationCard.mockResolvedValueOnce(extracted);
  await render();
  await review();
  expect(onApply.mock.calls[0][0]).toMatchObject({
    brand: 'Ford', model: 'Transit Courier', manual: true, brandId: '', modelId: '',
  });
});
it('supports denied permission and picker cancellation without uploading', async () => {
  await render();
  ImagePicker.requestCameraPermissionsAsync.mockResolvedValue({
    granted: false,
  });
  await click(tree, 'vehicleRequest.scan.camera');
  expect(ImagePicker.launchCameraAsync).not.toHaveBeenCalled();
  expect(button(tree, 'vehicleRequest.scan.settings')).toBeDefined();
  ImagePicker.launchImageLibraryAsync.mockResolvedValue({ canceled: true });
  await click(tree, 'vehicleRequest.scan.gallery');
  expect(extractRegistrationCard).not.toHaveBeenCalled();
});
it('limits capture to two sides and supports retake, rotate and removal', async () => {
  await render();
  await click(tree, 'vehicleRequest.scan.camera');
  await click(tree, 'vehicleRequest.scan.gallery');
  expect(button(tree, 'vehicleRequest.scan.camera')).toBeUndefined();
  await click(tree, 'vehicleRequest.scan.rotate');
  await click(tree, 'vehicleRequest.scan.retake');
  await click(tree, 'vehicleRequest.scan.remove');
  expect(button(tree, 'vehicleRequest.scan.camera')).toBeDefined();
  expect(mockDelete).toHaveBeenCalled();
});
it('discards delayed scan responses after cancellation and a newer scan', async () => {
  let resolveOld;
  extractRegistrationCard.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveOld = resolve;
      }),
  );
  await render();
  await click(tree, 'vehicleRequest.scan.gallery');
  await click(tree, 'vehicleRequest.scan.extract');
  const oldSignal = extractRegistrationCard.mock.calls[0][1].signal;
  await click(tree, 'vehicleRequest.close');
  expect(oldSignal.aborted).toBe(true);
  await click(tree, 'vehicleRequest.scan.title');
  await review();
  await act(async () => resolveOld({ ...result(), status: 'wrong_document' }));
  expect(button(tree, 'vehicleRequest.scan.confirm')).toBeUndefined();
  expect(onApply).toHaveBeenCalledTimes(1);
});
it('aborts scans and clears previews when switching accounts', async () => {
  extractRegistrationCard.mockImplementationOnce(() => new Promise(() => {}));
  await render();
  await click(tree, 'vehicleRequest.scan.gallery');
  await click(tree, 'vehicleRequest.scan.extract');
  await act(async () => {
    mockOwner = 'other';
    mockAuthListener();
  });
  expect(extractRegistrationCard.mock.calls[0][1].signal.aborted).toBe(true);
  expect(onApply).not.toHaveBeenCalled();
});
it('shows safe retry/manual options for provider errors and wrong documents', async () => {
  extractRegistrationCard.mockRejectedValueOnce({
    code: 'REGISTRATION_TIMEOUT',
  });
  await render();
  await review();
  expect(button(tree, 'vehicleRequest.scan.manual')).toBeDefined();
  expect(
    tree.root.findAll(
      (node) =>
        node.props.children === 'vehicleRequest.scan.REGISTRATION_TIMEOUT',
    ).length,
  ).toBeGreaterThan(0);
  extractRegistrationCard.mockResolvedValueOnce({
    ...result(),
    status: 'wrong_document',
  });
  await click(tree, 'vehicleRequest.scan.extract');
  expect(onApply).not.toHaveBeenCalled();
  expect(
    tree.root.findAll(
      (node) => node.props.children === 'vehicleRequest.scan.wrong_document',
    ).length,
  ).toBeGreaterThan(0);
});

const feedback = (key) => tree.root.findAll(
  (node) => node.props.accessibilityLiveRegion === 'polite' &&
    node.props.children === `vehicleRequest.scan.${key}`,
)[0];
const expectVisibleFeedback = (key) => {
  const message = feedback(key);
  expect(message).toBeDefined();
  for (let parent = message.parent; parent; parent = parent.parent)
    expect(parent.type).not.toBe(ScrollView);
};

it.each(['extracted', 'partial'])('shows visible feedback for a %s scan', async (status) => {
  extractRegistrationCard.mockResolvedValueOnce({ ...result(), status });
  await render();
  await review();
  expectVisibleFeedback(status === 'partial' ? 'partialSuccess' : 'success');
  expect(button(tree, 'vehicleRequest.scan.confirm')).toBeUndefined();
});

it('shows no details found and allows retry when all fields are empty', async () => {
  const empty = result();
  for (const name of REGISTRATION_FIELDS)
    empty.fields[name] = { value: null, status: 'missing', evidence: [] };
  extractRegistrationCard.mockResolvedValueOnce(empty);
  await render();
  await review();
  expectVisibleFeedback('noDetails');
  expect(button(tree, 'vehicleRequest.scan.confirm')).toBeUndefined();
  expect(button(tree, 'vehicleRequest.scan.extract').props.disabled).toBe(false);
  await click(tree, 'vehicleRequest.scan.extract');
  expect(feedback('noDetails')).toBeUndefined();
  expectVisibleFeedback('partialSuccess');
});

it('fills a recovered make/model and VIN while ignoring extra body details', async () => {
  const extracted = result();
  for (const [name, value] of Object.entries({
    brand: 'FORD Transit Courier', model: 'FORD Transit Courier',
    vin: 'WF0WXXTACWKJ75955', emptyWeightKg: 1394, manufactureYear: 2019, bodyType: 'Fourgon',
  })) extracted.fields[name] = { value, status: 'extracted', evidence: [] };
  extractRegistrationCard.mockResolvedValueOnce(extracted);
  getVehicleModels.mockResolvedValueOnce([{ id: 'courier', name: 'Transit Courier', brandId: 'ford' }]);
  const fordBrands = [{ id: 'ford', name: 'Ford' }];
  vehicle = newVehicleDraft('customer', 'service').vehicle;
  onApply = jest.fn();
  await act(async () => { tree = create(<RegistrationScan value={vehicle} brands={fordBrands} onApply={onApply} />); });
  await click(tree, 'vehicleRequest.scan.title');
  await review();
  expect(onApply).toHaveBeenCalledWith(expect.objectContaining({
    brand: 'Ford', model: 'Transit Courier', brandId: 'ford', modelId: 'courier',
    vin: 'WF0WXXTACWKJ75955', weight: '1394', year: '2019', bodyType: '', transmission: '',
  }));
});

it('fills all readable fields for the reported Ford, including its date-derived year', async () => {
  const extracted = result();
  for (const [name, value] of Object.entries({
    brand: 'Ford', model: 'Transit Courier', vin: 'WF0WXXTACWKJ75955',
    emptyWeightKg: 1349, manufactureYear: 2019,
  })) extracted.fields[name] = { value, status: 'extracted', evidence: [] };
  extractRegistrationCard.mockResolvedValueOnce(extracted);
  // A readable make/model remains usable even when the catalog lacks it.
  await render();
  await review();
  expect(onApply).toHaveBeenCalledWith(expect.objectContaining({
    brand: 'Ford', model: 'Transit Courier', vin: 'WF0WXXTACWKJ75955',
    weight: '1349', year: '2019', manual: true,
    registrationScanApplied: true, source: 'REGISTRATION_CARD',
  }));
  expect(feedback('noDetails')).toBeUndefined();
  expectVisibleFeedback('partialSuccess');
});

it.each(['REGISTRATION_UNAVAILABLE', 'REGISTRATION_INVALID_OUTPUT', 'REGISTRATION_AUTH_REQUIRED'])('keeps %s errors visible and enables retry', async (code) => {
  extractRegistrationCard.mockRejectedValueOnce({ code });
  await render();
  await review();
  expectVisibleFeedback(code);
  expect(button(tree, 'vehicleRequest.scan.extract').props.disabled).toBe(false);
});

it('ends a stalled scan after 90 seconds, enables retry and ignores its late result', async () => {
  jest.useFakeTimers();
  let resolveOld;
  extractRegistrationCard.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
  try {
    await render();
    await review();
    const oldSignal = extractRegistrationCard.mock.calls[0][1].signal;
    await act(async () => jest.advanceTimersByTime(90000));
    expectVisibleFeedback('REGISTRATION_TIMEOUT');
    expect(oldSignal.aborted).toBe(true);
    expect(button(tree, 'vehicleRequest.scan.extract').props.disabled).toBe(false);
    await click(tree, 'vehicleRequest.scan.extract');
    expectVisibleFeedback('partialSuccess');
    await act(async () => resolveOld({ ...result(), status: 'wrong_document' }));
    expectVisibleFeedback('partialSuccess');
    expect(feedback('wrong_document')).toBeUndefined();
    await act(async () => jest.advanceTimersByTime(90000));
    expectVisibleFeedback('partialSuccess');
    expect(feedback('REGISTRATION_TIMEOUT')).toBeUndefined();
  } finally {
    jest.useRealTimers();
  }
});
