import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import React from 'react';
import { act, create } from 'react-test-renderer';
import VehicleRequestRoute from '@/app/vehicle-request';
import { newVehicleDraft } from './vehicle-draft';
import { readVehicleDraft, writeVehicleDraft } from './vehicle-draft-storage';
import { AddressEditor } from './address-editor';
import { ScheduleEditor } from './schedule-editor';
import { submitVehicleDraft } from './submit-vehicle-draft';
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ serviceId: 'vehicle-service' }),
  useRouter: () => ({ back: jest.fn(), replace: mockReplace }),
  Stack: { Screen: () => null },
}));
jest.mock('@/lib/auth-token', () => ({
  useAuthSession: () => ({ user: { id: 'customer', countryCode: 'CH' } }),
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key) => key,
    i18n: { language: 'de', dir: () => 'ltr' },
  }),
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: 'SafeAreaView',
  useSafeAreaInsets: () => ({ bottom: 24 }),
}));
jest.mock('./vehicle-draft-storage', () => ({
  readVehicleDraft: jest.fn(),
  writeVehicleDraft: jest.fn(),
  retainDraftPhoto: (_owner, photo) => photo,
  clearVehicleDraft: jest.fn(),
}));
jest.mock('./address-editor', () => ({ AddressEditor: () => null }));
jest.mock('./vehicle-editor', () => ({ VehicleEditor: () => null }));
jest.mock('./schedule-editor', () => ({
  ScheduleEditor: () => null,
  scheduleLabel: (value) => value.at,
}));
jest.mock('./submit-vehicle-draft', () => ({ submitVehicleDraft: jest.fn() }));
jest.mock('@/lib/places', () => ({
  getDrivingDistance: jest.fn(async () => 90),
}));

function button(tree, text) {
  return tree.root
    .findAll((node) => typeof node.props.onPress === 'function')
    .find(
      (node) => node.findAll((child) => child.props.children === text).length,
    );
}
describe('vehicle review editing', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockReplace.mockClear();
    submitVehicleDraft.mockReset();
    const draft = newVehicleDraft('customer', 'vehicle-service');
    readVehicleDraft.mockReturnValue({
      ...draft,
      vehicle: {
        ...draft.vehicle,
        brand: 'VW',
        model: 'Touran',
        year: '2012',
        weight: '1549',
        bodyType: 'VAN',
        transmission: 'MANUAL',
      },
      condition: {
        mobility: 'ROLLABLE',
        issues: ['CRANE', 'ACCIDENT'],
        notes: 'Gate 2',
      },
      pickup: { latitude: 47, longitude: 7, address: 'Basel' },
      dropoff: { latitude: 48, longitude: 8, address: 'Zurich' },
      photos: Array.from({ length: 4 }, (_, index) => ({
        localId: `${index}`,
        uri: `file:///${index}.jpg`,
      })),
    });
    writeVehicleDraft.mockClear();
  });
  afterEach(() => jest.useRealTimers());
  it('edits pickup and appointment, returns to review, and reopens all existing values', async () => {
    let tree;
    await act(async () => {
      tree = create(<VehicleRequestRoute />);
    });
    for (const label of [
      'continue',
      'continue',
      'confirmPickup',
      'confirmDropoff',
    ]) {
      await act(async () => {
        button(tree, `vehicleRequest.${label}`).props.onPress();
      });
    }
    expect(tree.root.findByType(ScheduleEditor)).toBeDefined();
    expect(button(tree, 'vehicleRequest.camera')).toBeDefined();
    expect(button(tree, 'vehicleRequest.gallery')).toBeDefined();
    expect(button(tree, 'vehicleRequest.submit')).toBeUndefined();
    expect(tree.root.findAll(node => node.props.accessibilityLabel === 'vehicleRequest.edit vehicleRequest.step.vehicle')).toHaveLength(0);
    const at = new Date(Date.now() + 172800000).toISOString();
    await act(async () => {
      tree.root.findByType(ScheduleEditor).props.onChange({ immediate: false, at });
    });
    await act(async () => button(tree, 'vehicleRequest.continue').props.onPress());
    expect(tree.root.findAllByType(ScheduleEditor)).toHaveLength(0);
    expect(button(tree, 'vehicleRequest.camera')).toBeUndefined();
    expect(button(tree, 'vehicleRequest.submit')).toBeDefined();
    for (const section of ['vehicle', 'condition', 'pickup', 'dropoff', 'schedule', 'photos']) {
      expect(tree.root.findAll(node => node.props.accessibilityLabel === `vehicleRequest.edit vehicleRequest.step.${section}`).length).toBeGreaterThan(0);
    }
    const edit = async (step) =>
      act(async () => {
        tree.root
          .findAll((node) => typeof node.props.onPress === 'function')
          .find(
            (node) =>
              node.props.accessibilityLabel ===
              `vehicleRequest.edit vehicleRequest.step.${step}`,
          )
          .props.onPress();
      });
    await edit('pickup');
    expect(tree.root.findByType(AddressEditor).props.value.address).toBe(
      'Basel',
    );
    await act(async () => {
      tree.root
        .findByType(AddressEditor)
        .props.onChange({ latitude: 46, longitude: 6, address: 'Bern' });
    });
    await act(async () => {
      button(tree, 'vehicleRequest.confirmPickup').props.onPress();
    });
    await edit('schedule');
    expect(tree.root.findByType(ScheduleEditor).props.value.at).toBe(at);
    await act(async () => {
      tree.root.findByType(ScheduleEditor).props.onChange({ immediate: false, at: new Date(Date.now() - 1000).toISOString() });
    });
    await act(async () => button(tree, 'vehicleRequest.save').props.onPress());
    expect(tree.root.findByType(ScheduleEditor)).toBeDefined();
    expect(button(tree, 'vehicleRequest.submit')).toBeUndefined();
    await act(async () => {
      tree.root.findByType(ScheduleEditor).props.onChange({ immediate: false, at });
    });
    await act(async () => button(tree, 'vehicleRequest.save').props.onPress());
    expect(button(tree, 'vehicleRequest.submit').props.disabled).toBe(false);
    await edit('photos');
    expect(tree.root.findByType(ScheduleEditor).props.value.at).toBe(at);
    expect(button(tree, 'vehicleRequest.camera')).toBeDefined();
    expect(button(tree, 'vehicleRequest.removePhoto')).toBeDefined();
    await act(async () => button(tree, 'vehicleRequest.save').props.onPress());
    expect(button(tree, 'vehicleRequest.removePhoto')).toBeUndefined();
    expect(JSON.stringify(tree.toJSON())).toContain(at);
    await act(async () => button(tree, 'vehicleRequest.back').props.onPress());
    expect(tree.root.findByType(ScheduleEditor).props.value.at).toBe(at);
    await act(async () => button(tree, 'vehicleRequest.continue').props.onPress());
    expect(button(tree, 'vehicleRequest.submit').props.disabled).toBe(false);
    const saved = writeVehicleDraft.mock.calls.at(-1)[0];
    expect(saved.pickup.address).toBe('Bern');
    expect(saved.dropoff.address).toBe('Zurich');
    expect(saved.vehicle.model).toBe('Touran');
    expect(saved.condition.issues).toEqual(['CRANE', 'ACCIDENT']);
    expect(saved.photos).toHaveLength(4);
    expect(JSON.stringify(tree.toJSON())).not.toMatch(
      /Item title|Artikeldetails|Waren|Möbel/,
    );
    await act(async () => tree.unmount());
  });
  it.each(['success', 'failure'])('keeps the native form parent stable during submission %s', async outcome => {
    let tree;
    await act(async () => { tree = create(<VehicleRequestRoute />); });
    for (const label of ['continue', 'continue', 'confirmPickup', 'confirmDropoff', 'continue']) {
      await act(async () => button(tree, `vehicleRequest.${label}`).props.onPress());
    }
    const form = () => tree.root.findAll(node => node.props.collapsable === false && node.props.pointerEvents)[0];
    const parent = form();
    let finish, fail;
    submitVehicleDraft.mockImplementationOnce(() => new Promise((resolve, reject) => { finish = resolve; fail = reject; }));
    await act(async () => button(tree, 'vehicleRequest.submit').props.onPress());
    expect(form()).toBe(parent);
    expect(form().props.pointerEvents).toBe('none');
    await act(async () => {
      if (outcome === 'success') finish('request-123');
      else fail(new Error('offline'));
    });
    expect(form()).toBe(parent);
    if (outcome === 'success') {
      expect(mockReplace).toHaveBeenCalledWith({ pathname: '/request-status', params: { requestId: 'request-123' } });
      expect(form().props.pointerEvents).toBe('none');
    } else {
      expect(mockReplace).not.toHaveBeenCalled();
      expect(form().props.pointerEvents).toBe('auto');
      expect(button(tree, 'vehicleRequest.submit').props.disabled).toBe(false);
    }
    await act(async () => tree.unmount());
  });

});
