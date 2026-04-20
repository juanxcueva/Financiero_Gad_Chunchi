import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HiOutlineBuildingLibrary,
  HiOutlinePlus,
  HiOutlinePencilSquare,
  HiOutlineTrash,
  HiOutlineXMark,
  HiOutlineArrowPath,
  HiOutlineCheckCircle,
} from 'react-icons/hi2';
import api from '../services/api';
import toast from 'react-hot-toast';

const formatNum = (v) => parseInt(v || 0).toLocaleString('es-EC');

export default function CuentasBC() {
  const [cuentas, setCuentas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | 'nuevo' | 'editar'
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
  const canManage = ['admin', 'financiero'].includes(currentUser?.rol);

  const fetchCuentas = async () => {
    try {
      const { data } = await api.get('/cuentas-bc');
      setCuentas(data.data || []);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error cargando cuentas BC');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCuentas(); }, []);

  const openNuevo = () => {
    setForm({ cuenta_bancaria: '', descripcion_cuenta: '', siguiente_numero_transfer: '1', activo: true });
    setModal('nuevo');
  };

  const openEditar = (c) => {
    setForm({
      id: c.id,
      cuenta_bancaria: c.cuenta_bancaria,
      descripcion_cuenta: c.descripcion_cuenta,
      siguiente_numero_transfer: String(c.siguiente_numero_transfer),
      activo: c.activo,
    });
    setModal('editar');
  };

  const handleSave = async () => {
    if (!form.cuenta_bancaria?.trim()) return toast.error('Ingrese el número de cuenta bancaria');
    if (!form.descripcion_cuenta?.trim()) return toast.error('Ingrese la descripción');
    if (!form.siguiente_numero_transfer || parseInt(form.siguiente_numero_transfer) < 1) {
      return toast.error('El siguiente número debe ser mayor a 0');
    }

    setSaving(true);
    try {
      if (modal === 'nuevo') {
        await api.post('/cuentas-bc', {
          cuenta_bancaria: form.cuenta_bancaria.trim(),
          descripcion_cuenta: form.descripcion_cuenta.trim(),
          siguiente_numero_transfer: parseInt(form.siguiente_numero_transfer),
        });
        toast.success('Cuenta BC creada correctamente');
      } else {
        await api.put(`/cuentas-bc/${form.id}`, {
          descripcion_cuenta: form.descripcion_cuenta.trim(),
          siguiente_numero_transfer: parseInt(form.siguiente_numero_transfer),
          activo: form.activo,
        });
        toast.success('Cuenta BC actualizada');
      }
      setModal(null);
      fetchCuentas();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error guardando cuenta BC');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (cuenta) => {
    if (!window.confirm(`¿Desactivar la cuenta ${cuenta.cuenta_bancaria} — ${cuenta.descripcion_cuenta}?`)) return;
    try {
      await api.delete(`/cuentas-bc/${cuenta.id}`);
      toast.success('Cuenta BC desactivada');
      fetchCuentas();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al desactivar');
    }
  };

  const activas = cuentas.filter(c => c.activo);
  const inactivas = cuentas.filter(c => !c.activo);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
              <HiOutlineBuildingLibrary className="w-7 h-7 text-cyan-400" />
              Cuentas BC
            </h1>
            <p className="text-gray-500 text-sm mt-1">
              Catálogo de cuentas del Banco Central — gestión de secuenciales de transferencia
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={fetchCuentas}
              className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 transition-colors text-gray-500"
              title="Recargar"
            >
              <HiOutlineArrowPath className="w-5 h-5" />
            </button>
            {canManage && (
              <button
                onClick={openNuevo}
                className="btn-primary text-sm flex items-center gap-2"
              >
                <HiOutlinePlus className="w-4 h-4" />
                Nueva Cuenta BC
              </button>
            )}
          </div>
        </div>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          className="glass rounded-2xl p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Total cuentas</p>
          <p className="text-3xl font-bold neon-text mt-1">{cuentas.length}</p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="glass rounded-2xl p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Activas</p>
          <p className="text-3xl font-bold text-green-400 mt-1">{activas.length}</p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          className="glass rounded-2xl p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Inactivas</p>
          <p className="text-3xl font-bold text-gray-400 mt-1">{inactivas.length}</p>
        </motion.div>
      </div>

      {/* Tabla */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
        className="glass rounded-2xl p-5">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="animate-spin w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200/70 dark:border-white/5">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Cuenta Bancaria
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Descripción
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Sig. N° Transfer
                  </th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Estado
                  </th>
                  {canManage && (
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Acciones
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                {cuentas.length === 0 ? (
                  <tr>
                    <td colSpan={canManage ? 5 : 4} className="text-center py-12 text-gray-400 text-sm">
                      No hay cuentas BC registradas
                    </td>
                  </tr>
                ) : (
                  cuentas.map((c) => (
                    <motion.tr
                      key={c.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className={`hover:bg-gray-50 dark:hover:bg-white/5 transition-colors ${!c.activo ? 'opacity-50' : ''}`}
                    >
                      <td className="px-4 py-3">
                        <p className="text-sm font-mono font-bold text-gray-900 dark:text-white">
                          {c.cuenta_bancaria}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm text-gray-700 dark:text-gray-300">{c.descripcion_cuenta}</p>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-mono font-semibold text-purple-400">
                          {formatNum(c.siguiente_numero_transfer)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium ${
                          c.activo
                            ? 'bg-green-500/15 text-green-500 dark:text-green-400'
                            : 'bg-gray-500/15 text-gray-500 dark:text-gray-400'
                        }`}>
                          {c.activo ? (
                            <><HiOutlineCheckCircle className="w-3.5 h-3.5" /> Activa</>
                          ) : 'Inactiva'}
                        </span>
                      </td>
                      {canManage && (
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => openEditar(c)}
                              className="p-1.5 hover:bg-cyan-500/10 rounded-lg text-cyan-400 transition-colors"
                              title="Editar"
                            >
                              <HiOutlinePencilSquare className="w-4 h-4" />
                            </button>
                            {c.activo && (
                              <button
                                onClick={() => handleDelete(c)}
                                className="p-1.5 hover:bg-red-500/10 rounded-lg text-red-400 transition-colors"
                                title="Desactivar"
                              >
                                <HiOutlineTrash className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </motion.tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      {/* Nota informativa */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
        className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs text-amber-600 dark:text-amber-400">
        <strong>Nota:</strong> El "Siguiente N° Transfer" mostrado es el valor más alto entre el secuencial guardado
        y el último número de cheque usado en órdenes de pago de esa cuenta + 1. Editarlo actualiza el secuencial
        directamente en el catálogo.
      </motion.div>

      {/* Modal */}
      <AnimatePresence>
        {modal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget) setModal(null); }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="glass neon-border rounded-2xl p-6 w-full max-w-md space-y-5 mx-4"
            >
              {/* Modal header */}
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <HiOutlineBuildingLibrary className="w-5 h-5 text-cyan-400" />
                  {modal === 'nuevo' ? 'Nueva Cuenta BC' : 'Editar Cuenta BC'}
                </h2>
                <button
                  onClick={() => setModal(null)}
                  className="p-1.5 hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg transition-colors"
                >
                  <HiOutlineXMark className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              {/* Fields */}
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                    Número de Cuenta Bancaria
                  </label>
                  <input
                    type="text"
                    value={form.cuenta_bancaria || ''}
                    onChange={(e) => setForm({ ...form, cuenta_bancaria: e.target.value })}
                    disabled={modal === 'editar'}
                    className="input-field disabled:opacity-60 disabled:cursor-not-allowed font-mono"
                    placeholder="Ej: 79220009"
                  />
                  {modal === 'editar' && (
                    <p className="text-xs text-gray-400 mt-1">El número de cuenta no puede modificarse</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                    Descripción
                  </label>
                  <input
                    type="text"
                    value={form.descripcion_cuenta || ''}
                    onChange={(e) => setForm({ ...form, descripcion_cuenta: e.target.value })}
                    className="input-field"
                    placeholder="Ej: TRANSFERENCIAS GENERALES"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                    Siguiente N° de Transferencia / Cheque
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={form.siguiente_numero_transfer || ''}
                    onChange={(e) => setForm({ ...form, siguiente_numero_transfer: e.target.value })}
                    className="input-field font-mono"
                    placeholder="1"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Número que se asignará a la próxima orden de pago de esta cuenta
                  </p>
                </div>

                {modal === 'editar' && (
                  <label className="flex items-center gap-3 cursor-pointer select-none">
                    <div className="relative">
                      <input
                        type="checkbox"
                        checked={!!form.activo}
                        onChange={(e) => setForm({ ...form, activo: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 rounded-full bg-gray-300 peer-checked:bg-cyan-400 transition-colors
                        after:content-[''] after:absolute after:top-0.5 after:left-0.5
                        after:h-5 after:w-5 after:rounded-full after:bg-white
                        after:transition-transform peer-checked:after:translate-x-5" />
                    </div>
                    <span className="text-sm text-gray-700 dark:text-gray-300">Cuenta activa</span>
                  </label>
                )}
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-2 border-t border-gray-200/70 dark:border-white/5">
                <button
                  onClick={() => setModal(null)}
                  className="btn-secondary text-sm"
                  disabled={saving}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSave}
                  className="btn-primary text-sm disabled:opacity-50"
                  disabled={saving}
                >
                  {saving ? 'Guardando...' : modal === 'nuevo' ? 'Crear Cuenta BC' : 'Guardar Cambios'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
