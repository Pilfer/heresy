import { createInterface, Interface } from 'readline';
import { WebSocket, WebSocketServer } from 'ws';

export class HermesRPCServer {
  server: WebSocketServer;
  rl?: Interface;

  constructor(port: number, rl?: Interface) {
    if (rl) {
      this.rl = rl;
    }
    
    this.server = new WebSocket.Server({ port });
    this.server.on('connection', this._onConnection.bind(this));
    this.server.on('error', this._onError.bind(this));
  }

  waitForUserInput() {
    this?.rl?.question('', (answer: string) => {
      if (answer === 'exit') {
        this?.rl?.close();
      } else {
        this.broadcast(JSON.stringify({
          type: 'eval',
          payload: answer,
        }));

        this.waitForUserInput();
      }
    });
  }

  _onConnection(ws: WebSocket) {
    console.log('[*] Got connection from RN client!');
    console.log('[*] Waiting for user input - start typing whenever!');
    this.waitForUserInput();
    ws.on('message', this._onMessage.bind(this, ws));
  }

  _onMessage(ws: WebSocket, message: string) {
    try {
      let parsed = JSON.parse(message.toString());
      if (parsed.type === 'eval_response') {
        console.log(`[*] Eval response: ${parsed.payload}`);
      } else if (parsed.type === 'log') {
        console.log(message); // log to file later
      } else {
        console.log(`[*] Unhandled HermesRPCServer.onMessage: ${message}`);
      }
    } catch (error: any) {
      console.error(`[*] Error parsing message: ${error.message}`);
    }
  }

  _onError(error: Error) {
    console.log(`[*] HermesRPCServer.onError: ${error.message}`);
  }

  send(ws: WebSocket, message: string) {
    ws.send(message);
  }

  broadcast(message: string) {
    this.server.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }
}
