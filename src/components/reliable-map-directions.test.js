import React from 'react';
import { act, create } from 'react-test-renderer';
import { AppState } from 'react-native';
import { createReliableMapDirections } from './reliable-map-directions';

const Directions = createReliableMapDirections('Polyline');
const origin = { latitude: 38.5, longitude: -120.2 };
const destination = { latitude: 43.252, longitude: -126.453 };
const props = {
  origin,
  destination,
  apikey: 'test-key',
  strokeColor: '#2563EB',
};
const data = {
  status: 'OK',
  routes: [
    {
      overview_polyline: { points: '_p~iF~ps|U_ulLnnqC_mqNvxq`@' },
      legs: [{ distance: { value: 1234 }, duration: { value: 120 } }],
    },
  ],
};
const response = () => ({ ok: true, json: async () => data });
let tree;
let testTime = Date.now();
const originalFetch = global.fetch;
beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime((testTime += 10 * 60 * 1000));
  global.fetch = jest.fn(async () => response());
});
afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
  tree = null;
  jest.useRealTimers();
  global.fetch = originalFetch;
  jest.restoreAllMocks();
});
async function mount(overrides = {}) {
  await act(async () => {
    tree = create(<Directions {...props} {...overrides} />);
  });
}

test('retries a failed first request and draws the road route with distance', async () => {
  fetch.mockRejectedValueOnce(new Error('Offline'));
  const onReady = jest.fn();
  await mount({ onReady });
  expect(tree.root.findAllByType('Polyline')).toHaveLength(0);
  await act(async () => jest.advanceTimersByTime(5000));
  expect(tree.root.findByType('Polyline').props.coordinates).toHaveLength(3);
  expect(onReady).toHaveBeenCalledWith(
    expect.objectContaining({ distance: 1.234, duration: 2 }),
  );
});

test('preserves the last road route during a failed refresh and restores it on remount', async () => {
  await mount();
  const coordinates = tree.root.findByType('Polyline').props.coordinates;
  fetch.mockRejectedValueOnce(new Error('Offline'));
  await act(async () => {
    tree.update(
      <Directions {...props} origin={{ ...origin, latitude: 38.6 }} />,
    );
  });
  await act(async () => jest.advanceTimersByTime(15000));
  expect(tree.root.findByType('Polyline').props.coordinates).toEqual(
    coordinates,
  );
  await act(async () => tree.unmount());
  tree = null;
  await mount();
  expect(tree.root.findByType('Polyline').props.coordinates).toEqual(
    coordinates,
  );
});

test('does not restart requests for changed callback or address objects', async () => {
  let finish;
  fetch.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await mount();
  const signal = fetch.mock.calls[0][1].signal;
  await act(async () => {
    tree.update(
      <Directions
        {...props}
        origin={{ ...origin, address: 'Pickup' }}
        destination={{ ...destination, address: 'Dropoff' }}
        onReady={() => {}}
      />,
    );
  });
  expect(signal.aborted).toBe(false);
  expect(fetch).toHaveBeenCalledTimes(1);
  await act(async () => finish(response()));
  expect(tree.root.findByType('Polyline')).toBeDefined();
});

test('aborts stale destinations and ignores out-of-order results', async () => {
  let finish;
  fetch.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await mount();
  const signal = fetch.mock.calls[0][1].signal;
  await act(async () => {
    tree.update(
      <Directions
        {...props}
        destination={{ latitude: 40.7, longitude: -120.95 }}
      />,
    );
  });
  expect(signal.aborted).toBe(true);
  const line = tree.root.findByType('Polyline').props.coordinates;
  await act(async () => finish(response()));
  expect(tree.root.findByType('Polyline').props.coordinates).toBe(line);
});

test('retries immediately on foreground and cancels timers and requests after unmount', async () => {
  let foreground;
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_event, callback) => {
      foreground = callback;
      return { remove: jest.fn() };
    });
  fetch.mockRejectedValueOnce(new Error('Offline'));
  await mount();
  await act(async () => foreground('active'));
  expect(tree.root.findByType('Polyline')).toBeDefined();
  await act(async () => tree.unmount());
  tree = null;
  const count = fetch.mock.calls.length;
  await act(async () => jest.advanceTimersByTime(60000));
  expect(fetch).toHaveBeenCalledTimes(count);
});

test.each([
  { status: 'ZERO_RESULTS', routes: [] },
  { status: 'OK', routes: [{ overview_polyline: { points: 'invalid' } }] },
])(
  'does not invent a line for unavailable or invalid routes',
  async (badData) => {
    fetch.mockResolvedValue({ ok: true, json: async () => badData });
    await mount();
    expect(tree.root.findAllByType('Polyline')).toHaveLength(0);
  },
);

test('times out a hung request and retries instead of remaining blank indefinitely', async () => {
  fetch.mockImplementationOnce(
    (_url, { signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('Aborted')));
      }),
  );
  await mount();
  const signal = fetch.mock.calls[0][1].signal;
  await act(async () => jest.advanceTimersByTime(20000));
  expect(signal.aborted).toBe(true);
  await act(async () => jest.advanceTimersByTime(5000));
  expect(tree.root.findByType('Polyline')).toBeDefined();
});
