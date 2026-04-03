/**
 * WebSocket client with auto-reconnection and heartbeat.
 */
export class WebSocketClient {
    constructor(url) {
        this.url = url;
        this.ws = null;
        this.reconnectDelay = 1000;
        this.maxReconnectDelay = 30000;
        this.heartbeatInterval = null;
        this.shouldReconnect = true;

        // Callbacks — set by consumer
        this.onMessage = null;
        this.onConnect = null;
        this.onDisconnect = null;
        this.onError = null;
    }

    connect() {
        this.shouldReconnect = true;
        this._connect();
    }

    _connect() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) return;

        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
            console.log('[WS] Connected');
            this.reconnectDelay = 1000; // reset backoff
            this._startHeartbeat();
            this.onConnect?.();
        };

        this.ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                this.onMessage?.(msg);
            } catch (e) {
                console.warn('[WS] Non-JSON message:', event.data);
            }
        };

        this.ws.onclose = () => {
            console.log('[WS] Disconnected');
            this._stopHeartbeat();
            this.onDisconnect?.();
            this._scheduleReconnect();
        };

        this.ws.onerror = (err) => {
            console.error('[WS] Error:', err);
            this.onError?.(err);
        };
    }

    send(obj) {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(obj));
        }
    }

    disconnect() {
        this.shouldReconnect = false;
        this._stopHeartbeat();
        this.ws?.close();
    }

    get connected() {
        return this.ws?.readyState === WebSocket.OPEN;
    }

    _scheduleReconnect() {
        if (!this.shouldReconnect) return;
        console.log(`[WS] Reconnecting in ${this.reconnectDelay}ms...`);
        setTimeout(() => this._connect(), this.reconnectDelay);
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
    }

    _startHeartbeat() {
        this._stopHeartbeat();
        this.heartbeatInterval = setInterval(() => {
            this.send({ type: 'ping' });
        }, 30000);
    }

    _stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }
}
