import { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HiOutlineHome, HiOutlineDocumentText, HiOutlineUserGroup,
  HiOutlineCog6Tooth, HiOutlineShieldCheck, HiOutlineArrowRightOnRectangle,
  HiOutlineBars3, HiOutlineXMark, HiOutlinePlus, HiOutlineMoon, HiOutlineSun,
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
  const [isDark, setIsDark] = useState(true);
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  // Aplicar tema al montar y cambiar estado
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

  // Cargar tema guardado
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    setIsDark(savedTheme === 'dark');
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  return (
    <div className="flex h-screen overflow-hidden bg-light-900 dark:bg-dark-900">
      {/* Sidebar */}
      <motion.aside
        animate={{ width: sidebarOpen ? 280 : 76 }}
        transition={{ duration: 0.3, ease: 'easeInOut' }}
        className="glass flex flex-col border-r border-gray-200/30 dark:border-white/5 z-20 relative"
      >
        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b border-gray-200/30 dark:border-white/5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center text-dark-900 font-bold text-sm shrink-0">
            GAD
          </div>
          <AnimatePresence>
            {sidebarOpen && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="overflow-hidden"
              >
                <p className="text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap">GAD Chunchi</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">Sistema Financiero</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {menuItems.map((item) => {
            // Filtrar items según rol
            if (item.path === '/configuracion' && user.rol !== 'admin') return null;
            if (item.path === '/auditoria' && !['admin', 'auditor'].includes(user.rol)) return null;
            if (item.path === '/ordenes-pago/nueva' && !['admin', 'financiero'].includes(user.rol)) return null;

            return (
              <NavLink
                key={item.path}
                to={item.path}
                end
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group ${
                    isActive
                      ? 'bg-blue-100 border border-blue-200 dark:bg-white/10 dark:border-white/10'
                      : 'hover:bg-gray-100 dark:hover:bg-white/5'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${item.color} flex items-center justify-center shrink-0 ${
                      isActive ? 'shadow-lg' : 'opacity-60 group-hover:opacity-100'
                    } transition-all`}>
                      <item.icon className="w-5 h-5 text-white" />
                    </div>
                    <AnimatePresence>
                      {sidebarOpen && (
                        <motion.span
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className={`text-sm whitespace-nowrap ${isActive ? 'text-gray-900 dark:text-white font-medium' : 'text-gray-600 dark:text-gray-400'}`}
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

        {/* User section */}
        <div className="p-3 border-t border-gray-200/30 dark:border-white/5">
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-sm font-bold shrink-0">
              {user.nombre?.charAt(0) || 'U'}
            </div>
            <AnimatePresence>
              {sidebarOpen && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900 dark:text-white truncate">{user.nombre || 'Usuario'}</p>
                  <p className="text-xs text-gray-600 dark:text-gray-400 capitalize">{user.rol || 'usuario'}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-3 py-2 rounded-xl text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-500/10 transition-all mt-1"
          >
            <HiOutlineArrowRightOnRectangle className="w-5 h-5 shrink-0 mx-2" />
            <AnimatePresence>
              {sidebarOpen && (
                <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-sm">
                  Cerrar Sesión
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        </div>
      </motion.aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden bg-light-900 dark:bg-dark-900 transition-colors duration-300">
        {/* Top bar */}
        <header className="glass h-16 flex items-center px-6 border-b border-gray-200/30 dark:border-white/5 shrink-0">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5 transition-colors mr-4"
          >
            {sidebarOpen ? <HiOutlineXMark className="w-5 h-5 text-gray-600 dark:text-gray-400" /> : <HiOutlineBars3 className="w-5 h-5 text-gray-600 dark:text-gray-400" />}
          </button>
          <div className="flex-1" />
          
          {/* Theme toggle */}
          <button
            onClick={() => setIsDark(!isDark)}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5 transition-colors mr-4"
            title={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          >
            {isDark ? (
              <HiOutlineSun className="w-5 h-5 text-yellow-400" />
            ) : (
              <HiOutlineMoon className="w-5 h-5 text-blue-500" />
            )}
          </button>

          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-xs text-gray-500 dark:text-gray-500">Conectado</span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            {children}
          </motion.div>
        </main>
      </div>
    </div>
  );
}
