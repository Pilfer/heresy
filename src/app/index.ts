
import * as frida from 'frida';

import { loadConfig, readScripts } from './utils';
import { HermesRPCServer } from './hermes_rpc_server';
import { createInterface } from 'readline';

const run = async () => {
  console.log('[*] Starting Heresy...');

  const conf = loadConfig();
  const appScripts = readScripts(conf);


  const device = await frida.getUsbDevice();
  const pid = await device.spawn([conf.package_name]);
  const session = await device.attach(pid);


  const script = await session.createScript(appScripts.frida_agent);

  script.message.connect(msg => {
    if (msg.type === 'send') {
      if (msg.payload?.type === 'hermes_hook_loaded') {
        console.log('[*] Hermes hook was loaded successfully');
      }

    }
  });
  
  await script.load();
  
  // Initialize the frida agent with the requisite Heresy config
  script.exports.init('init', {
    package_name: conf.package_name,
    config: conf.heresy_config,
    hermes_before: appScripts.hermes_before,
    hermes_hook: [appScripts.heresy_core, appScripts.hermes_hook].join('\n'),
  });

  if (conf.heresy_config.rpc?.length) {
    var rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  
    rl.on('SIGINT', () => {
      process.exit();
    });

    const rpcServer = new HermesRPCServer(conf.rpc_port, rl);
    // rpcServer.broadcast('Heresy RPC Server is ready');
  }

  console.log('[*] Waiting 1s before resuming app...');
  setTimeout(async () => {
    await device.resume(pid);
  }, 1000);

};

run().catch((error) => {
  console.error(error);
});
