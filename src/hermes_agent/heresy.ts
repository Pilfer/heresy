import {
  inspectElements,
  getTagName,
  findView
} from "./react-native-elements";
import {
  HermesRPCClient,
  HermesRPCMessage
} from './rpc'


export interface HeresyConfig {
  http: boolean;
  react_native_elements: boolean;
  rpc ? : string;
}

// Shamelessly stolen from RN source code
export interface XHRInterceptor {
  requestSent(id: number, url: string, method: string, headers: Object): void,
    responseReceived(id: number, url: string, status: number, headers: Object): void,
    dataReceived(id: number, data: string): void,
    loadingFinished(id: number, encodedDataLength: number): void,
    loadingFailed(id: number, error: string): void,
}


const getCircularReplacer = () => {
  const seen = new WeakSet();
  return (key: any, value: any) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return;
      }
      seen.add(value);
    }
    return value;
  };
};

export class Heresy {
  config: HeresyConfig;
  http_callback?: (req: any) => void
  on_view_found?: (view: any) => void
  gthis: any;

  constructor(conf: HeresyConfig | string) {
    if (typeof conf === 'string') {
      this.config = JSON.parse(conf);
    } else {
      this.config = conf;
    }

    this.gthis = globalThis;
    console.log('Heresy constructor was called');
  }

  init() {
    // Intercept HTTP requests for logging
    this.intercept_http();

    // Hook Map.set and allow for the inspection of React Native Elements
    this.hook_react_native_elements();

    if (this.config.rpc?.length) {
      const rpc = new HermesRPCClient(this.config.rpc);
      rpc.onMessage = (message: HermesRPCMessage) => {
        console.log(`[*] HermesRPCClient.onMessage: ${message.type} - ${message.payload}`);
        if (message.type === 'alert') {
          this.alert(message.payload);
        } else if (message.type === 'dump_this') {
          this.dump_this();
        } else if (message.type === 'dump_env') {
          this.dump_env();
        } else if (message.type === 'eval') {
          let eval_response = eval(`(() => { return ${message.payload}; })()`);
          rpc.send({
            type: 'eval_response',
            payload: eval_response,
          });
        }
      };
    }
  }

  alert(msg: string) {
    alert(msg);
  }

  dump_this() {
    Object.getOwnPropertyNames(this.gthis).forEach((prop) => {
      try {
        console.log(prop + ': ' + this.gthis[prop]);
      } catch (e) {
        console.log('Error: ' + prop + ': ' + e);
      }
    });
  }

  dump_env() {
    console.log(JSON.stringify(this.gthis.process));
  }

  enable_http() {
    this.config.http = true;
    console.log(`[*] HTTP logging is now ${this.config.http ? 'enabled' : 'disabled'}`);
  }

  intercept_http() {
    if (this.config.http) {
      var self = this;

      const originalSend = XMLHttpRequest.prototype.send;

      XMLHttpRequest.prototype.send = function (data) {
        this.onreadystatechange = () => {
          try {
            if (this.readyState === 4) {
              let out = {
                request: {
                  method: (this as any)._method,
                  url: (this as any)._url,
                  headers: (this as any)._headers,
                  data: data
                },
                response: {
                  status: this.status,
                  headers: (this as any).responseHeaders,
                  body: this.response,
                }
              }
              if (self.http_callback && typeof self.http_callback === 'function') {
                self.http_callback(out);
              }
            }
          } catch (error) {
            console.log(error)
          }
        };
        return originalSend.apply(this, arguments as any);
      }
    }
  }


  hook_react_native_elements() {
    return;

    if (this.config.react_native_elements) {
      let self = this;

      console.log('[*] Inspecting React Native Elements via Map.set hook');
      const originalMapSet = Map.prototype.set;
      Map.prototype.set = function (key, value) {
        try {
          console.log(JSON.stringify(value, getCircularReplacer(), 2))
          if (value && value.type) {
            // inspectElements(value);
            let view = findView(value);
            if (view) {
              if (self.on_view_found && typeof self.on_view_found === 'function') {
                self.on_view_found(view);
              }
            }
          }
        } catch (error) {
          //
        }
        return originalMapSet.call(this, key, value);
      };
    }
  }
}