import { act, create } from 'react-test-renderer';
import React from 'react';
import { afterEach, beforeEach, expect, it, jest } from '@jest/globals';
import { ChoiceField, VehicleEditor } from './vehicle-editor';
import { newVehicleDraft } from './vehicle-draft';
import { getVehicleBrands, getVehicleModels } from '@/lib/api';

jest.mock('@/lib/api', () => ({
  decodeVehicleVin: jest.fn(),
  getVehicleBrands: jest.fn(),
  getVehicleModels: jest.fn(),
}));
jest.mock('./registration-scan', () => ({ RegistrationScan: () => null }));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: key => key, i18n: { dir: () => 'ltr' } }),
}));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));

beforeEach(() => {
  jest.useFakeTimers();
  getVehicleBrands.mockResolvedValue([{ id: 'sci:mercedes', name: 'Mercedes-Benz' }, { id: 'sci:bmw', name: 'BMW' }]);
  getVehicleModels.mockResolvedValue([]);
});
afterEach(() => { jest.useRealTimers(); jest.clearAllMocks(); });

it('loads models after a temporary failure without requiring a tap on Try again', async () => {
  getVehicleModels
    .mockRejectedValueOnce(Object.assign(new Error('Temporary catalog failure'), { status: 503 }))
    .mockResolvedValueOnce([{ id: 'lancer', name: 'Lancer', brandId: 'sci:mitsubishi' }]);
  getVehicleBrands.mockResolvedValue([{ id: 'sci:mitsubishi', name: 'Mitsubishi' }]);
  function Form() {
    const [value, onChange] = React.useState(newVehicleDraft('customer', 'service').vehicle);
    return <VehicleEditor value={value} onChange={onChange} errors={[]} />;
  }
  let tree;
  await act(async () => { tree = create(<Form />); });
  const selector = label => tree.root.findAllByType(ChoiceField).find(node => node.props.label === `vehicleRequest.${label}`);
  await act(async () => { selector('brand').props.onChange('sci:mitsubishi'); });
  const modelButton = selector('model').findAll(node => node.props.accessibilityRole === 'button' && node.props.accessibilityLabel === 'vehicleRequest.model')[0];
  expect(modelButton.props.disabled).toBe(false);
  await act(async () => { modelButton.props.onPress(); });
  expect(modelButton.props.accessibilityState.expanded).toBe(true);
  await act(async () => { jest.advanceTimersByTime(0); });
  expect(selector('model').props.loading).toBe(true);
  expect(selector('model').props.error).toBe(false);
  await act(async () => { jest.advanceTimersByTime(400); });
  expect(getVehicleModels).toHaveBeenCalledTimes(2);
  expect(selector('model').props.options).toEqual([{ value: 'lancer', label: 'Lancer' }]);
  expect(selector('model').props.loading).toBe(false);
  expect(selector('model').props.error).toBe(false);
  await act(async () => tree.unmount());
});

it('shows the retry fallback after the automatic attempt also fails', async () => {
  getVehicleModels.mockRejectedValue(Object.assign(new Error('Catalog unavailable'), { status: 503 }));
  function Form() {
    const [value, onChange] = React.useState(newVehicleDraft('customer', 'service').vehicle);
    return <VehicleEditor value={value} onChange={onChange} errors={[]} />;
  }
  let tree;
  await act(async () => { tree = create(<Form />); });
  const selector = label => tree.root.findAllByType(ChoiceField).find(node => node.props.label === `vehicleRequest.${label}`);
  await act(async () => { selector('brand').props.onChange('sci:bmw'); });
  await act(async () => { jest.advanceTimersByTime(0); });
  await act(async () => { jest.advanceTimersByTime(400); });
  expect(getVehicleModels).toHaveBeenCalledTimes(2);
  expect(selector('model').props.loading).toBe(false);
  expect(selector('model').props.error).toBe(true);
  await act(async () => tree.unmount());
});

it('clears the old model, ignores a late response for another make and searches within the selected make', async () => {
  let resolveMercedes;
  getVehicleModels.mockImplementation((brand) => brand === 'sci:mercedes'
    ? new Promise(resolve => { resolveMercedes = resolve; })
    : Promise.resolve([{ id: 'bmw320', name: '320', brandId: brand }, { id: 'c230', name: 'C 230', brandId: 'sci:mercedes' }]));
  let tree;
  let current;
  function Form() {
    const [value, onChange] = React.useState({ ...newVehicleDraft('customer', 'service').vehicle, manual: true });
    current = value;
    return <VehicleEditor value={value} onChange={onChange} errors={[]} />;
  }
  await act(async () => { tree = create(<Form />); });
  const selector = label => tree.root.findAllByType(ChoiceField).find(node => node.props.label === `vehicleRequest.${label}`);
  expect(selector('model').props.disabled).toBe(true);
  await act(async () => { selector('brand').props.onChange('sci:mercedes'); });
  await act(async () => { jest.runOnlyPendingTimers(); });
  await act(async () => { selector('brand').props.onChange('sci:bmw'); });
  expect(current.model).toBe('');
  expect(current.modelId).toBe('');
  await act(async () => { jest.runOnlyPendingTimers(); });
  await act(async () => { resolveMercedes([{ id: 'c320', name: 'C 320' }]); });
  expect(selector('model').props.options).toEqual([{ value: 'bmw320', label: '320' }]);
  await act(async () => { selector('model').props.onSearchChange('320'); });
  expect(selector('model').props.loading).toBe(true);
  await act(async () => { jest.advanceTimersByTime(350); });
  expect(getVehicleModels).toHaveBeenLastCalledWith('sci:bmw', '320');
  await act(async () => { selector('model').props.onChange('bmw320'); });
  expect(current).toEqual(expect.objectContaining({ brand: 'BMW', model: '320', source: 'MANUAL' }));
  await act(async () => tree.unmount());
});

it('preserves a restored make/model until the customer selects a different make', async () => {
  getVehicleModels.mockResolvedValue([{ id: 'c320', name: 'C 320', brandId: 'sci:mercedes' }]);
  let current;
  function Form() {
    const [value, onChange] = React.useState({
      ...newVehicleDraft('customer', 'service').vehicle,
      manual: true, brand: 'Mercedes-Benz', brandId: 'sci:mercedes', model: 'C 320', modelId: 'c320',
    });
    current = value;
    return <VehicleEditor value={value} onChange={onChange} errors={[]} />;
  }
  let tree;
  await act(async () => { tree = create(<Form />); });
  await act(async () => { jest.runOnlyPendingTimers(); });
  const make = () => tree.root.findAllByType(ChoiceField).find(node => node.props.label === 'vehicleRequest.brand');
  expect(tree.root.findAll(node => node.props.accessibilityLabel === 'vehicleRequest.catalogMode')).toHaveLength(0);
  expect(current.model).toBe('C 320');
  await act(async () => { make().props.onChange('sci:mercedes'); });
  expect(current.model).toBe('C 320');
  await act(async () => { make().props.onChange('sci:bmw'); });
  expect(current).toEqual(expect.objectContaining({ brand: 'BMW', model: '', modelId: '' }));
  await act(async () => { jest.runOnlyPendingTimers(); });
  const model = tree.root.findAllByType(ChoiceField).find(node => node.props.label === 'vehicleRequest.model');
  expect(model.props.options).toEqual([]);
  await act(async () => tree.unmount());
});
