import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(window.location.origin, {
      withCredentials: true, // send the httpOnly session cookie for auth
      autoConnect: false,
      transports: ['websocket', 'polling'],
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
    s.connect();
  }
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
