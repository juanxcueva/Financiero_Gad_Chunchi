import { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HiOutlineHome, HiOutlineDocumentText, HiOutlineUserGroup,
  HiOutlineCog6Tooth, HiOutlineShieldCheck, HiOutlineArrowRightOnRectangle,
  HiOutlineBars3, HiOutlinePlus, HiOutlineMoon, HiOutlineSun,
} from 'react-icons/hi2';

const menuItems = [
  { path: '/', label: 'Dashboard', icon: HiOutlineHome, color: 'from-cyan-400 to-blue-500' },
  { path: '/ordenes-pago', label: 'Órdenes de Pago', icon: HiOutlineDocumentText, color: 'from-purple-400 to-pink-500' },
  { path: '/ordenes-pago/nueva', label: 'Nueva Orden', icon: HiOutlinePlus, color: 'from-green-400 to-emerald-500' },
  { path: '/beneficiarios', label: 'Beneficiarios', icon: HiOutlineUserGroup, color: 'from-orange-400 to-amber-500' },
  { path: '/configuracion', label: 'Configuración', icon: HiOutlineCog6Tooth, color: 'from-blue-400 to-indigo-500' },
  { path: '/auditoria', label: 'Auditoría', icon: HiOutlineShieldCheck, color: 'from-red-400 to-rose-500' },
];

export default function Layout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('theme');
    return saved ? saved === 'dark' : true;
  });
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  useEffect(() => {
    const html = document.documentElement;
    if (isDark) {
      html.classList.remove('light');
      html.classList.add('dark');
    } else {
      html.classList.remove('dark');
      html.classList.add('light');
    }
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  return (
    /* ── Desktop background ── */
    <div className="flex h-screen overflow-hidden p-3 gap-3 bg-[#dde1ec] dark:bg-[#06060a] transition-colors duration-300">

      {/* ── Sidebar panel (floating card) ── */}
      <motion.aside
        animate={{ width: sidebarOpen ? 248 : 68 }}
        transition={{ duration: 0.3, ease: 'easeInOut' }}
        className="flex flex-col rounded-2xl overflow-hidden shrink-0 select-none
                   bg-[#f2f2f7] dark:bg-[#1c1c20]
                   shadow-[0_8px_32px_rgba(0,0,0,0.18)] dark:shadow-[0_8px_40px_rgba(0,0,0,0.55)]
                   ring-1 ring-black/[0.06] dark:ring-white/[0.06]"
      >
        {/* Logo / brand */}
        <div className="flex items-center gap-3 px-4 pt-5 pb-4">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center text-white font-bold text-[11px] tracking-wide shrink-0 shadow-md">
            GAD
          </div>
          <AnimatePresence>
            {sidebarOpen && (
              <motion.div
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.18 }}
                className="overflow-hidden"
              >
                <p className="text-[13px] font-semibold text-gray-900 dark:text-white whitespace-nowrap leading-tight">GAD Chunchi</p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 whitespace-nowrap">Sistema Financiero</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Nav items */}
        <nav className="flex-1 px-2 pb-2 space-y-0.5 overflow-y-auto">
          {menuItems.map((item) => {
            if (item.path === '/configuracion' && user.rol !== 'admin') return null;
            if (item.path === '/auditoria' && !['admin', 'auditor'].includes(user.rol)) return null;
            if (item.path === '/ordenes-pago/nueva' && !['admin', 'financiero'].includes(user.rol)) return null;

            return (
              <NavLink
                key={item.path}
                to={item.path}
                end
                className={({ isActive }) =>
                  `flex items-center gap-2.5 px-2.5 py-2 rounded-[11px] transition-all duration-150 group ${
                    isActive
                      ? /* active – white card on gray sidebar / dark pill on dark sidebar */
                        'bg-white dark:bg-white/[0.12] shadow-sm dark:shadow-none ring-1 ring-black/[0.07] dark:ring-white/[0.10]'
                      : 'hover:bg-black/[0.05] dark:hover:bg-white/[0.06]'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <div className={`w-8 h-8 rounded-[9px] bg-gradient-to-br ${item.color} flex items-center justify-center shrink-0
                      ${isActive ? 'shadow-md' : 'opacity-55 group-hover:opacity-90'} transition-all duration-150`}>
                      <item.icon className="w-[17px] h-[17px] text-white" />
                    </div>
                    <AnimatePresence>
                      {sidebarOpen && (
                        <motion.span
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.15 }}
                          className={`text-[13px] whitespace-nowrap font-medium ${
                            isActive
                              ? 'text-gray-900 dark:text-white'
                              : 'text-gray-600 dark:text-gray-400'
                          }`}
                        >
                          {item.label}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Divider */}
        <div className="mx-3 h-px bg-black/[0.08] dark:bg-white/[0.07]" />

        {/* User + actions */}
        <div className="px-2 py-3 space-y-0.5">
          {/* User row */}
          <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-[11px]">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-[13px] font-bold shrink-0 shadow-sm">
              {user.nombre?.charAt(0)?.toUpperCase() || 'U'}
            </div>
            <AnimatePresence>
              {sidebarOpen && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex-1 min-w-0"
                >
                  <p className="text-[12px] font-semibold text-gray-900 dark:text-white truncate leading-tight">{user.nombre || 'Usuario'}</p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 capitalize">{user.rol || 'usuario'}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Logout */}
          <button
            onClick={handleLogout}
            className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-[11px]
                       text-red-500 dark:text-red-400
                       hover:bg-red-500/10 dark:hover:bg-red-500/15
                       transition-all duration-150"
          >
            <div className="w-8 h-8 rounded-[9px] bg-red-100 dark:bg-red-500/20 flex items-center justify-center shrink-0">
              <HiOutlineArrowRightOnRectangle className="w-[17px] h-[17px] text-red-500 dark:text-red-400" />
            </div>
            <AnimatePresence>
              {sidebarOpen && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-[13px] font-medium"
                >
                  Cerrar Sesión
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        </div>
      </motion.aside>

      {/* ── Content panel (floating card) ── */}
      <div className="flex-1 flex flex-col overflow-hidden rounded-2xl
                      bg-[#ffffff] dark:bg-[#0e0e16]
                      shadow-[0_8px_32px_rgba(0,0,0,0.14)] dark:shadow-[0_8px_40px_rgba(0,0,0,0.50)]
                      ring-1 ring-black/[0.06] dark:ring-white/[0.06]
                      transition-colors duration-300">

        {/* Top bar */}
        <header className="h-12 flex items-center px-4 border-b border-black/[0.07] dark:border-white/[0.07] shrink-0
                           bg-[#f7f7fa] dark:bg-[#151520]">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 rounded-lg hover:bg-black/[0.07] dark:hover:bg-white/[0.08] transition-colors"
          >
            <HiOutlineBars3 className="w-[18px] h-[18px] text-gray-500 dark:text-gray-400" />
          </button>

          <div className="flex-1" />

          {/* Theme toggle */}
          <button
            onClick={() => setIsDark(!isDark)}
            title={isDark ? 'Modo claro' : 'Modo oscuro'}
            className="p-1.5 rounded-lg hover:bg-black/[0.07] dark:hover:bg-white/[0.08] transition-colors mr-2"
          >
            {isDark
              ? <HiOutlineSun className="w-[18px] h-[18px] text-yellow-400" />
              : <HiOutlineMoon className="w-[18px] h-[18px] text-blue-500" />
            }
          </button>

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-100 dark:bg-green-500/15 ring-1 ring-green-300/60 dark:ring-green-500/30">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            <span className="text-[11px] font-medium text-green-700 dark:text-green-400">Conectado</span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-5">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
          >
            {children}
          </motion.div>
        </main>
      </div>
    </div>
  );
}
