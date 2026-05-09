import type { ClientMessage, ServerMessage } from '../../../shared/messages';

export type MessageHandler = (msg: ServerMessage) => void;
export type StatusHandler = (status: 'connecting' | 'connected' | 'disconnected') => void;

export class GameSocket {
  private ws: WebSocket | null = null;
  private onMessage: MessageHandler;
  private onStatus: StatusHandler;

  constructor(onMessage: MessageHandler, onStatus: StatusHandler) {
    this.onMessage = onMessage;
    this.onStatus = onStatus;
  }

  connect(lobbyCode: string): void {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${location.host}/api/ws?code=${encodeURIComponent(lobbyCode)}`;
    this.connectWithUrl(url);
  }

  connectWithUrl(url: string): void {
    this.disconnect();
    this.onStatus('connecting');

    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.onStatus('connected');
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as ServerMessage;
        this.onMessage(msg);
      } catch {
        // ignore unparseable messages
      }
    };

    this.ws.onclose = () => {
      if (this.ws) {
        this.ws = null;
        this.onStatus('disconnected');
      }
    };

    this.ws.onerror = () => {
      // onclose will fire after onerror, so let onclose handle status
    };
  }

  send(msg: ClientMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
