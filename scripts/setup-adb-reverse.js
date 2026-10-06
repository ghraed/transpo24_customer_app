#!/usr/bin/env node

const { spawnSync } = require('node:child_process');

const BACKEND_PORT = 3001;

function runAdbCommand(args) {
  return spawnSync('adb', args, {
    encoding: 'utf8',
  });
}

function fail(message) {
  throw new Error(message);
}

function ensureAdbInstalled() {
  const adbVersion = runAdbCommand(['version']);

  if (adbVersion.error && adbVersion.error.code === 'ENOENT') {
    fail(
      'adb is not installed or not on PATH. Install Android platform-tools and confirm `adb devices` works.',
    );
  }

  if (adbVersion.status !== 0) {
    fail(adbVersion.stderr.trim() || 'Failed to run `adb version`.');
  }
}

function getConnectedDevices() {
  const devicesResult = runAdbCommand(['devices']);

  if (devicesResult.status !== 0) {
    fail(devicesResult.stderr.trim() || 'Failed to list adb devices.');
  }

  const rawLines = devicesResult.stdout
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean);

  const attachedDevices = rawLines
    .map((line) => {
      // ADB states can contain spaces, notably "no permissions (...)" on Linux.
      const [, serial, state] = line.match(/^(\S+)\s+(.+)$/) ?? [];
      return { serial, state };
    })
    .filter((device) => device.serial);

  const readyDevices = attachedDevices.filter((device) => device.state === 'device');

  if (readyDevices.length === 0) {
    const unavailableStates = attachedDevices
      .map((device) => `${device.serial} (${device.state})`)
      .join(', ');
    const hints = [];

    if (attachedDevices.some((device) => device.state.startsWith('no permissions'))) {
      hints.push(
        'Linux USB permissions are blocking adb. On Ubuntu, install Android udev rules with `sudo apt-get install android-sdk-platform-tools-common`, run `sudo udevadm control --reload-rules`, then unplug and reconnect the phone. Ensure your user belongs to plugdev; after adding the group, log out and back in.',
      );
    }
    if (attachedDevices.some((device) => device.state === 'unauthorized')) {
      hints.push('Unlock the phone and accept the USB debugging authorization prompt.');
    }
    if (attachedDevices.some((device) => device.state === 'offline')) {
      hints.push('Reconnect the phone; if it stays offline, restart adb with `adb kill-server` and `adb start-server`.');
    }

    fail(
      unavailableStates
        ? [`No ready Android USB device found. Current adb devices: ${unavailableStates}.`, ...hints].join('\n')
        : 'No Android USB device detected. Connect a device, enable USB debugging, and confirm it appears in `adb devices`.',
    );
  }

  if (readyDevices.length > 1) {
    fail(
      `Multiple adb devices are connected (${readyDevices.map((device) => device.serial).join(', ')}). Disconnect extras or run adb reverse manually for the target device.`,
    );
  }

  return readyDevices;
}

function reversePort(port = BACKEND_PORT) {
  ensureAdbInstalled();
  const [device] = getConnectedDevices();
  const portMapping = `tcp:${port}`;

  const reverseResult = runAdbCommand(['reverse', portMapping, portMapping]);

  if (reverseResult.status !== 0) {
    fail(reverseResult.stderr.trim() || `Failed to run \`adb reverse ${portMapping} ${portMapping}\`.`);
  }

  console.log(
    `adb reverse is ready for backend port ${port} on device ${device.serial}. Android USB can use http://127.0.0.1:${port}.`,
  );
}

if (require.main === module) {
  try {
    reversePort();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown adb reverse error.';
    console.error(message);
    process.exit(1);
  }
}

module.exports = {
  reversePort,
};
