import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { api, getToken, getUser, setAuth, clearAuth } from '../lib/api';
import type { AuthUser } from '../lib/rbac';
import { UserRole } from '@production-ops/shared';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  refresh: async () => {},
  logout: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const me = await api<AuthUser>('/auth/me');
      setUser(me);
      setAuth(getToken()!, me);
    } catch {
      clearAuth();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const cached = getUser();
    if (cached) setUser(cached as AuthUser);
    refresh();
  }, [refresh]);

  const logout = () => {
    clearAuth();
    setUser(null);
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{ user, loading, refresh, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export function RequireRole({
  roles,
  children,
}: {
  roles: UserRole[];
  children: ReactNode;
}) {
  const { user, loading } = useAuth();
  if (loading) return <p className="text-sm text-zinc-500">جاري التحميل...</p>;
  if (!user || !roles.includes(user.role as UserRole)) {
    return <p className="text-sm text-red-400">صلاحيات غير كافية للوصول لهذه الصفحة</p>;
  }
  return children;
}
