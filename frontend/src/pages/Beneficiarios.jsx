import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HiOutlinePlus, HiOutlinePencilSquare, HiOutlineTrash, HiOutlineMagnifyingGlass, HiOutlineXMark } from 'react-icons/hi2';
import api from '../services/api';
import toast from 'react-hot-toast';

export default function Beneficiarios() {
  const [beneficiarios, setBeneficiarios] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | 'nuevo' | 'editar'
  const [form, setForm] = useState({ nombre: '', ruc_cedula: '' });
  const [editId, setEditId] = useState(null);
  const limit = 20;

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/beneficiarios', {
        params: { page, limit, search: search || undefined },
      });
      setBeneficiarios(data.data);
      setTotal(data.total);
    } catch { toast.error('Error cargando beneficiarios'); }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [page, search]);

  const resetForm = () => setForm({ nombre: '', ruc_cedula: '' });

  const openNew = () => { resetForm(); setEditId(null); setModal('nuevo'); };

  const openEdit = (b) => {
    setForm({ nombre: b.nombre, ruc_cedula: b.ruc_cedula || '' });
    setEditId(b.id);
    setModal('editar');
  };

  const handleSave = async () => {
    if (!form.ruc_cedula.trim()) return toast.error('Ingrese cédula/RUC/pasaporte');
    if (!form.nombre.trim()) return toast.error('Ingrese nombres y apellidos');
    try {
      if (modal === 'nuevo') {
        await api.post('/beneficiarios', form);
        toast.success('Beneficiario creado');
      } else {
        await api.put(`/beneficiarios/${editId}`, form);
        toast.success('Beneficiario actualizado');
      }
      setModal(null);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al guardar');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar este beneficiario?')) return;
    try {
      await api.delete(`/beneficiarios/${id}`);
      toast.success('Eliminado');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al eliminar');
    }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Beneficiarios</h1>
          <p className="text-gray-500 text-sm">{total} registros</p>
        </div>
        <button onClick={openNew} className="btn-primary text-sm flex items-center gap-2">
          <HiOutlinePlus className="w-4 h-4" /> Nuevo Beneficiario
        </button>
      </motion.div>

      {/* Search */}
      <div className="glass rounded-2xl p-4">
        <div className="relative max-w-md">
          <HiOutlineMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="input-field pl-10"
            placeholder="Buscar por nombres o cédula/RUC/pasaporte..."
          />
        </div>
      </div>

      {/* Table */}
      <div className="glass rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200/70 dark:border-white/5">
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">Cédula / RUC / Pasaporte</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">Nombres y Apellidos</th>
                <th className="text-right px-6 py-3 text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={3} className="text-center py-12 text-gray-500"><div className="animate-spin w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full mx-auto" /></td></tr>
              ) : beneficiarios.length === 0 ? (
                <tr><td colSpan={3} className="text-center py-12 text-gray-500">Sin resultados</td></tr>
              ) : beneficiarios.map((b) => (
                <tr key={b.id} className="border-b border-gray-200/70 dark:border-white/5 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors">
                  <td className="px-6 py-3 text-sm text-gray-700 dark:text-gray-400 font-mono">{b.ruc_cedula || '—'}</td>
                  <td className="px-6 py-3 text-sm text-gray-900 dark:text-white">{b.nombre}</td>
                  <td className="px-6 py-3 text-right">
                    <button onClick={() => openEdit(b)} className="p-1.5 hover:bg-white/10 rounded-lg text-cyan-400"><HiOutlinePencilSquare className="w-4 h-4" /></button>
                    <button onClick={() => handleDelete(b.id)} className="p-1.5 hover:bg-red-500/10 rounded-lg text-red-400 ml-1"><HiOutlineTrash className="w-4 h-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-gray-200/70 dark:border-white/5">
            <p className="text-xs text-gray-500">Página {page} de {totalPages}</p>
            <div className="flex gap-1">
              {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => (
                <button key={i + 1} onClick={() => setPage(i + 1)} className={`px-3 py-1 text-xs rounded-lg transition-colors ${page === i + 1 ? 'bg-cyan-500/20 text-cyan-500 dark:text-cyan-400' : 'text-gray-600 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5'}`}>
                  {i + 1}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Modal */}
      <AnimatePresence>
        {modal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="glass neon-border rounded-2xl p-6 w-full max-w-lg space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{modal === 'nuevo' ? 'Nuevo Beneficiario' : 'Editar Beneficiario'}</h2>
                <button onClick={() => setModal(null)} className="p-1 hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg"><HiOutlineXMark className="w-5 h-5 text-gray-600 dark:text-gray-400" /></button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Cédula / RUC / Pasaporte *</label>
                  <input type="text" value={form.ruc_cedula} onChange={(e) => setForm({ ...form, ruc_cedula: e.target.value })} className="input-field" />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Nombres y Apellidos *</label>
                  <input type="text" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} className="input-field" />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => setModal(null)} className="btn-secondary text-sm">Cancelar</button>
                <button onClick={handleSave} className="btn-primary text-sm">{modal === 'nuevo' ? 'Crear' : 'Guardar'}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
