import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { HiOutlineMagnifyingGlass, HiOutlineFunnel, HiOutlineDocumentArrowDown, HiOutlinePencilSquare, HiOutlineNoSymbol } from 'react-icons/hi2';
import api from '../services/api';
import toast from 'react-hot-toast';
import PdfViewer from '../components/PdfViewer';

const formatMoney = (v) => new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' }).format(v || 0);
const formatDate = (d) => d ? new Date(d).toLocaleDateString('es-EC') : '';

export default function OrdenesPago() {
  const [ordenes, setOrdenes] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [estado, setEstado] = useState('');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [anulando, setAnulando] = useState(null);
  const [motivoAnulacion, setMotivoAnulacion] = useState('');
  const [showPdfViewer, setShowPdfViewer] = useState(false);
  const [pdfUrl, setPdfUrl] = useState('');
  const [pdfNumOrden, setPdfNumOrden] = useState('');
  const [generandoDoc, setGenerandoDoc] = useState(null);
  const [downloadProgress, setDownloadProgress] = useState(null);
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  const updateProgress = (id, tipo, progressEvent) => {
    setDownloadProgress((prev) => {
      const loaded = progressEvent?.loaded || 0;
      const total = progressEvent?.total || 0;
      if (total > 0) {
        const percent = Math.min(100, Math.round((loaded / total) * 100));
        return { id, tipo, percent, knownTotal: true };
      }

      const base = prev?.id === id && prev?.tipo === tipo ? prev.percent : 10;
      return { id, tipo, percent: Math.min(90, base + 5), knownTotal: false };
    });
  };

  const getProgressStage = (percent) => {
    if (percent >= 100) return 'Documento listo';
    if (percent >= 75) return 'Transfiriendo archivo';
    if (percent >= 35) return 'Generando comprobante';
    return 'Preparando solicitud';
  };

  const fetchOrdenes = useCallback(async () => {
    try {
      const params = { page, limit: 20, search, estado, fecha_desde: fechaDesde, fecha_hasta: fechaHasta };
      const { data } = await api.get('/ordenes-pago', { params });
      setOrdenes(data.data);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch {
      toast.error('Error cargando órdenes');
    }
  }, [page, search, estado, fechaDesde, fechaHasta]);

  useEffect(() => { fetchOrdenes(); }, [fetchOrdenes]);

  const handleAnular = async () => {
    if (!motivoAnulacion.trim()) return toast.error('Ingrese el motivo');
    try {
      await api.patch(`/ordenes-pago/${anulando}/anular`, { motivo: motivoAnulacion });
      toast.success('Orden anulada');
      setAnulando(null);
      setMotivoAnulacion('');
      fetchOrdenes();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al anular');
    }
  };

  const descargar = async (id, tipo) => {
    if (generandoDoc) return;
    setGenerandoDoc({ id, tipo });
    setDownloadProgress({ id, tipo, percent: 10, knownTotal: false });
    try {
      const { data } = await api.get(`/documentos/${id}/${tipo}`, {
        responseType: 'blob',
        onDownloadProgress: (progressEvent) => updateProgress(id, tipo, progressEvent),
      });
      setDownloadProgress({ id, tipo, percent: 100, knownTotal: true });
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `comprobante.${tipo === 'pdf' ? 'pdf' : 'docx'}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err?.response?.data?.error || `Error generando ${tipo.toUpperCase()}`);
    } finally {
      setTimeout(() => {
        setGenerandoDoc(null);
        setDownloadProgress(null);
      }, 250);
    }
  };

  const previsualizarPdf = async (orden) => {
    if (generandoDoc) return;
    setGenerandoDoc({ id: orden.id, tipo: 'pdf' });
    setDownloadProgress({ id: orden.id, tipo: 'pdf', percent: 10, knownTotal: false });
    try {
      const { data } = await api.get(`/documentos/${orden.id}/pdf`, {
        responseType: 'blob',
        onDownloadProgress: (progressEvent) => updateProgress(orden.id, 'pdf', progressEvent),
      });
      setDownloadProgress({ id: orden.id, tipo: 'pdf', percent: 100, knownTotal: true });
      const url = URL.createObjectURL(data);
      setPdfUrl(url);
      setPdfNumOrden(orden.numero_orden);
      setShowPdfViewer(true);
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Error generando PDF');
    } finally {
      setTimeout(() => {
        setGenerandoDoc(null);
        setDownloadProgress(null);
      }, 250);
    }
  };

  const cerrarPdfViewer = () => {
    if (pdfUrl) {
      URL.revokeObjectURL(pdfUrl);
    }
    setShowPdfViewer(false);
    setPdfUrl('');
    setPdfNumOrden('');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Órdenes de Pago</h1>
          <p className="text-gray-500 text-sm">{total} registros</p>
        </div>
        {['admin', 'financiero'].includes(user.rol) && (
          <Link to="/ordenes-pago/nueva" className="btn-primary text-sm">
            + Nueva Orden
          </Link>
        )}
      </div>

      {/* Search & Filters */}
      <div className="glass rounded-2xl p-4 space-y-4">
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <HiOutlineMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
            <input
              type="text"
              placeholder="Buscar por N°, beneficiario, detalle..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="input-field pl-10"
            />
          </div>
          <button onClick={() => setShowFilters(!showFilters)} className={`btn-secondary text-sm flex items-center gap-2 ${showFilters ? 'bg-blue-100 dark:bg-purple-500/30' : ''}`}>
            <HiOutlineFunnel className="w-4 h-4" /> Filtros
          </button>
        </div>

        <AnimatePresence>
          {showFilters && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-3 border-t border-gray-200/70 dark:border-white/5">
                <div>
                  <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Estado</label>
                  <select value={estado} onChange={(e) => { setEstado(e.target.value); setPage(1); }} className="input-field text-sm">
                    <option value="">Todos</option>
                    <option value="ACTIVO">Activo</option>
                    <option value="ANULADO">Anulado</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Desde</label>
                  <input type="date" value={fechaDesde} onChange={(e) => { setFechaDesde(e.target.value); setPage(1); }} className="input-field text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Hasta</label>
                  <input type="date" value={fechaHasta} onChange={(e) => { setFechaHasta(e.target.value); setPage(1); }} className="input-field text-sm" />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Table */}
      <div className="glass rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200/70 dark:border-white/5">
                <th className="text-left text-xs text-gray-600 dark:text-gray-400 font-medium px-4 py-3 uppercase tracking-wider">N°</th>
                <th className="text-left text-xs text-gray-600 dark:text-gray-400 font-medium px-4 py-3 uppercase tracking-wider">Fecha</th>
                <th className="text-left text-xs text-gray-600 dark:text-gray-400 font-medium px-4 py-3 uppercase tracking-wider">Beneficiario</th>
                <th className="text-right text-xs text-gray-600 dark:text-gray-400 font-medium px-4 py-3 uppercase tracking-wider">Cargos</th>
                <th className="text-right text-xs text-gray-600 dark:text-gray-400 font-medium px-4 py-3 uppercase tracking-wider">Retenciones</th>
                <th className="text-right text-xs text-gray-600 dark:text-gray-400 font-medium px-4 py-3 uppercase tracking-wider">Líquido</th>
                <th className="text-center text-xs text-gray-600 dark:text-gray-400 font-medium px-4 py-3 uppercase tracking-wider">Estado</th>
                <th className="text-center text-xs text-gray-600 dark:text-gray-400 font-medium px-4 py-3 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {ordenes.map((o, i) => (
                <motion.tr
                  key={o.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.03 }}
                  className="border-b border-gray-200/70 dark:border-white/5 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
                >
                  <td className="px-4 py-3 text-sm font-mono neon-text">{o.numero_orden}</td>
                  <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{formatDate(o.fecha)}</td>
                  <td className="px-4 py-3">
                    <p className="text-sm text-gray-900 dark:text-white truncate max-w-[200px]">{o.nombre_beneficiario}</p>
                    <p className="text-xs text-gray-500">{o.codigo_beneficiario}</p>
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-gray-700 dark:text-gray-300">{formatMoney(o.total_cargos)}</td>
                  <td className="px-4 py-3 text-sm text-right text-red-400">{formatMoney(o.total_retenciones)}</td>
                  <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900 dark:text-white">{formatMoney(o.liquido_pagar)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                      o.situacion === 'ACTIVO' ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'
                    }`}>
                      {o.situacion}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => previsualizarPdf(o)}
                        title="PDF"
                        disabled={Boolean(generandoDoc)}
                        className="p-2 rounded-lg hover:bg-red-500/10 text-red-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {generandoDoc?.id === o.id && generandoDoc?.tipo === 'pdf' ? (
                          <span className="block w-4 h-4 rounded-full border-2 border-red-400 border-t-transparent animate-spin" />
                        ) : (
                          <HiOutlineDocumentArrowDown className="w-4 h-4" />
                        )}
                      </button>
                      <button
                        onClick={() => descargar(o.id, 'word')}
                        title="Word"
                        disabled={Boolean(generandoDoc)}
                        className="p-2 rounded-lg hover:bg-blue-500/10 text-blue-400 transition-colors text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {generandoDoc?.id === o.id && generandoDoc?.tipo === 'word' ? (
                          <span className="block w-4 h-4 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
                        ) : (
                          'W'
                        )}
                      </button>
                      {o.situacion === 'ACTIVO' && ['admin', 'financiero'].includes(user.rol) && (
                        <>
                          <Link to={`/ordenes-pago/${o.id}/editar`} title="Editar" className="p-2 rounded-lg hover:bg-cyan-500/10 text-cyan-400 transition-colors">
                            <HiOutlinePencilSquare className="w-4 h-4" />
                          </Link>
                          <button onClick={() => setAnulando(o.id)} title="Anular" className="p-2 rounded-lg hover:bg-red-500/10 text-red-400 transition-colors">
                            <HiOutlineNoSymbol className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                    {generandoDoc?.id === o.id && (
                      <p className="mt-1 text-[11px] text-center font-medium text-cyan-600 dark:text-cyan-300">
                        Generando {generandoDoc.tipo === 'pdf' ? 'PDF' : 'Word'}...
                      </p>
                    )}
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>

        {ordenes.length === 0 && (
          <div className="text-center py-12 text-gray-500">No se encontraron órdenes de pago</div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t border-gray-200/70 dark:border-white/5">
            <p className="text-sm text-gray-500">Página {page} de {totalPages}</p>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 rounded-lg text-sm bg-gray-100 dark:bg-white/5 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/10 disabled:opacity-30">
                Anterior
              </button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-1.5 rounded-lg text-sm bg-gray-100 dark:bg-white/5 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/10 disabled:opacity-30">
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal Anulación */}
      <AnimatePresence>
        {anulando && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setAnulando(null)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="glass neon-border rounded-2xl p-6 w-full max-w-md"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Anular Orden de Pago</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">Esta acción no se puede deshacer. Ingrese el motivo de la anulación:</p>
              <textarea
                value={motivoAnulacion}
                onChange={(e) => setMotivoAnulacion(e.target.value)}
                rows={3}
                className="input-field mb-4"
                placeholder="Motivo de anulación..."
              />
              <div className="flex gap-3 justify-end">
                <button onClick={() => { setAnulando(null); setMotivoAnulacion(''); }} className="btn-secondary text-sm">Cancelar</button>
                <button onClick={handleAnular} className="btn-danger text-sm">Confirmar Anulación</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {showPdfViewer && (
        <PdfViewer
          pdfUrl={pdfUrl}
          numeroOrden={pdfNumOrden}
          onClose={cerrarPdfViewer}
        />
      )}

      <AnimatePresence>
        {generandoDoc && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center"
          >
            <div className="glass rounded-2xl p-5 w-[390px] max-w-[92vw] border border-cyan-300/30 dark:border-cyan-400/20">
              <p className="text-sm font-medium text-gray-900 dark:text-white mb-1">
                {generandoDoc.tipo === 'pdf' ? 'Generando PDF' : 'Generando Word'}
              </p>
              <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
                {downloadProgress?.knownTotal ? 'Descargando documento...' : 'Preparando documento en el servidor...'}
              </p>
              <div className="w-full h-3 rounded-full bg-gray-200/70 dark:bg-white/10 overflow-hidden relative">
                <motion.div
                  className="h-full bg-gradient-to-r from-cyan-400 via-sky-400 to-blue-500"
                  initial={{ width: 0 }}
                  animate={{ width: `${downloadProgress?.percent || 10}%` }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                />
                <motion.div
                  className="absolute top-0 bottom-0 w-10 bg-white/35 blur-[2px]"
                  initial={{ x: -50 }}
                  animate={{ x: 360 }}
                  transition={{ duration: 1.1, repeat: Infinity, ease: 'linear' }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {downloadProgress?.knownTotal ? 'Progreso real' : 'Estimado'}
                </p>
                <p className="text-xs font-semibold text-cyan-400">
                  {downloadProgress?.percent || 10}%
                </p>
              </div>

              <div className="mt-3 rounded-xl bg-white/60 dark:bg-dark-700/60 border border-gray-200 dark:border-white/10 px-3 py-2">
                <p className="text-xs text-gray-700 dark:text-gray-300 font-medium">
                  {getProgressStage(downloadProgress?.percent || 10)}
                </p>
                <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                  {[
                    { label: 'Solicitud', doneAt: 25 },
                    { label: 'Generación', doneAt: 70 },
                    { label: 'Descarga', doneAt: 100 },
                  ].map((step) => {
                    const currentPercent = downloadProgress?.percent || 10;
                    const done = currentPercent >= step.doneAt;
                    return (
                      <div key={step.label} className={`rounded-lg border px-2 py-1 text-center ${done ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-700 dark:text-cyan-300' : 'border-gray-300 dark:border-white/10 text-gray-500 dark:text-gray-400'}`}>
                        <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle ${done ? 'bg-cyan-400' : 'bg-gray-400 dark:bg-gray-500'}`} />
                        {step.label}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
