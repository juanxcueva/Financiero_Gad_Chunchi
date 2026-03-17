import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { HiOutlineFunnel } from 'react-icons/hi2';
import api from '../services/api';
import toast from 'react-hot-toast';

const ACCIONES_COLOR = {
  CREATE: 'text-green-400 bg-green-500/10',
  UPDATE: 'text-blue-400 bg-blue-500/10',
  DELETE: 'text-red-400 bg-red-500/10',
  ANULAR: 'text-orange-400 bg-orange-500/10',
  LOGIN: 'text-cyan-400 bg-cyan-500/10',
};

export default function Auditoria() {
  const [registros, setRegistros] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ tabla: '', accion: '', usuario_id: '', desde: '', hasta: '' });
  const limit = 25;

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = { page, limit };
      if (filters.tabla) params.tabla = filters.tabla;
      if (filters.accion) params.accion = filters.accion;
      if (filters.usuario_id) params.usuario_id = filters.usuario_id;
      if (filters.desde) params.desde = filters.desde;
      if (filters.hasta) params.hasta = filters.hasta;
      const { data } = await api.get('/auditoria', { params });
      setRegistros(data.data);
      setTotal(data.total);
    } catch { toast.error('Error cargando auditoría'); }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [page, filters]);

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Auditoría</h1>
        <p className="text-gray-500 text-sm">{total} registros de actividad</p>
      </motion.div>

      {/* Filters */}
      <div className="glass rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <HiOutlineFunnel className="w-4 h-4 text-cyan-400" />
          <p className="text-sm text-gray-600 dark:text-gray-400">Filtros</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <select
            value={filters.tabla}
            onChange={(e) => { setFilters({ ...filters, tabla: e.target.value }); setPage(1); }}
            className="input-field text-sm"
          >
            <option value="">Todas las tablas</option>
            <option value="ordenes_pago">Órdenes de Pago</option>
            <option value="beneficiarios">Beneficiarios</option>
            <option value="usuarios">Usuarios</option>
            <option value="configuracion">Configuración</option>
          </select>
          <select
            value={filters.accion}
            onChange={(e) => { setFilters({ ...filters, accion: e.target.value }); setPage(1); }}
            className="input-field text-sm"
          >
            <option value="">Todas las acciones</option>
            <option value="CREATE">CREATE</option>
            <option value="UPDATE">UPDATE</option>
            <option value="DELETE">DELETE</option>
            <option value="ANULAR">ANULAR</option>
            <option value="LOGIN">LOGIN</option>
          </select>
          <input
            type="date"
            value={filters.desde}
            onChange={(e) => { setFilters({ ...filters, desde: e.target.value }); setPage(1); }}
            className="input-field text-sm"
          />
          <input
            type="date"
            value={filters.hasta}
            onChange={(e) => { setFilters({ ...filters, hasta: e.target.value }); setPage(1); }}
            className="input-field text-sm"
          />
          <button
            onClick={() => { setFilters({ tabla: '', accion: '', usuario_id: '', desde: '', hasta: '' }); setPage(1); }}
            className="btn-secondary text-sm"
          >
            Limpiar
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="glass rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200/70 dark:border-white/5">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">Fecha</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">Usuario</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">Acción</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">Tabla</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">Descripción</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="py-12 text-center"><div className="animate-spin w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full mx-auto" /></td></tr>
              ) : registros.length === 0 ? (
                <tr><td colSpan={5} className="py-12 text-center text-gray-500">Sin registros</td></tr>
              ) : registros.map((r) => (
                <tr key={r.id} className="border-b border-gray-200/70 dark:border-white/5 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors">
                  <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400 font-mono whitespace-nowrap">
                    {new Date(r.created_at).toLocaleString('es-EC')}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">{r.usuario_nombre || `ID:${r.usuario_id}`}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ACCIONES_COLOR[r.accion] || 'text-gray-400 bg-gray-500/10'}`}>
                      {r.accion}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 font-mono">{r.tabla_afectada}/{r.registro_id || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 max-w-xs truncate">{r.descripcion}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-gray-200/70 dark:border-white/5">
            <p className="text-xs text-gray-500">Página {page} de {totalPages} — {total} registros</p>
            <div className="flex gap-1">
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1 text-xs rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 disabled:opacity-30">
                ← Anterior
              </button>
              <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)} className="px-3 py-1 text-xs rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 disabled:opacity-30">
                Siguiente →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
