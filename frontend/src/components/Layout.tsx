import { useState } from 'react';
import { NavLink, Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { ROLE_LABELS } from '../lib/rbac';
import { UserRole } from '@production-ops/shared';

const allLinks = [
  { to: '/', label: 'لوحة التحكم', end: true, roles: null as UserRole[] | null },
  { to: '/orders', label: 'الطلبات', roles: null },
  { to: '/master/factories', label: 'المصانع', roles: null },
  { to: '/master/printing', label: 'المطابع', roles: null },
  { to: '/master/fabric', label: 'موردو القماش', roles: null },
  { to: '/templates', label: 'قوالب الحقول', roles: [UserRole.ADMIN] },
  { to: '/reports', label: 'التقارير', roles: null },
  { to: '/settings', label: 'الإعدادات', roles: [UserRole.ADMIN] },
];

function useThemeDark() {
  const [dark, setDarkState] = useState(() => localStorage.getItem('theme') === 'dark');
  if (typeof document !== 'undefined') {
    document.documentElement.classList.toggle('dark', dark);
  }
  const setDark = (v: boolean) => {
    setDarkState(v);
    localStorage.setItem('theme', v ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', v);
  };
  return [dark, setDark] as const;
}

export default function Layout() {
  const { user, loading, logout } = useAuth();
  const [dark, setDark] = useThemeDark();

  if (loading) return <p className="text-sm text-zinc-500 p-6">جاري التحميل...</p>;
  if (!user) return <Navigate to="/login" replace />;

  const links = allLinks.filter((l) => !l.roles || l.roles.includes(user.role as UserRole));

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-20 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-sm font-semibold">منصة عمليات الإنتاج</h1>
            <p className="text-[10px] text-zinc-500">Production Operations Platform</p>
          </div>
          <div className="flex items-center gap-3 text-xs text-zinc-400">
            <span>{user.name}</span>
            <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">{ROLE_LABELS[user.role as UserRole]}</span>
            <button type="button" onClick={() => setDark(!dark)} className="px-2 py-1 rounded border border-zinc-700 hover:bg-zinc-900" title="تبديل المظهر">
              {dark ? '☀' : '☾'}
            </button>
            <button type="button" onClick={logout} className="px-2 py-1 rounded border border-zinc-700 hover:bg-zinc-900">
              خروج
            </button>
          </div>
        </div>
        <nav className="max-w-6xl mx-auto px-4 pb-2 flex flex-wrap gap-1">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-lg text-xs ${isActive ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-400 hover:text-zinc-200'}`
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
