# Hooking React (JavaScript) Internals  

With `heresy`, you can utilize the `./.heresy/_before.js` script to set up hooks on internal React objects via `Proxy` and `Reflect`.  


The `./.heresy/_before.js` file gets loaded into the runtime *before* the application bundle. The bundle is what sets up all of the modules and dependencies, so if you want to modify core functionality at runtime, you'll probably need to hook these as they're instantiated.  


I started playing with this method, and ended up having a decent amount of success.  

The [Metro bundler](https://github.com/facebook/metro/blob/282e00a8caa5b6988137d68f647ad1d96c3936ca/packages/metro-runtime/src/polyfills/require.js#L83) is used for packaging up the App JS/TS, apply polyfills, etc. It's also used a runtime for handling imports and module definitions, so it's probably the best place to start intercepting functions.  



Create the base object:  

```js
/**
 * Hermes doesn't support ES6 Classes, so we have to use a function to create an object and then
 * prototype functions to it. Annoying, but hey... it works.
 * 
 * This object is a utility used to hook primitives as well as some React functionality.
 */
function HookUtil() {
  // logging util 
  this.console_available = false;
  this.logs = [];

  // hook storage
  this.hooks = {};
  this.module_hooks = {};

  // React storage
  this.react_handler = null;
  this.appRegistry = null;
  this.components = []; // Stores components here when they're created

  // Callback for when a component is registered
  this.onComponentRegistered = null;

  // Callback for when a component is constructed - this lets you modify props before the component is rendered for the first time
  this.onComponentCreated = null;

  // Used in an inner function - stored here in case we hook defineProperty later.
  this.originalDefineProperty = Object.defineProperty;
}
```

Add some utility functions for logging  

```js
// Log wrapper - console.log isn't available by default until the ReactNative logging bridge
// is instantiated, so we push logs into an array until the logging functionality
// is available and ready to use.
HookUtil.prototype.log = function (obj) {
  if (this.console_available) {
    console.log(obj);
    return;
  }
  this.logs.push({
    ts: new Date().getTime(),
    data: obj,
  });
};

// Set the console_available to true and flush logs
HookUtil.prototype.set_console_available = function () {
  this.console_available = true;
  console.log('console.log should be available now!');
  this.logs.forEach((log, idx) => {
    console.log(log);
    this.logs.splice(idx, 1);
  });
};

// Helper function for printing code locations. 
// This is _super_ useful for finding virtual offsets of specific functions in
// the hermes bytecode.
HookUtil.prototype.stacktrace = function () {
  try {
    throw new Error('stacktrace');
  } catch (e) {
    return e.stack;
  }
};
```

Sprinkle in some primitive hooking functionality

```js
// Helper function to hook an Object's method using Proxy
HookUtil.prototype.hook = function (obj, method_name, hook_fn) {
  const self = this;
  try {
    if (this.hooks[obj] === undefined) {
      this.hooks[obj] = {};
    }

    if (this.hooks[obj][method_name] === undefined) {
      const originalMethod = obj[method_name];
      const handler = {
        apply: function (target, thisArg, argumentsList) {
          return hook_fn({
            args: argumentsList,
            cb: originalMethod.bind(thisArg)
          });
        }
      };

      this.hooks[obj][method_name] = {
        original: originalMethod,
        proxy: new Proxy(originalMethod, handler)
      };

      obj[method_name] = this.hooks[obj][method_name].proxy;
    }

    if (this.console_available) {
      self.log(`[*] Hooked ${obj}.${method_name}`);
    }
  } catch (error) {
    self.log(error);
    console.error(error);
  }
};

// Same as above, but direct method overrides
HookUtil.prototype.hook_direct = function (obj, method_name, hook_fn) {
  const self = this;
  try {

    if (this.hooks[obj] === undefined) {
      this.hooks[obj] = {};
      if (this.hooks[obj][method_name] === undefined) {
        this.hooks[obj][method_name] = {
          original: obj[method_name],
          hook: function () {
            return hook_fn({
              args: arguments,
              cb: this.hooks[obj][method_name].original
            });
          },
        };
      }
    }

    obj[method_name] = this.hooks[obj][method_name].hook;

    if (this.console_available) {
      self.log(`[*] Hooked ${obj}.${method_name}`);
    }
  } catch (error) {
    self.log(error);
    console.error(error)
  }
};

// Add the ability to undo hooks if necessary - it's assumed that you'll
// probably call this in _hook.js to clean up
HookUtil.prototype.unhook = function (obj, method_name) {
  if (this.hooks[obj] !== undefined && this.hooks[obj][method_name] !== undefined) {
    if (this.hooks[obj][method_name].original !== undefined) {
      this.log(`[*] Unhooked ${obj}.${method_name}`);
      obj[method_name] = this.hooks[obj][method_name].original;
      return;
    }
  }
};
```

Hooking the "require" and "define" functions (`__r` and `__d`) that Metro produces.

```js
HookUtil.prototype.hook_require_and_define = function () {
  const self = this;
  const originalDefineProperty = Object.defineProperty;

  (function (self) {
    const globalProxy = new Proxy(globalThis, {
      set(target, prop, value) {

        if (prop === '__d' && typeof value === 'function') {
          self.log('[*] Setting up __d (define) hook');

          const define_hook = function (...args) {
            // self.log(`[*] Intercepted __d (define) call`);

            // These are the arguments passed to the define() function
            // We're using names here to avoid confusion down the line.
            let real_args = {
              factory: args[0], // The module factory function
              moduleId: args[1] ? args[1] : null, // The module ID (integer)
              dependencyMap: args[2] ? args[2] : null, // The module dependency map
              verboseName: args[3] ? args[3] : null,
              inverseDependencies: args[4] ? args[4] : null,
            };

            let originalFactory = args[0];
            let hooked_factory = function (...factory_args) {
              // self.log(`[*] Intercepted define() call for module ${real_args.moduleId} (argument length: ${arguments.length})`);

              let factory_result = originalFactory.apply(this, factory_args);

              // Since we're trying to be helpful, let's try to find some useful stuff
              // and expose it to the user via this class.
              // - AppRegistry instance (this is usually globalized, but we want to get it before it starts registering components)
              // - React instance (.createElement(...), etc)
              for (let i = 0; i < factory_args.length; i++) {
                if (factory_args[i] && typeof factory_args[i] === 'object') {
                  let arg_keys = Object.keys(factory_args[i]);

                  // Check to see if createElement is present - if it is, we know that
                  // we're dealing with the React instance and can store it for later use.
                  if (arg_keys.includes('createElement')) {
                    self.log(`[*] Found React instance: ${factory_args[i]}`);
                    self.react_handler = factory_args[i];
                  }

                  // Sometimes it's AppRegistry, others RN$AppRegistry etc
                  let appRegistryKey = arg_keys.find((key) => key.includes('AppRegistry'));

                  // self.log(`[*] Found AppRegistry instance: ${appRegistryKey}`);
                  if (appRegistryKey !== undefined) {
                    // self.log(`[*] Found AppRegistry instance: ${factory_args[i]}`);
                    self.appRegistry = factory_args[i][appRegistryKey];

                    /**
                     * We can also hook into the registerComponent() function to intercept
                     * component registration. This is useful for tracking which components
                     * are registered and when.
                     * 
                     * The real useful bit here is being able to intercept the component
                     * and modify it before it gets rendered. You can change the props,
                     * explicitly defined onPress/onTextChange/etc functions, etc. The
                     * component should also have a render() function that you can hook.
                     */
                    let originalRegisterComponent = factory_args[i][appRegistryKey].registerComponent;
                    const hookedRegisterComponent = function (...register_args) {
                      // self.log(`[*] Intercepted registerComponent() call: ${register_args}`);

                      let component_name = register_args[0]; // The name of the component - can be null/undefined
                      let component = register_args[1]; // This is the component constructor (a Function)
                      // self.log(`[*] Intercepted registerComponent() call: ${component_name}`);
                      
                      // Make a copy of the original, just in case.
                      let originalComponent = component;
                      
                      // self.log(`typeof original_component: ${typeof original_component}`);

                      const hooked_component_func = function () {
                        // self.log(`[*] Intercepted component constructor call`);
                        let real = originalComponent()

                        let hooked_real = function (...real_args) {
                          // self.log('hooked_real called')


                          // give us a reference to them in case we want to do any other cool stuff
                          if (!self.components.includes(c)) {
                            self.components.push(c);
                          }

                          // Allow us to modify this component in place
                          if (self.onComponentCreated && typeof self.onComponentCreated === 'function') {
                            self.log('[*] Calling onRegisterComponent callback');
                            return self.onComponentCreated({
                              args: real_args,
                              init: real
                            });
                          }

                          let c = real(...real_args);

                          return c;
                        }


                        return hooked_real;
                      };

                      // Set the hooked component
                      register_args[1] = hooked_component_func;
                      // self.log(register_args)

                      // Return the original func after we've replaced what we needed
                      return originalRegisterComponent(...register_args)
                    }; // end hookedRegisterComponent func

                    // Set our hooked registerComponent function so it gets called
                    factory_args[i][appRegistryKey].registerComponent = hookedRegisterComponent;
                  }
                }
              } // end for


              return factory_result
            }

            args[0] = hooked_factory;
            let define_result = value.apply(this, args);
            return define_result;
          };

          originalDefineProperty(target, prop, {
            value: define_hook,
            writable: true,
            configurable: true,
            enumerable: true
          });

          return true;
        } else if (prop === '__r' && typeof value === 'function') {
          self.log('[*] Setting up __r (require) hook');

          const require_hook = function (...args) {
            // self.set_console_available();
            globalThis.hook.log(`[*] Intercepted __r (require) call`);
            let res = value.apply(this, args);
            for (let i = 0; i < args.length; i++) {
              self.log(JSON.stringify({
                title: '__r called',
                i,
                type: typeof args[i],
                value: args[i]
              }));
            }
            return res;
          };

          originalDefineProperty(target, prop, {
            value: require_hook,
            writable: true,
            configurable: true,
            enumerable: true
          });

          return true;
        }

        return Reflect.set(target, prop, value);
      }
    });

    // Define the `__r` (metro require() polyfill) and `__d` (define()) functions
    Object.defineProperty(globalThis, '__r', {
      configurable: true,
      enumerable: true,
      get() {
        return globalProxy.__r;
      },
      set(value) {
        Reflect.set(globalProxy, '__r', value);
      }
    });

    Object.defineProperty(globalThis, '__d', {
      configurable: true,
      enumerable: true,
      get() {
        return globalProxy.__d;
      },
      set(value) {
        Reflect.set(globalProxy, '__d', value);
      }
    });
  })(self);
};
```

Now that we have that in place, we can start actually using `HookUtil`.

```js
// Example kitchen sink function to iterate over elements and 
// their children to modify props, etc. I used this mostly for logging and
// as a sort of playground. The argument `c` is just a component reference.
const recurse = (c) => {
  if (!typeof c === 'object') {
    return;
  }
  let name = c?.type?.name || c?.type?.displayName || 'unknown';


  // Print out the type of the component/children. View, Section, StatusBar, etc.
  // console.log('Type name:', name)

  if (name === 'unknown') {
    console.log('unknown type:', c)
  }

  if (c.props) {
    if (!c.props.style) {
      c.props.style = {
        color: 'black'
      }
    }
    let wrote = false;
    if (c.props.backgroundColor) {
      c.props.backgroundColor = 'red'
      c.props.color = 'red'
      wrote = true;
    }
    if (c.props.style) {
      c.props.style.backgroundColor = 'red'
      c.props.style.color = 'green'
      wrote = true;
    }

    if (!wrote) {
      console.log('no background color for this component:', c)
    }

    if (c.props.children && c.props.children.length > 0 && ['object', 'array'].includes(typeof c.props.children)) {
      c.props.children.forEach(child => {
        recurse(child)
      });

    } else {
      if (typeof c.props.children === 'string') {
        if (c.props.children.startsWith('Modified:')) {
          return;
        }
        c.props.children = 'Modified: ' + c.props.children;
      }
    }

    if (c.props.title) {
      if (!c.props.title.startsWith('Modified:')) {
        c.props.title = 'Modified: ' + c.props.title;
      }

    }
  }
}
```

Main entrypoint

```js
/**
 * This is an example for how to use HookUtil to modify the React components before they're rendered.
 * Take a look at `hook_require_and_define` to see how we hook into the `__r` and `__d` functions,
 * which are used by the Metro bundler to require and define modules.
 */
const setup = () => {
  const hook = new HookUtil();

  // This function, if defined, is called whenever a new component
  // gets created. Since we hooked AppRegistry.registerComponent, we were
  // able to also access the constructors of each component and hook those
  // as well. The end result is every component (as far as I can tell) gets
  // passed through this function for you to modify, instantiate, and return.
  //
  // In all my testing, by the time the app got to this point, console.* was
  // available, so we can use that instead of hook.log(...).
  //
  hook.onComponentCreated = function (c) {
    let args = c.args; // Arguments passed to the component
    let init = c.init; // The original component constructor - ie: function Button(...args)
    let component = init(...args);

    try {
      // Example call to `recurse` here to do batch updates on all children.
      // recurse(component);

      // Check if we have a View
      if (component?.type?.displayName === 'View') {
        if (!component || component.props === undefined) return;

        // Set up references to children of View
        let StatusBar = component.props.children[0];
        let ScrollView = component.props.children[1];
        let Header = ScrollView.props.children[0];
        let View = ScrollView.props.children[1];
        let targetButton = View.props.children[0]; // This is the button we want to modify
        let TextInput = View.props.children[1];


        /**
         * You can hooker the renderer function here to modify the component before it gets rendered.
         * This is useful for modifying props, adding custom functions, etc.
         */
        let originalViewRender = View.type.render;
        View.type.render = function () {
          // console.log('Hooked the render call!', arguments);

          if (arguments[0].children && arguments[0].children.length) {
            let first = arguments[0].children[0];
            if (first !== undefined && first._owner !== null && first._owner !== undefined) {
              if (first._owner.stateNode !== undefined && first._owner.stateNode !== null) {
                let owner = first._owner.stateNode;

                // Do a console.log here to see what kind of goodies you're working with
                // console.log(owner);

                // You can likely access to the owner of the component here
                // This is the stuff that gets passed to the Fiber renderer AFAIK.
                // Calling the following function _in this location_ will cause a crash.
                // It gets recursively called, so.. rip.
                // owner.updater.enqueueForceUpdate(owner);
              }
            }
          }

          // Call the original View.render() function
          let result = originalViewRender.apply(this, arguments);

          return result;
        }

        // Set the status bar background color to pink
        StatusBar.props.backgroundColor = 'pink'

        // Set the button text to a custom string
        targetButton.props.title = `It is ${new Date().toLocaleTimeString()} - click me!`

        // Set the background color of the view to red
        View.props.backgroundColor = '#ff0000'


        /*
        * We can hook the onPress events for specific elements
        */
        if (targetButton && targetButton.props && !targetButton.props.hooked) {

          // console.log(targetButton)

          // Make a backup of the original function so we can call it later
          targetButton.props.onPressOriginal = targetButton.props.onPress;

          // Assign the new event
          targetButton.props.onPress = function (...args) {
            // Do some logging to demonstrate the functionality change
            console.log('Hooked the onPress call!');

            // Drop an alert because we're cool like that
            alert('Hooked the onPress call!');

            try {
              // Let's see what else we have going on here
              console.log(targetButton);
              console.log(Object.keys(targetButton));
              console.log(Object.getOwnPropertyNames(targetButton));
              console.log(Object.getOwnPropertyDescriptors(targetButton));
              targetButton.props.onPressOriginal.apply(this, args);
            } catch (error) {
              console.log(error);
              console.log(error.stack)
            }
          };

          // Set a hooked toggle so we know not to apply our hooks again.
          // onComponentCreated gets called multiple times with the same 
          // components, so this is necessary.
          targetButton.props.hooked = true;

          // Assign the targetButton value to the original location - may not
          // be required, but this runtime is weird so we're not taking any 
          // chances lol.
          component.props.children[1].props.children[1].props.children[0] = targetButton;
        } else {
          // we've already hooked this component, so we can ignore it.
        }

      }
    } catch (error) {
      console.log(error)
      console.log(error.stack)
    }

    // Return the component back. This is absolutely required.
    return component;
  };



  // Modify the JSON object before it gets stringified
  // In this example, we add `custom_json_key: { foo: 'bar' }` to the object.
  // Everywhere that JSON.stringify is called, this will be added.
  // You can do the same thing with JSON.parse, or any other function.
  hook.hook(JSON, 'stringify', function (c) {
    c.args[0].custom_json_key = {
      foo: 'bar'
    };
    let result = c.cb(...c.args);
    // ...do something with the result before returning it
    return result;
  });


  /* 
    // Hooking some functions, like this one, may end up breaking this script.
    // We use Object.defineProperty elsewhere, and my hooking logic is not perfect.
    hook.hook(Object, 'defineProperty', function(c) {
      // Print the property being defined
      hook.log(`Intercepted Object.defineProperty() call: ${c.args[1]}`);
      let result = c.cb(...c.args);
      // ...do something with the result before returning it
      return result;
    });
   */


  // Call our function to enable hooking __r and __r, which gives us component access.
  hook.hook_require_and_define();

  // Make the handle accessible to _hook.js
  globalThis.hook = hook;
}

try {
  setup();
} catch (error) {
  throw error;
}
```