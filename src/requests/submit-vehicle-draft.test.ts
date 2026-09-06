import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import * as api from '@/lib/api';
import { submitVehicleDraft } from './submit-vehicle-draft';
import {
  newVehicleDraft,
  patchVehicleDraft,
  type VehicleDraft,
} from './vehicle-draft';

jest.mock('@/lib/api', () =>
  Object.fromEntries(
    [
      'createCustomerRequest',
      'deleteRequestPhoto',
      'getCustomerRequestStatus',
      'submitCustomerRequest',
      'updateDropoffLocation',
      'updatePickupLocation',
      'updateScheduleAndItemDetails',
      'uploadRequestPhotos',
    ].map((key) => [key, jest.fn()]),
  ),
);
const mocked = jest.mocked(api);
function fixture() {
  const draft = newVehicleDraft('customer', 'vehicle-service');
  return patchVehicleDraft(draft, {
    vehicle: {
      ...draft.vehicle,
      brand: 'VW',
      model: 'Touran',
      year: '2012',
      weight: '1549',
      bodyType: 'VAN',
      transmission: 'MANUAL',
    },
    condition: { mobility: 'RUNNING', issues: [], notes: '' },
    pickup: { latitude: 47, longitude: 7, address: 'Pickup' },
    dropoff: { latitude: 48, longitude: 8, address: 'Dropoff' },
  });
}
describe('vehicle submission', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mocked.createCustomerRequest.mockResolvedValue({
      id: 'request-1',
    } as never);
    mocked.getCustomerRequestStatus.mockResolvedValue({
      status: 'DRAFT',
    } as never);
  });
  it('submits without images or hidden goods fields', async () => {
    let draft = fixture();
    const persist = (change: Partial<VehicleDraft>) =>
      (draft = patchVehicleDraft(draft, change));
    await expect(submitVehicleDraft(draft, persist)).resolves.toBe('request-1');
    expect(mocked.uploadRequestPhotos).not.toHaveBeenCalled();
    expect(
      mocked.updateScheduleAndItemDetails.mock.calls[0][1],
    ).not.toHaveProperty('itemTitle');
    expect(mocked.updateScheduleAndItemDetails.mock.calls[0][1]).toMatchObject({
      vehicleBrand: 'VW',
      vehicleEstimatedWeightKg: 1549,
      requiresLoadingHelp: false,
    });
    expect(mocked.submitCustomerRequest).toHaveBeenCalledWith('request-1');
  });
  it('reuses the draft and uploaded images after submission fails', async () => {
    let draft = {
      ...fixture(),
      photos: [{ localId: 'photo-1', uri: 'file:///car.jpg' }],
    } as VehicleDraft;
    const persist = (change: Partial<VehicleDraft>) =>
      (draft = patchVehicleDraft(draft, change));
    mocked.uploadRequestPhotos.mockResolvedValue({
      photos: [{ id: 'uploaded-1' }],
    } as never);
    mocked.submitCustomerRequest.mockRejectedValueOnce(new Error('Network'));
    await expect(submitVehicleDraft(draft, persist)).rejects.toThrow('Network');
    expect(draft.requestId).toBe('request-1');
    expect(draft.photos[0].uploadedId).toBe('uploaded-1');
    await submitVehicleDraft(draft, persist);
    expect(mocked.createCustomerRequest).toHaveBeenCalledTimes(1);
    expect(mocked.uploadRequestPhotos).toHaveBeenCalledTimes(1);
  });
  it('recovers when the server submitted successfully but the response was lost', async () => {
    const draft = { ...fixture(), requestId: 'already-sent' };
    mocked.getCustomerRequestStatus.mockResolvedValue({
      status: 'PENDING_QUOTES',
    } as never);
    await expect(submitVehicleDraft(draft, () => draft)).resolves.toBe(
      'already-sent',
    );
    expect(mocked.updatePickupLocation).not.toHaveBeenCalled();
    expect(mocked.submitCustomerRequest).not.toHaveBeenCalled();
  });
});
