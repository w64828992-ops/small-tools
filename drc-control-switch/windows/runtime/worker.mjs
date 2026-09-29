import { MCPDevice } from './node_modules/@wonderwhy-er/desktop-commander/dist/remote-device/device.js';

console.debug = () => {};
const device = new MCPDevice();
let stopping = false;

process.on('message', async message => {
  if (message !== 'stop' || stopping) return;
  stopping = true;
  const timeout = setTimeout(() => process.exit(0), 7000);
  await device.shutdown();
  clearTimeout(timeout);
  process.exit(0);
});

setInterval(() => {
  if (process.connected) {
    process.send({
      online: !stopping && device.remoteChannel.isReachable(),
      deviceId: device.deviceId || ''
    });
  }
}, 1500);

await device.start();
