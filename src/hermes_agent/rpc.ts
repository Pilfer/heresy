
export interface HermesRPCMessage {
  type: string;
  payload: any;
}

export class HermesRPCClient {
  host: string;
  reconnect: boolean = true;
  ws?: WebSocket;

  onMessage?: (message: HermesRPCMessage) => void;
  onError?: (error: Event) => void;
  onClose?: (event: CloseEvent) => void;

  constructor(host: string, reconnect: boolean = true) {
    console.log('HermesRPCClient constructor');
    this.host = host;
    this.connect();
  }

  connect () {
    this.ws = new WebSocket(this.host);
    this.ws.onopen = this._onOpen.bind(this);
    this.ws.onmessage = this._onMessage.bind(this);
    this.ws.onerror = this._onError.bind(this);
    this.ws.onclose = this._onClose.bind(this);
  }

  _onOpen() {
    console.log(`[*] HermesRPCClient.onOpen: ${this.host}`);
  }

  _onMessage(event: MessageEvent) {
    const message = JSON.parse(event.data);
    
    console.log(`[*] HermesRPCClient.onMessage: ${message.type} - ${message.payload}`);

    if (this.onMessage && typeof this.onMessage === 'function') {
      this.onMessage(message);
    }
  }

  _onError(event: Event) {
    const error = (event as any).error || (event as any).message || 'Unknown error';

    console.log(`[*] HermesRPCClient.onError: ${error}`);

    if (this.onError && typeof this.onError === 'function') {
      this.onError(event);
    }
  }

  _onClose(event: CloseEvent) {
    if (this.reconnect) {
      console.log(`[*] HermesRPCClient.onClose: ${event.code} - ${event.reason}`);
      this.connect();
    }
    if (this.onClose && typeof this.onClose === 'function') {
      this.onClose(event);
    }
  }

  send(message: HermesRPCMessage) {
    this.ws?.send(JSON.stringify(message));
  }
}