jest.mock('node:child_process', () => ({ spawnSync: jest.fn() }));

const { spawnSync } = require('node:child_process');
const { reversePort, getBackendHostPort } = require('./setup-adb-reverse');

beforeEach(() => {
  spawnSync.mockReset();
  spawnSync.mockImplementation((_command, args) => ({
    status: 0,
    stdout: args[0] === 'devices' ? 'List of devices attached\n7925f75a\tdevice\n\n' : '',
    stderr: '',
  }));
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

function mockDevices(output) {
  spawnSync.mockImplementation((_command, args) => ({
    status: 0,
    stdout: args[0] === 'devices' ? `List of devices attached\n${output}\n\n` : '',
    stderr: '',
  }));
}

test('preserves the Linux permission error and explains the udev repair', () => {
  mockDevices('7925f75a\tno permissions (missing udev rules? user is in the plugdev group); see [http://developer.android.com/tools/device.html]');
  expect(() => reversePort()).toThrow('7925f75a (no permissions (missing udev rules?');
  expect(() => reversePort()).toThrow('sudo apt-get install android-sdk-platform-tools-common');
  expect(spawnSync.mock.calls.some(([, args]) => args[0] === 'reverse')).toBe(false);
});

test.each([
  ['unauthorized', 'accept the USB debugging authorization prompt'],
  ['offline', 'adb kill-server'],
])('explains how to recover a device that is %s', (state, hint) => {
  mockDevices(`7925f75a\t${state}`);
  expect(() => reversePort()).toThrow(hint);
});

test('reverses the requested port for a ready device', () => {
  reversePort(8081);
  expect(spawnSync).toHaveBeenCalledWith('adb', ['reverse', 'tcp:8081', 'tcp:8081'], { encoding: 'utf8' });
});

test('supports a separate host API port without changing the phone URL', () => {
  reversePort(3001, 3002);
  expect(spawnSync).toHaveBeenCalledWith('adb', ['reverse', 'tcp:3001', 'tcp:3002'], { encoding: 'utf8' });
});

test('validates the configured backend host port', () => {
  const previous = process.env.EXPO_ANDROID_BACKEND_HOST_PORT;
  try {
    process.env.EXPO_ANDROID_BACKEND_HOST_PORT = '3002';
    expect(getBackendHostPort()).toBe(3002);
    process.env.EXPO_ANDROID_BACKEND_HOST_PORT = '65536';
    expect(() => getBackendHostPort()).toThrow('must be a port');
  } finally {
    if (previous === undefined) delete process.env.EXPO_ANDROID_BACKEND_HOST_PORT;
    else process.env.EXPO_ANDROID_BACKEND_HOST_PORT = previous;
  }
});

test('still explains when no device is connected', () => {
  mockDevices('');
  expect(() => reversePort()).toThrow('No Android USB device detected');
});
