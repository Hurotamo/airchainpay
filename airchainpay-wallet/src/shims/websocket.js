// WebSocket shim for React Native
// This provides WebSocket functionality that works in React Native environment

class WebSocketShim {
  constructor(url, protocols) {
    this.url = url;
    this.protocols = protocols;
    this.readyState = WebSocket.CONNECTING;
    this.onopen = null;
    this.onclose = null;
    this.onmessage = null;
    this.onerror = null;
    
    // Use React Native's built-in WebSocket
    this._ws = new WebSocket(url, protocols);
    
    // Forward events
    this._ws.onopen = (event) => {
      this.readyState = WebSocket.OPEN;
      if (this.onopen) this.onopen(event);
    };
    
    this._ws.onclose = (event) => {
      this.readyState = WebSocket.CLOSED;
      if (this.onclose) this.onclose(event);
    };
    
    this._ws.onmessage = (event) => {
      if (this.onmessage) this.onmessage(event);
    };
    
    this._ws.onerror = (event) => {
      this.readyState = WebSocket.CLOSED;
      if (this.onerror) this.onerror(event);
    };
  }
  
  send(data) {
    if (this._ws && this._ws.readyState === WebSocket.OPEN) {
      this._ws.send(data);
    }
  }
  
  close(code, reason) {
    if (this._ws) {
      this._ws.close(code, reason);
    }
  }
  
  addEventListener(type, listener) {
    if (this._ws) {
      this._ws.addEventListener(type, listener);
    }
  }
  
  removeEventListener(type, listener) {
    if (this._ws) {
      this._ws.removeEventListener(type, listener);
    }
  }
}

// Copy static properties
WebSocketShim.CONNECTING = WebSocket.CONNECTING;
WebSocketShim.OPEN = WebSocket.OPEN;
WebSocketShim.CLOSING = WebSocket.CLOSING;
WebSocketShim.CLOSED = WebSocket.CLOSED;

export default WebSocketShim; 