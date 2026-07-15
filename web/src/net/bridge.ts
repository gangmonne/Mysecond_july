/**
 * BridgeClient — server/bridge.ts(WebSocket 허브)로 Envelope 를 publish 한다.
 * UE(또는 mock 수신기)가 같은 허브를 subscribe 한다.
 * 브리지가 없어도 세션은 계속된다 — 조용히 재접속만 시도한다.
 */

export class BridgeClient {
  private ws?: WebSocket;
  private closed = false;
  private retryMs = 1000;

  constructor(
    private url: string = defaultUrl(),
    private onStatus?: (line: string) => void,
    private onState?: (up: boolean) => void,
  ) {}

  connect() {
    if (this.closed) return;
    try {
      this.ws = new WebSocket(this.url);
    } catch {
      this.scheduleRetry();
      return;
    }
    this.ws.onopen = () => {
      this.retryMs = 1000;
      this.onState?.(true);
      this.onStatus?.(`브리지 연결 — ${this.url}`);
    };
    this.ws.onclose = () => {
      this.onState?.(false);
      this.scheduleRetry();
    };
    this.ws.onerror = () => this.ws?.close();
  }

  private scheduleRetry() {
    if (this.closed) return;
    setTimeout(() => this.connect(), this.retryMs);
    this.retryMs = Math.min(this.retryMs * 2, 15000);
  }

  /** Envelope(Action|MirrorEvent) 또는 {kind:'gaze'} 를 허브로 보낸다 */
  publish(payload: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  dispose() {
    this.closed = true;
    this.ws?.close();
  }
}

function defaultUrl() {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}/ws`; // vite dev 프록시 → localhost:8787
}
