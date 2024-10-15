rpc.exports = {
  init(stage, params) {
    // console.log(JSON.stringify(params));
    if (!params.package_name) {
      console.error('package_name is required');
      return;
    }

    const package_name = params.package_name;
    const _before = params.hermes_before || '';
    const _main = params.hermes_hook || '';

    if (Java.available) {
      Java.perform(() => {
        const waitForClass = (className: string, callback: any) => {
          const interval = setInterval(() => {
            try {
              Java.use(className);
              clearInterval(interval);
              callback();
            } catch (e) {
              // Class not yet available, keep waiting
            }
          }, 10);
        };


        const hookJS = () => {
          try {
            // Write the script files to the device filesystem where the app can access it
            const before = new File(`/data/data/${package_name}/files/hermes-before-hook.js`, 'w');
            before.write(_before);
            before.close();

            const after = new File(`/data/data/${package_name}/files/hermes-hook.js`, 'w');
            after.write(_main);
            after.close();

            const func = Java.use('com.facebook.react.bridge.CatalystInstanceImpl').loadScriptFromAssets;

            func.implementation = function (assetManager: any, assetURL: string, z: boolean) {
              // Store for later I guess

              // Load up the script that will be executed before the RN bundle is loaded and executes
              this.loadScriptFromFile(`/data/data/${package_name}/files/hermes-before-hook.js`, `/data/data/${package_name}/files/hermes-before-hook.js`, z);
              console.log('[*] hermes_before was loaded!');

              // Load the actual RN bundle
              this.loadScriptFromAssets(assetManager, assetURL, z);

              // Load up the script that will be executed after the RN bundle is loaded and starts executing
              this.loadScriptFromFile(`/data/data/${package_name}/files/hermes-hook.js`, `/data/data/${package_name}/files/hermes-hook.js`, z);
              console.log('[*] hermes_hook was loaded!');
              send({ type: 'hermes_hook_loaded' });
            };
          } catch (e) {
            console.error(e);
          }
        };

        // We have to wait for SoLoader.init to be called before we can hook into the JS runtime.
        // There's a few overloads, so we have to hook into all of them and then call our hookJS function.
        waitForClass('com.facebook.soloader.SoLoader', () => {
          let SoLoader = Java.use('com.facebook.soloader.SoLoader');
          SoLoader.init.overload('android.content.Context', 'int').implementation = function (context: any, i: any) {
            this.init(context, i);
            hookJS();
          };
  
          SoLoader.init.overload('android.content.Context', 'int', 'com.facebook.soloader.SoFileLoader').implementation = function (context: any, i: any, soFileLoader: any) {
            this.init(context, i, soFileLoader);
            hookJS();
          };
  
          SoLoader.init.overload('android.content.Context', 'int', 'com.facebook.soloader.SoFileLoader', '[Ljava.lang.String;').implementation = function (context: any, i: any, soFileLoader: any, strArr: any) {
            this.init(context, i, soFileLoader, strArr);
            hookJS();
          };
  
          SoLoader.init.overload('android.content.Context', 'boolean').implementation = function (context: any, z: any) {
            this.init(context, z);
            hookJS();
          };
        });
      });
    }
  }
};