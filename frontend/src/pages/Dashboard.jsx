import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { HiOutlineDocumentText, HiOutlineBanknotes, HiOutlineCalendarDays, HiOutlineChartBarSquare } from 'react-icons/hi2';
import api from '../services/api';

function StatCard({ icon: Icon, label, value, subtext, gradient, delay }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4 }}
      className="stat-card"
    >
      <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center mb-4`}>
        <Icon className="w-6 h-6 text-white" />
      </div>
      <p className="text-gray-600 dark:text-gray-400 text-sm">{label}</p>
      <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{value}</p>
      {subtext && <p className="text-xs text-gray-500 mt-1">{subtext}</p>}
    </motion.div>
  );
}

const formatMoney = (v) => new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' }).format(v || 0);

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  useEffect(() => {
    api.get('/ordenes-pago/estadisticas')
      .then(r => setStats(r.data.data))
      .catch(() => {});
  }, []);

  const chartData = stats?.pagos_mensuales?.map(m => ({
    mes: m.mes.substring(5),
    monto: parseFloat(m.monto),
    cantidad: parseInt(m.cantidad),
  })) || [];

  return (
    <div className="space-y-8">
      {/* Hero section */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-3xl glass p-8"
      >
        <div className="absolute top-0 right-0 w-64 h-64 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #00f0ff, transparent 70%)', transform: 'translate(30%, -30%)' }} />
        <h1 className="text-3xl font-bold">
          ¡Hola, <span className="bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">{user.nombre?.split(' ')[0] || 'Usuario'}</span>!
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">Panel de control del Sistema Financiero — GAD Municipal de Chunchi</p>
        <div className="flex gap-3 mt-6">
          <Link to="/ordenes-pago/nueva" className="btn-primary text-sm">
            + Nueva Orden de Pago
          </Link>
          <Link to="/ordenes-pago" className="btn-secondary text-sm">
            Ver Órdenes
          </Link>
        </div>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={HiOutlineDocumentText} label="Total Órdenes" value={stats?.total_ordenes || 0} gradient="from-cyan-400 to-blue-500" delay={0.1} />
        <StatCard icon={HiOutlineBanknotes} label="Pagado este Mes" value={formatMoney(stats?.mes_actual?.monto)} subtext={`${stats?.mes_actual?.cantidad || 0} órdenes`} gradient="from-purple-400 to-pink-500" delay={0.2} />
        <StatCard icon={HiOutlineCalendarDays} label="Pagado este Año" value={formatMoney(stats?.anio_actual?.monto)} subtext={`${stats?.anio_actual?.cantidad || 0} órdenes`} gradient="from-green-400 to-emerald-500" delay={0.3} />
        <StatCard icon={HiOutlineChartBarSquare} label="Órdenes Activas" value={stats?.ordenes_activas || 0} gradient="from-orange-400 to-amber-500" delay={0.4} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="lg:col-span-2 glass rounded-2xl p-6"
        >
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Pagos Mensuales — {new Date().getFullYear()}</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="mes" stroke="#666" fontSize={12} />
                <YAxis stroke="#666" fontSize={12} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(0,240,255,0.2)', borderRadius: 12 }}
                  labelStyle={{ color: '#fff' }}
                  formatter={(v) => [formatMoney(v), 'Monto']}
                />
                <Bar dataKey="monto" fill="url(#barGradient)" radius={[4, 4, 0, 0]} />
                <defs>
                  <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#00f0ff" />
                    <stop offset="100%" stopColor="#3b82f6" />
                  </linearGradient>
                </defs>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Recent orders */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="glass rounded-2xl p-6"
        >
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Últimas Órdenes</h3>
          <div className="space-y-3">
            {stats?.ultimas_ordenes?.map((o, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-gray-100/80 dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">N° {o.numero_orden}</p>
                  <p className="text-xs text-gray-500 truncate max-w-[150px]">{o.nombre_beneficiario}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold neon-text">{formatMoney(o.liquido_pagar)}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    o.situacion === 'ACTIVO' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                  }`}>
                    {o.situacion}
                  </span>
                </div>
              </div>
            ))}
            {(!stats?.ultimas_ordenes || stats.ultimas_ordenes.length === 0) && (
              <p className="text-sm text-gray-500 text-center py-4">No hay órdenes recientes</p>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
