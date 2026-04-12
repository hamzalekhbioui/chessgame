import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    const token = localStorage.getItem('token');
    socket = io(window.location.origin, {
      auth: { token },
      autoConnect: false,
      transports: ['websocket', 'polling'],
      // Bypass ngrok's free-tier browser interstitial on polling fallback
      extraHeaders: {
        'ngrok-skip-browser-warning': 'true',
      },
    });

    socket.on('connect', () => {
      console.log('[SOCKET] connected:', socket?.id);
    });
    socket.on('connect_error', (err) => {
      console.error('[SOCKET] connect_error:', err.message);
    });
    socket.on('disconnect', (reason) => {
      console.log('[SOCKET] disconnected:', reason);
    });
  }
  return socket;
}

export function connectSocket() {
  const s = getSocket();
  if (!s.connected) {
    s.auth = { token: localStorage.getItem('token') };
    s.connect();
  }
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
