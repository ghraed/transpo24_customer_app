import { createFurnitureTransportRequest } from './api';

jest.mock('@/lib/auth-token', () => ({ getAccessToken: () => 'test-token' }));
jest.mock('@/config/backend', () => ({ getApiBaseUrl: () => 'https://api.test' }));
jest.mock('@/localization/i18n', () => ({
  __esModule: true,
  default: { t: (key) => key },
}));

const { default: NativeFormData } = jest.requireActual('react-native/Libraries/Network/FormData');
const originalFormData = global.FormData;
const originalXhr = global.XMLHttpRequest;
let sentForm;

beforeEach(() => {
  sentForm = undefined;
  global.FormData = NativeFormData;
  class FakeXhr {
    static DONE = 4;
    open() {}
    setRequestHeader() {}
    send(form) {
      sentForm = form;
      this.status = 201;
      this.readyState = FakeXhr.DONE;
      this.responseText = JSON.stringify({
        id: 'furniture-request', serviceId: 'furniture', status: 'DRAFT',
        pickupLocation: { latitude: 33.4, longitude: 35.6 },
        dropoffLocation: { latitude: 33.5, longitude: 35.7 },
      });
      this.onreadystatechange();
    }
  }
  global.XMLHttpRequest = FakeXhr;
});

afterEach(() => {
  global.FormData = originalFormData;
  global.XMLHttpRequest = originalXhr;
});

const movingDate = new Date(2026, 9, 25, 9, 0).toISOString();
const payload = {
  furnitureDescription: 'Sofa', approximateItemCount: 1, movingDate,
  scheduledDeliveryAt: new Date(2026, 9, 25, 12, 0).toISOString(),
  pickupLocation: { latitude: 33.4, longitude: 35.6 },
  deliveryLocation: { latitude: 33.5, longitude: 35.7 },
  furniturePhotos: [{ uri: 'file:///sofa.jpg', mimeType: 'image/jpeg' }],
};
const fields = () => Object.fromEntries(sentForm.getParts().map((part) => [part.fieldName, part.string]));

it.each([false, undefined])('sends the unchanged 9:00 pickup for scheduled furniture (isImmediate=%s)', async (isImmediate) => {
  await createFurnitureTransportRequest({ ...payload, isImmediate });
  expect(fields()).toMatchObject({ movingDate, scheduledPickupAt: movingDate, scheduledDeliveryAt: payload.scheduledDeliveryAt });
});

it('preserves an explicitly selected pickup timestamp', async () => {
  const scheduledPickupAt = new Date(2026, 9, 25, 11, 30).toISOString();
  await createFurnitureTransportRequest({ ...payload, isImmediate: false, scheduledPickupAt });
  expect(fields().scheduledPickupAt).toBe(scheduledPickupAt);
});

it('omits scheduled pickup for immediate furniture transport', async () => {
  await createFurnitureTransportRequest({ ...payload, isImmediate: true, scheduledPickupAt: movingDate });
  expect(fields().isImmediate).toBe('true');
  expect(fields()).not.toHaveProperty('scheduledPickupAt');
});
