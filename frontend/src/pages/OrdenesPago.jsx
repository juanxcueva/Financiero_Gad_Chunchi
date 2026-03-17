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
  const user = JSON.parse(localStorage.getItem('user') || '{}');

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
    try {
      const { data } = await api.get(`/documentos/${id}/${tipo}`, { responseType: 'blob' });
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `comprobante.${tipo === 'pdf' ? 'pdf' : 'docx'}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error(`Error generando ${tipo.toUpperCase()}`);
    }
  };

  const previsualizarPdf = async (orden) => {
    try {
      const { data } = await api.get(`/documentos/${orden.id}/pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(data);
      setPdfUrl(url);
      setPdfNumOrden(orden.numero_orden);
      setShowPdfViewer(true);
    } catch {
      toast.error('Error generando PDF');
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
                      <button onClick={() => previsualizarPdf(o)} title="PDF" className="p-2 rounded-lg hover:bg-red-500/10 text-red-400 transition-colors">
                        <HiOutlineDocumentArrowDown className="w-4 h-4" />
                      </button>
                      <button onClick={() => descargar(o.id, 'word')} title="Word" className="p-2 rounded-lg hover:bg-blue-500/10 text-blue-400 transition-colors text-xs font-bold">
                        W
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
    </div>
  );
}
