import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HiOutlineCog6Tooth, HiOutlinePlus, HiOutlinePencilSquare, HiOutlineTrash, HiOutlineXMark, HiOutlineUserGroup, HiOutlineReceiptPercent, HiOutlineUsers, HiOutlineArrowUpTray } from 'react-icons/hi2';
import api from '../services/api';
import toast from 'react-hot-toast';

function Section({ icon: Icon, title, children }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-2xl p-6 space-y-4">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-3">
        <Icon className="w-5 h-5 text-cyan-400" /> {title}
      </h2>
      {children}
    </motion.div>
  );
}

export default function Configuracion() {
  const [config, setConfig] = useState({});
  const [ivaInput, setIvaInput] = useState('15');
  const [institucionInput, setInstitucionInput] = useState('');
  const [permitirEditarCheque, setPermitirEditarCheque] = useState(false);
  const [firmantes, setFirmantes] = useState([]);
  const [retenciones, setRetenciones] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [modal, setModal] = useState(null);
  const [modalType, setModalType] = useState('');
  const [form, setForm] = useState({});
  const [accessFile, setAccessFile] = useState(null);
  const [uploadingAccess, setUploadingAccess] = useState(false);
  const [migrationState, setMigrationState] = useState({ current: null, last: null });
  const [backupLoading, setBackupLoading] = useState(false);
  const [restoreFile, setRestoreFile] = useState(null);
  const [restoreing, setRestoring] = useState(false);
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');

  const fetchAll = async () => {
    try {
      const requests = [
        api.get('/configuracion'),
        api.get('/configuracion/firmantes'),
        api.get('/configuracion/retenciones-catalogo'),
      ];

      if (currentUser.rol === 'admin') {
        requests.push(api.get('/auth/usuarios'));
      }

      const [cfgRes, fRes, rRes, uRes] = await Promise.all(requests);
      const cfg = cfgRes.data.data || {};
      setConfig(cfg);
      setIvaInput(String(cfg.iva_porcentaje ?? 15));
      setInstitucionInput(String(cfg.institucion_nombre || cfg.institucion || ''));
      setPermitirEditarCheque(['1', 'true', 'si', 'sí', 'yes'].includes(String(cfg.permitir_editar_cheque || '').toLowerCase()));
      setFirmantes(fRes.data.data);
      setRetenciones(rRes.data.data);
      if (uRes?.data?.data) {
        setUsuarios(uRes.data.data);
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error cargando configuración');
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const fetchMigrationStatus = async () => {
    if (currentUser.rol !== 'admin') return;
    try {
      const { data } = await api.get('/migracion/access/status');
      setMigrationState(data.data || { current: null, last: null });
    } catch {
      // silencioso: no bloquear pantalla de configuración por estado de migración
    }
  };

  useEffect(() => {
    fetchMigrationStatus();
    const timer = setInterval(fetchMigrationStatus, 5000);
    return () => clearInterval(timer);
  }, []);

  const uploadAccessAndMigrate = async () => {
    if (!accessFile) return toast.error('Seleccione un archivo .mdb o .accdb');

    const formData = new FormData();
    formData.append('accessFile', accessFile);

    setUploadingAccess(true);
    try {
      await api.post('/migracion/access/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success('Archivo subido, migración iniciada en segundo plano');
      setAccessFile(null);
      fetchMigrationStatus();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error iniciando migración');
    } finally {
      setUploadingAccess(false);
    }
  };

  const downloadBackup = async () => {
    setBackupLoading(true);
    try {
      const response = await api.get('/configuracion/backup', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      const filename = response.headers['content-disposition']?.split('filename=')[1]?.replace(/"/g, '') || 'backup.sql';
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success('Backup descargado correctamente');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error descargando backup');
    } finally {
      setBackupLoading(false);
    }
  };

  const restoreDatabase = async () => {
    if (!restoreFile) return toast.error('Seleccione un archivo SQL');
    
    // Confirmación explícita
    const confirmed = window.confirm(
      '⚠️ ADVERTENCIA: Esto eliminará todos los datos actuales y los reemplazará con los del respaldo.\n\n¿Está seguro de que desea continuar?'
    );
    if (!confirmed) return;
    
    const formData = new FormData();
    formData.append('backupFile', restoreFile);
    
    setRestoring(true);
    try {
      const response = await api.post('/configuracion/restore', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success(response.data.message || 'Base de datos restaurada correctamente');
      setRestoreFile(null);
      
      // Recargar después de 2 segundos para que los datos se sincronicen
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Error restaurando la base de datos';
      toast.error(errorMsg);
      console.error('Restore error:', err.response?.data);
    } finally {
      setRestoring(false);
    }
  };

  const currentOrLastMigration = migrationState.current || migrationState.last;
  const progress = currentOrLastMigration?.progress;
  const progressPercent = Math.max(0, Math.min(100, progress?.percent || 0));
  const stageLabel = {
    queued: 'En cola',
    running: 'Iniciando',
    reading_csv: 'Leyendo CSV',
    leyendo_csv: 'Leyendo CSV',
    migrating: 'Migrando registros',
    migrando: 'Migrando registros',
    completed: 'Completado',
    error: 'Error',
  }[progress?.stage] || (progress?.stage || 'Sin estado');

  // Config save
  const saveConfig = async (key, value) => {
    try {
      await api.put('/configuracion', { clave: key, valor: String(value) });
      toast.success('Configuración actualizada');
      fetchAll();
    } catch { toast.error('Error al guardar'); }
  };

  const saveToggleCheque = async (checked) => {
    setPermitirEditarCheque(checked);
    await saveConfig('permitir_editar_cheque', checked ? '1' : '0');
  };

  // Firmantes CRUD
  const openFirmante = (f = null) => {
    setModalType('firmante');
    setForm(f ? { ...f } : { cargo: '', nombre: '', activo: true });
    setModal(f ? 'editar' : 'nuevo');
  };

  const saveFirmante = async () => {
    if (!form.cargo || !form.nombre) return toast.error('Complete los campos');
    try {
      if (modal === 'nuevo') await api.post('/configuracion/firmantes', form);
      else await api.put(`/configuracion/firmantes/${form.id}`, form);
      toast.success('Firmante guardado');
      setModal(null); fetchAll();
    } catch (err) { toast.error(err.response?.data?.error || 'Error'); }
  };

  const deleteFirmante = async (id) => {
    if (!confirm('¿Eliminar firmante?')) return;
    try { await api.delete(`/configuracion/firmantes/${id}`); toast.success('Eliminado'); fetchAll(); }
    catch { toast.error('Error al eliminar'); }
  };

  // Retenciones CRUD
  const openRetencion = (r = null) => {
    setModalType('retencion');
    setForm(r ? { ...r } : { nombre: '', tipo: 'IR', porcentaje: '', activo: true });
    setModal(r ? 'editar' : 'nuevo');
  };

  const saveRetencion = async () => {
    if (!form.nombre || !form.porcentaje) return toast.error('Complete los campos');
    try {
      if (modal === 'nuevo') await api.post('/configuracion/retenciones-catalogo', form);
      else await api.put(`/configuracion/retenciones-catalogo/${form.id}`, form);
      toast.success('Retención guardada');
      setModal(null); fetchAll();
    } catch (err) { toast.error(err.response?.data?.error || 'Error'); }
  };

  const deleteRetencion = async (id) => {
    if (!confirm('¿Eliminar retención del catálogo?')) return;
    try { await api.delete(`/configuracion/retenciones-catalogo/${id}`); toast.success('Eliminado'); fetchAll(); }
    catch { toast.error('Error al eliminar'); }
  };

  // Usuarios CRUD
  const openUsuario = (u = null) => {
    setModalType('usuario');
    if (u) {
      setForm({
        id: u.id,
        username: u.username || '',
        nombre_completo: u.nombre_completo || '',
        rol: u.rol || 'financiero',
        activo: !!u.activo,
        password: '',
      });
      setModal('editar');
    } else {
      setForm({
        username: '',
        password: '',
        nombre_completo: '',
        rol: 'financiero',
        activo: true,
      });
      setModal('nuevo');
    }
  };

  const saveUsuario = async () => {
    if (!form.username || !form.nombre_completo || !form.rol) {
      return toast.error('Complete username, nombre y rol');
    }

    if (modal === 'nuevo' && !form.password) {
      return toast.error('Ingrese una contraseña');
    }

    try {
      if (modal === 'nuevo') {
        await api.post('/auth/usuarios', {
          username: form.username,
          password: form.password,
          nombre_completo: form.nombre_completo,
          rol: form.rol,
        });
        toast.success('Usuario creado');
      } else {
        await api.put(`/auth/usuarios/${form.id}`, {
          username: form.username,
          nombre_completo: form.nombre_completo,
          rol: form.rol,
          activo: form.activo,
          password: form.password || undefined,
        });
        toast.success('Usuario actualizado');
      }

      setModal(null);
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error guardando usuario');
    }
  };

  const deleteUsuario = async (u) => {
    if (u.id === currentUser.id) {
      return toast.error('No puede desactivar su propio usuario');
    }

    const accion = prompt(
      `Usuario: ${u.username}\n` +
      'Escriba DESACTIVAR para desactivar o ELIMINAR para borrar definitivamente.'
    );
    if (!accion) return;

    const decision = accion.trim().toUpperCase();
    if (decision !== 'DESACTIVAR' && decision !== 'ELIMINAR') {
      return toast.error('Acción cancelada: use DESACTIVAR o ELIMINAR');
    }

    try {
      const hard = decision === 'ELIMINAR';
      await api.delete(`/auth/usuarios/${u.id}${hard ? '?hard=true' : ''}`);
      toast.success(hard ? 'Usuario eliminado definitivamente' : 'Usuario desactivado');
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error eliminando usuario');
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Configuración</h1>
        <p className="text-gray-500 text-sm">Parámetros generales del sistema</p>
      </motion.div>

      {/* General Config */}
      <Section icon={HiOutlineCog6Tooth} title="Parámetros Generales">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Porcentaje IVA (%)</label>
            <div className="flex gap-2">
              <input
                type="number"
                step="0.01"
                value={ivaInput}
                onChange={(e) => setIvaInput(e.target.value)}
                className="input-field flex-1"
              />
              <button onClick={() => saveConfig('iva_porcentaje', ivaInput)} className="btn-primary text-sm">Guardar</button>
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Institución</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={institucionInput}
                onChange={(e) => setInstitucionInput(e.target.value)}
                className="input-field flex-1"
              />
              <button onClick={() => saveConfig('institucion_nombre', institucionInput)} className="btn-primary text-sm">Guardar</button>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
          <div>
            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Próximo N° Orden</label>
            <p className="text-lg font-mono neon-text">{config.siguiente_numero_orden || '—'}</p>
          </div>
          <div>
            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Próximo N° Cheque</label>
            <p className="text-lg font-mono text-purple-400">{config.siguiente_numero_cheque || '—'}</p>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between gap-4 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 p-4">
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-white">Permitir editar número de cheque</p>
            <p className="text-xs text-gray-500">Solo para administradores y solo cuando este control esté activo.</p>
          </div>
          <label className="inline-flex items-center cursor-pointer select-none">
            <input
              type="checkbox"
              checked={permitirEditarCheque}
              onChange={(e) => saveToggleCheque(e.target.checked)}
              className="sr-only peer"
            />
            <div className="relative w-12 h-7 rounded-full bg-gray-300 peer-checked:bg-cyan-400 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:h-6 after:w-6 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-5" />
          </label>
        </div>
      </Section>

      {/* Firmantes */}
      <Section icon={HiOutlineUserGroup} title="Firmantes">
        <div className="flex justify-end">
          <button onClick={() => openFirmante()} className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1">
            <HiOutlinePlus className="w-4 h-4" /> Agregar Firmante
          </button>
        </div>
        <div className="space-y-2">
          {firmantes.map(f => (
            <div key={f.id} className="flex items-center justify-between p-3 rounded-xl bg-gray-100/80 dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
              <div>
                <p className="text-sm text-gray-900 dark:text-white font-medium">{f.nombre}</p>
                <p className="text-xs text-gray-600 dark:text-gray-400">{f.cargo}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded-full ${f.activo ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}`}>
                  {f.activo ? 'Activo' : 'Inactivo'}
                </span>
                <button onClick={() => openFirmante(f)} className="p-1 hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg text-cyan-400"><HiOutlinePencilSquare className="w-4 h-4" /></button>
                <button onClick={() => deleteFirmante(f.id)} className="p-1 hover:bg-red-500/10 rounded-lg text-red-400"><HiOutlineTrash className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Retenciones Catálogo */}
      <Section icon={HiOutlineReceiptPercent} title="Catálogo de Retenciones">
        <div className="flex justify-end">
          <button onClick={() => openRetencion()} className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1">
            <HiOutlinePlus className="w-4 h-4" /> Agregar Retención
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200/70 dark:border-white/5">
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-600 dark:text-gray-400">Nombre</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-600 dark:text-gray-400">Tipo</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-gray-600 dark:text-gray-400">Porcentaje</th>
                <th className="text-center px-4 py-2 text-xs font-medium text-gray-600 dark:text-gray-400">Estado</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-gray-600 dark:text-gray-400">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {retenciones.map(r => (
                <tr key={r.id} className="border-b border-gray-200/70 dark:border-white/5 hover:bg-gray-100 dark:hover:bg-white/5">
                  <td className="px-4 py-2 text-sm text-gray-900 dark:text-white">{r.nombre}</td>
                  <td className="px-4 py-2 text-sm"><span className={`text-xs px-2 py-0.5 rounded-full ${r.tipo === 'IVA' ? 'bg-cyan-500/20 text-cyan-400' : 'bg-purple-500/20 text-purple-400'}`}>{r.tipo}</span></td>
                  <td className="px-4 py-2 text-sm text-right font-mono text-gray-700 dark:text-gray-300">{r.porcentaje}%</td>
                  <td className="px-4 py-2 text-center"><span className={`text-xs px-2 py-0.5 rounded-full ${r.activo ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}`}>{r.activo ? 'Activo' : 'Inactivo'}</span></td>
                  <td className="px-4 py-2 text-right">
                    <button onClick={() => openRetencion(r)} className="p-1 hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg text-cyan-400"><HiOutlinePencilSquare className="w-4 h-4" /></button>
                    <button onClick={() => deleteRetencion(r.id)} className="p-1 hover:bg-red-500/10 rounded-lg text-red-400 ml-1"><HiOutlineTrash className="w-4 h-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Usuarios */}
      {currentUser.rol === 'admin' && (
        <Section icon={HiOutlineUsers} title="Usuarios del Sistema">
          <div className="flex justify-end">
            <button onClick={() => openUsuario()} className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1">
              <HiOutlinePlus className="w-4 h-4" /> Agregar Usuario
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200/70 dark:border-white/5">
                  <th className="text-left px-4 py-2 text-xs font-medium text-gray-600 dark:text-gray-400">Usuario</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-gray-600 dark:text-gray-400">Nombre</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-gray-600 dark:text-gray-400">Rol</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-gray-600 dark:text-gray-400">Estado</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-gray-600 dark:text-gray-400">Último login</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-gray-600 dark:text-gray-400">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {usuarios.map(u => (
                  <tr key={u.id} className="border-b border-gray-200/70 dark:border-white/5 hover:bg-gray-100 dark:hover:bg-white/5">
                    <td className="px-4 py-2 text-sm text-gray-900 dark:text-white font-mono">{u.username}</td>
                    <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">{u.nombre_completo}</td>
                    <td className="px-4 py-2 text-sm">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${u.rol === 'admin' ? 'bg-purple-500/20 text-purple-400' : u.rol === 'auditor' ? 'bg-amber-500/20 text-amber-400' : 'bg-cyan-500/20 text-cyan-400'}`}>
                        {u.rol}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-sm">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${u.activo ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}`}>
                        {u.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-600 dark:text-gray-400">
                      {u.ultimo_login ? new Date(u.ultimo_login).toLocaleString('es-EC') : 'Nunca'}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button onClick={() => openUsuario(u)} className="p-1 hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg text-cyan-400" title="Editar usuario">
                        <HiOutlinePencilSquare className="w-4 h-4" />
                      </button>
                      <button onClick={() => deleteUsuario(u)} className="p-1 hover:bg-red-500/10 rounded-lg text-red-400 ml-1" title="Desactivar usuario">
                        <HiOutlineTrash className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {currentUser.rol === 'admin' && (
        <Section icon={HiOutlineArrowUpTray} title="Migración Access">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Suba un archivo .mdb o .accdb para ejecutar la migración en segundo plano.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-center">
            <input
              type="file"
              accept=".mdb,.accdb"
              onChange={(e) => setAccessFile(e.target.files?.[0] || null)}
              className="input-field"
            />
            <button
              onClick={uploadAccessAndMigrate}
              disabled={uploadingAccess || !accessFile}
              className="btn-primary text-sm disabled:opacity-50"
            >
              {uploadingAccess ? 'Subiendo...' : 'Subir y Migrar'}
            </button>
          </div>

          <div className="rounded-xl p-4 bg-gray-100/80 dark:bg-white/5 text-sm space-y-2">
            <div className="text-xs text-gray-500 dark:text-gray-400">Límite máximo: 500 MB</div>

            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-gray-500">Progreso</span>
                <span className="font-semibold text-gray-900 dark:text-white">{progressPercent}%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-gray-200 dark:bg-white/10 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="text-xs mt-1 text-gray-600 dark:text-gray-300">
                Etapa: <span className="font-medium">{stageLabel}</span>
                {progress?.totalRows ? ` | ${progress.insertedRows || 0}/${progress.totalRows} registros` : ''}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <span className="text-gray-500">En curso:</span>
              <span className="font-medium text-gray-900 dark:text-white">
                {migrationState.current ? `${migrationState.current.fileName} (${migrationState.current.status})` : 'Ninguna'}
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              <span className="text-gray-500">Última ejecución:</span>
              <span className="font-medium text-gray-900 dark:text-white">
                {migrationState.last ? `${migrationState.last.fileName} (${migrationState.last.status})` : 'Sin ejecuciones'}
              </span>
            </div>

            {migrationState.last?.finishedAt && (
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Finalizado: {new Date(migrationState.last.finishedAt).toLocaleString('es-EC')}
              </div>
            )}

            {migrationState.last?.error && (
              <div className="text-xs text-red-500">
                Error: {migrationState.last.error}
              </div>
            )}

            {currentOrLastMigration?.output && (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-cyan-500">Ver log de migración</summary>
                <pre className="mt-2 max-h-40 overflow-auto text-[11px] p-2 rounded bg-gray-200/70 dark:bg-black/30 text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
                  {currentOrLastMigration.output}
                </pre>
              </details>
            )}
          </div>
        </Section>
      )}

      {/* Backup y Restauración */}
      {currentUser.rol === 'admin' && (
        <Section icon={HiOutlineArrowUpTray} title="Backup y Restauración">
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-2">Descargar Backup</h3>
              <button
                onClick={downloadBackup}
                disabled={backupLoading}
                className="btn-primary text-sm disabled:opacity-50"
              >
                {backupLoading ? 'Generando...' : 'Descargar Backup'}
              </button>
            </div>

            <div className="border-t border-gray-200 dark:border-white/5 pt-4">
              <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-2">Restaurar Base de Datos</h3>
              <div className="flex flex-col gap-3">
                <input
                  type="file"
                  accept=".sql"
                  onChange={(e) => setRestoreFile(e.target.files?.[0] || null)}
                  className="input-field text-sm"
                />
                <button
                  onClick={restoreDatabase}
                  disabled={!restoreFile || restoreing}
                  className="btn-primary text-sm disabled:opacity-50"
                >
                  {restoreing ? 'Restaurando...' : 'Restaurar Base de Datos'}
                </button>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                ⚠️ Advertencia: La restauración reemplazará todos los datos actuales.
              </p>
            </div>
          </div>
        </Section>
      )}

      {/* Modal */}
      <AnimatePresence>
        {modal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="glass neon-border rounded-2xl p-6 w-full max-w-md space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {modal === 'nuevo' ? 'Nuevo' : 'Editar'} {modalType === 'firmante' ? 'Firmante' : modalType === 'retencion' ? 'Retención' : 'Usuario'}
                </h2>
                <button onClick={() => setModal(null)} className="p-1 hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg"><HiOutlineXMark className="w-5 h-5 text-gray-600 dark:text-gray-400" /></button>
              </div>

              {modalType === 'firmante' ? (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Cargo</label>
                    <input type="text" value={form.cargo || ''} onChange={(e) => setForm({ ...form, cargo: e.target.value })} className="input-field" placeholder="Ej: Alcalde, Jefe Financiero..." />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Nombre</label>
                    <input type="text" value={form.nombre || ''} onChange={(e) => setForm({ ...form, nombre: e.target.value })} className="input-field" />
                  </div>
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <input type="checkbox" checked={form.activo} onChange={(e) => setForm({ ...form, activo: e.target.checked })} className="accent-cyan-400" />
                    Activo
                  </label>
                </div>
              ) : modalType === 'retencion' ? (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Nombre</label>
                    <input type="text" value={form.nombre || ''} onChange={(e) => setForm({ ...form, nombre: e.target.value })} className="input-field" placeholder="Ej: Ret. Fuente 1%..." />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Tipo</label>
                      <select value={form.tipo || 'IR'} onChange={(e) => setForm({ ...form, tipo: e.target.value })} className="input-field">
                        <option value="IR">IR</option>
                        <option value="IVA">IVA</option>
                        <option value="OTRO">OTRO</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Porcentaje (%)</label>
                      <input type="number" step="0.001" value={form.porcentaje || ''} onChange={(e) => setForm({ ...form, porcentaje: e.target.value })} className="input-field" />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <input type="checkbox" checked={form.activo} onChange={(e) => setForm({ ...form, activo: e.target.checked })} className="accent-cyan-400" />
                    Activo
                  </label>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Username</label>
                      <input type="text" value={form.username || ''} onChange={(e) => setForm({ ...form, username: e.target.value })} className="input-field" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Rol</label>
                      <select value={form.rol || 'financiero'} onChange={(e) => setForm({ ...form, rol: e.target.value })} className="input-field">
                        <option value="admin">admin</option>
                        <option value="financiero">financiero</option>
                        <option value="auditor">auditor</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Nombre completo</label>
                    <input type="text" value={form.nombre_completo || ''} onChange={(e) => setForm({ ...form, nombre_completo: e.target.value })} className="input-field" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">{modal === 'nuevo' ? 'Contraseña' : 'Nueva contraseña (opcional)'}</label>
                    <input type="password" value={form.password || ''} onChange={(e) => setForm({ ...form, password: e.target.value })} className="input-field" />
                  </div>
                  {modal === 'editar' && (
                    <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                      <input type="checkbox" checked={!!form.activo} onChange={(e) => setForm({ ...form, activo: e.target.checked })} className="accent-cyan-400" />
                      Activo
                    </label>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => setModal(null)} className="btn-secondary text-sm">Cancelar</button>
                <button onClick={modalType === 'firmante' ? saveFirmante : modalType === 'retencion' ? saveRetencion : saveUsuario} className="btn-primary text-sm">
                  {modal === 'nuevo' ? 'Crear' : 'Guardar'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
