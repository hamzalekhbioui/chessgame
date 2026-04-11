import { useEffect, useRef } from 'react';
import { getSocket } from '@/lib/socket';
import type { Socket } from 'socket.io-client';

export function useSocket() {
  const socketRef = useRef<Socket>(getSocket());
  return socketRef.current;
}

export function useSocketEvent<T = unknown>(event: string, handler: (data: T) => void) {
  const socket = useSocket();

  useEffect(() => {
    socket.on(event, handler as any);
    return () => {
      socket.off(event, handler as any);
    };
  }, [socket, event, handler]);
}
