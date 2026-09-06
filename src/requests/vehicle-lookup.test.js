import { act, create } from 'react-test-renderer';
import React from 'react';
import { beforeEach, expect, it, jest } from '@jest/globals';
import { VehicleEditor } from './vehicle-editor';
import { newVehicleDraft } from './vehicle-draft';
import { decodeVehicleVin } from '@/lib/api';

jest.mock('@/lib/api', () => ({
  decodeVehicleVin: jest.fn(),
  getVehicleBrands: jest.fn(async () => []),
  getVehicleModels: jest.fn(async () => []),
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: key => key, i18n: { dir: () => 'ltr' } }),
}));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));

async function renderAndLookup(identifiers, mode) {
  const value = { ...newVehicleDraft('customer', 'service').vehicle, ...identifiers };
  const onChange = jest.fn();
  let tree;
  await act(async () => {
    tree = create(<VehicleEditor value={value} onChange={onChange} errors={[]} />);
  });
  if (mode) {
    await act(async () => {
      tree.root.findAll(node => typeof node.props.onPress === 'function').find(node =>
        node.props.accessibilityRole === 'radio' &&
        node.findAll(child => child.props.children === `vehicleRequest.${mode}`).length
      ).props.onPress();
    });
  }
  await act(async () => {
    tree.root.findAll(node => typeof node.props.onPress === 'function').find(node =>
      node.findAll(child => child.props.children === 'vehicleRequest.lookup').length
    ).props.onPress();
  });
  await act(async () => tree.unmount());
  return onChange;
}

beforeEach(() => {
  jest.clearAllMocks();
  decodeVehicleVin.mockResolvedValue({ brand: 'Mercedes-Benz', model: 'A-Class' });
});

it.each(['vin', 'registration'])('retains both identifiers in %s mode and prefills the returned make', async mode => {
  const onChange = await renderAndLookup({ vin: 'WDD1770511N100321', registration: '653.409.643' }, mode);
  expect(decodeVehicleVin).toHaveBeenCalledWith('WDD1770511N100321', { swissRegistrationNumber: '653409643' });
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ brand: 'Mercedes-Benz', model: 'A-Class' }));
});
it('supports a Swiss registration without a VIN', async () => {
  await renderAndLookup({ vin: '', registration: '653.409.643' });
  expect(decodeVehicleVin).toHaveBeenCalledWith('', { swissRegistrationNumber: '653409643' });
});
it('supports a VIN without a Swiss registration', async () => {
  await renderAndLookup({ vin: 'WDD1770511N100321', registration: '' });
  expect(decodeVehicleVin).toHaveBeenCalledWith('WDD1770511N100321', { swissRegistrationNumber: undefined });
});
it('rejects an invalid VIN in VIN mode', async () => {
  await renderAndLookup({ vin: 'INVALID', registration: '' });
  expect(decodeVehicleVin).not.toHaveBeenCalled();
});
