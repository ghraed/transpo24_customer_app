import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { io } from 'socket.io-client';
import { connectSocket, disconnectSocket, isSocketConnected, joinTripRoom, joinTripRoomWithAck, onOfferNew, waitForSocketConnection } from './socketService';

jest.mock('socket.io-client', () => ({ io: jest.fn() }));
jest.mock('@/config/backend', () => ({ getSocketBaseUrl: () => 'https://socket.example.test' }));
jest.mock('@/localization/i18n', () => ({ __esModule: true, default: { t: (text: string) => text } }));

const mockIo = io as jest.MockedFunction<typeof io>;

function fakeSocket() {
  const listeners = new Map<string, Set<(...args: any[]) => void>>();
  const instance = {
    id: 'socket-1',
    connected: false,
    connect: jest.fn(),
    disconnect: jest.fn(),
    removeAllListeners: jest.fn(),
    emit: jest.fn<(...args: any[]) => void>(),
    timeout: jest.fn<(ms: number) => { emit: (...args: any[]) => void }>(),
    on: jest.fn((event: string, listener: (...args: any[]) => void) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(listener);
    }),
    off: jest.fn((event: string, listener: (...args: any[]) => void) => {
      listeners.get(event)?.delete(listener);
    }),
    fire(event: string, payload?: unknown) {
      for (const listener of listeners.get(event) ?? []) listener(payload);
    },
  };
  instance.timeout.mockImplementation(() => ({ emit: instance.emit }));
  return instance;
}

beforeEach(() => {
  disconnectSocket();
  jest.clearAllMocks();
});

describe('socket lifecycle', () => {
  it('requires a token and an established socket for room actions', () => {
    expect(() => connectSocket('  ')).toThrow('Cannot connect socket without auth token.');
    expect(() => joinTripRoom('trip-1')).toThrow('Socket is not connected.');
    expect(isSocketConnected()).toBe(false);
    expect(mockIo).not.toHaveBeenCalled();
  });

  it('authenticates and reuses a socket for the same token', () => {
    const instance = fakeSocket();
    mockIo.mockReturnValue(instance as unknown as ReturnType<typeof io>);
    connectSocket('token-1');
    expect(mockIo).toHaveBeenCalledWith('https://socket.example.test', expect.objectContaining({ auth: { token: 'token-1' }, extraHeaders: { Authorization: 'Bearer token-1' } }));
    connectSocket('token-1');
    expect(mockIo).toHaveBeenCalledTimes(1);
    expect(instance.connect).toHaveBeenCalledTimes(1);
    instance.connected = true;
    expect(isSocketConnected()).toBe(true);
    joinTripRoom('trip-1');
    expect(instance.emit).toHaveBeenCalledWith('joinTripRoom', { tripId: 'trip-1' });
  });

  it('disconnects the old socket when credentials change', () => {
    const first = fakeSocket();
    const second = fakeSocket();
    mockIo.mockReturnValueOnce(first as unknown as ReturnType<typeof io>).mockReturnValueOnce(second as unknown as ReturnType<typeof io>);
    connectSocket('token-1');
    connectSocket('token-2');
    expect(first.removeAllListeners).toHaveBeenCalledTimes(1);
    expect(first.disconnect).toHaveBeenCalledTimes(1);
    disconnectSocket();
    expect(second.disconnect).toHaveBeenCalledTimes(1);
    expect(isSocketConnected()).toBe(false);
  });
});

describe('socket acknowledgements and listeners', () => {
  it('resolves a valid room acknowledgement and rejects malformed responses', async () => {
    const instance = fakeSocket();
    mockIo.mockReturnValue(instance as unknown as ReturnType<typeof io>);
    connectSocket('token');
    const success = joinTripRoomWithAck('trip-1', 100);
    expect(instance.timeout).toHaveBeenCalledWith(100);
    (instance.emit.mock.calls[0][2] as Function)(null, { tripId: 'trip-1', room: 'room-1' });
    await expect(success).resolves.toEqual({ tripId: 'trip-1', room: 'room-1' });
    const invalid = joinTripRoomWithAck('trip-1');
    (instance.emit.mock.calls[1][2] as Function)(null, { tripId: 'trip-1' });
    await expect(invalid).rejects.toThrow('ack payload is invalid');
    const failed = joinTripRoomWithAck('trip-1');
    (instance.emit.mock.calls[2][2] as Function)(new Error('offline'));
    await expect(failed).rejects.toThrow('offline');
  });

  it('subscribes and unsubscribes offer listeners', () => {
    const instance = fakeSocket();
    mockIo.mockReturnValue(instance as unknown as ReturnType<typeof io>);
    connectSocket('token');
    const listener = jest.fn();
    const unsubscribe = onOfferNew(listener);
    instance.fire('offerNew', { requestId: 'r1' });
    expect(listener).toHaveBeenCalledWith({ requestId: 'r1' });
    unsubscribe();
    instance.fire('offerNew', { requestId: 'r2' });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('waits for connection and removes listeners after success or error', async () => {
    const instance = fakeSocket();
    mockIo.mockReturnValue(instance as unknown as ReturnType<typeof io>);
    connectSocket('token');
    const connected = waitForSocketConnection();
    instance.fire('connect');
    await expect(connected).resolves.toBe('socket-1');
    expect(instance.off).toHaveBeenCalledWith('connect_error', expect.any(Function));
    const failed = waitForSocketConnection();
    instance.fire('connect_error', new Error('denied'));
    await expect(failed).rejects.toThrow('denied');
  });
});
