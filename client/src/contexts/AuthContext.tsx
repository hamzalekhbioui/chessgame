import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { api } from '@/lib/api';
import { connectSocket, disconnectSocket } from '@/lib/socket';

interface User {
  id: string;
  username: string;
  email: string;
  rating: number;
  avatar_url: string | null;
  created_at: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<string | null>;
  register: (email: string, password: string, username: string) => Promise<string | null>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // On mount: restore session from the httpOnly cookie via /api/auth/me
  useEffect(() => {
    api.getMe().then((res: any) => {
      if (res.success && res.data) {
        setUser(res.data);
        connectSocket();
      }
      setLoading(false);
    });
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<string | null> => {
    const res: any = await api.login({ email, password });
    if (res.success && res.data) {
      setUser(res.data.user);
      connectSocket();
      return null;
    }
    return res.error || 'Login failed';
  }, []);

  const register = useCallback(async (email: string, password: string, username: string): Promise<string | null> => {
    const res: any = await api.register({ email, password, username });
    if (res.success && res.data) {
      setUser(res.data.user);
      connectSocket();
      return null;
    }
    return res.error || 'Registration failed';
  }, []);

  const logout = useCallback(async () => {
    await api.logout();
    setUser(null);
    disconnectSocket();
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
