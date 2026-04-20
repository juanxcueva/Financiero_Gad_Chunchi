import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { HiOutlinePlus, HiOutlineTrash, HiOutlineMagnifyingGlass } from 'react-icons/hi2';
import api from '../services/api';
import toast from 'react-hot-toast';
import PdfViewer from '../components/PdfViewer';
import MultiLineDropdown from '../components/MultiLineDropdown';

const formatMoney = (v) => parseFloat(v || 0).toFixed(2);
const DEFAULT_CUENTA_BC = '79220009';

export default function NuevaOrden() {
  const navigate = useNavigate();
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
  const isAdmin = currentUser?.rol === 'admin';
  const [loading, setLoading] = useState(false);
  const [numOrden, setNumOrden] = useState('');
  const [numCheque, setNumCheque] = useState('');
  const [config, setConfig] = useState({});
  const [permitirEditarCheque, setPermitirEditarCheque] = useState(false);
  const [retencionesCatalogo, setRetencionesCatalogo] = useState([]);

  const [fechaOrden, setFechaOrden] = useState('');
  const [cuentasBancarias, setCuentasBancarias] = useState([]);
  const [cuentasBCCatalogo, setCuentasBCCatalogo] = useState([]);
  const [cuentaBcSeleccionada, setCuentaBcSeleccionada] = useState('');
  const [codigoBancoSeleccionado, setCodigoBancoSeleccionado] = useState('');
  // PDF Viewer
  const [showPdfViewer, setShowPdfViewer] = useState(false);
  const [pdfUrl, setPdfUrl] = useState('');
  const [pdfNumOrden, setPdfNumOrden] = useState('');
  const [generandoDoc, setGenerandoDoc] = useState(null);
  const [downloadProgress, setDownloadProgress] = useState(null);
  const submitLockRef = useRef(false);
  // Tracks whether the admin explicitly typed a custom cheque number.
  // When false the backend auto-assigns the next available number,
  // avoiding stale-form race conditions.
  const chequeEditadoManualmenteRef = useRef(false);

  // Form state
  const [codigoBeneficiario, setCodigoBeneficiario] = useState('');
  const [nombreBeneficiario, setNombreBeneficiario] = useState('');
  const [detalle, setDetalle] = useState('');
  const [valorPlanilla, setValorPlanilla] = useState('');
  const [aplicaIva, setAplicaIva] = useState(true);
  const [porcentajeIva, setPorcentajeIva] = useState('');
  const [valorIva, setValorIva] = useState('');
  const [otrosCargos, setOtrosCargos] = useState([]);
  const [retenciones, setRetenciones] = useState([]);
  const [retencionesManuales, setRetencionesManuales] = useState([]);

  // Beneficiario search
  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState([]);
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get('/ordenes-pago/siguiente-numero'),
      api.get('/configuracion'),
      api.get('/configuracion/retenciones-catalogo'),
      api.get('/ordenes-pago/cuentas-bancarias'),
    ]).then(([numRes, configRes, retRes, cuentasRes]) => {
      setNumOrden(numRes.data.data.numero_orden);
      setNumCheque(numRes.data.data.numero_cheque);
      chequeEditadoManualmenteRef.current = false;
      const cfg = configRes.data.data || {};
      setConfig(cfg);
      setPermitirEditarCheque(['1', 'true', 'si', 'sí', 'yes'].includes(String(cfg.permitir_editar_cheque || '').toLowerCase()));
      const defaultPct = String(cfg.iva_porcentaje || '15');
      setPorcentajeIva(defaultPct);
      setAplicaIva((parseFloat(defaultPct) || 0) > 0);
      setRetencionesCatalogo(retRes.data.data);
        const hoy = new Date().toISOString().split('T')[0];
        setFechaOrden(hoy);
      const cuentas = cuentasRes.data.data || [];
      const cuentasCatalogo = cuentasRes.data.cuentas_bc || [];
      setCuentasBancarias(cuentas);
      setCuentasBCCatalogo(cuentasCatalogo);
      if (cuentasCatalogo.length > 0) {
        const preferredCuenta = cuentasCatalogo.find((c) => c.cuenta_bancaria === DEFAULT_CUENTA_BC) || cuentasCatalogo[0];
        setCuentaBcSeleccionada(preferredCuenta.cuenta_bancaria);
        if (preferredCuenta.siguiente_numero_transfer) {
          setNumCheque(String(preferredCuenta.siguiente_numero_transfer));
          chequeEditadoManualmenteRef.current = false;
        }

        const firstBank = cuentas.find(c => c.cuenta_bancaria === preferredCuenta.cuenta_bancaria);
        setCodigoBancoSeleccionado(firstBank?.codigo_banco || '');
      } else if (cuentas.length > 0) {
        const preferredBank = cuentas.find((c) => c.cuenta_bancaria === DEFAULT_CUENTA_BC) || cuentas[0];
        setCuentaBcSeleccionada(preferredBank.cuenta_bancaria);
        setCodigoBancoSeleccionado(preferredBank.codigo_banco);
        setNumCheque(String(preferredBank.siguiente_numero_cheque));
      }
    }).catch(() => toast.error('Error cargando configuración'));
  }, []);

  const cuentasCatalogo = cuentasBCCatalogo.length > 0
    ? cuentasBCCatalogo
    : [...new Set(cuentasBancarias.map((c) => c.cuenta_bancaria))].map((cuenta) => ({
      cuenta_bancaria: cuenta,
      descripcion_cuenta: cuenta,
    }));

  const bancosFiltrados = cuentaBcSeleccionada
    ? cuentasBancarias.filter(c => c.cuenta_bancaria === cuentaBcSeleccionada)
    : cuentasBancarias;

  useEffect(() => {
    if (bancosFiltrados.length === 0) {
      setCodigoBancoSeleccionado('');
      return;
    }

    const selectedInFilter = bancosFiltrados.some((b) => b.codigo_banco === codigoBancoSeleccionado);
    if (!selectedInFilter) {
      const first = bancosFiltrados[0];
      setCodigoBancoSeleccionado(first.codigo_banco);
    }
  }, [cuentaBcSeleccionada, bancosFiltrados, codigoBancoSeleccionado]);
  // Auto-calculate IVA
  useEffect(() => {
    if (!aplicaIva) {
      setValorIva('0.00');
      return;
    }

    const vp = parseFloat(valorPlanilla) || 0;
    const pct = parseFloat(porcentajeIva) || 0;
    setValorIva((vp * pct / 100).toFixed(2));
  }, [valorPlanilla, porcentajeIva, aplicaIva]);

  // Search beneficiarios
  const buscarBeneficiario = useCallback(async (q) => {
    if (q.length < 2) { setResultados([]); return; }
    try {
      const { data } = await api.get('/beneficiarios/buscar', { params: { q } });
      setResultados(data.data);
      setShowResults(true);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => buscarBeneficiario(busqueda), 300);
    return () => clearTimeout(timer);
  }, [busqueda, buscarBeneficiario]);

  const selectBeneficiario = (b) => {
    setCodigoBeneficiario(b.ruc_cedula);
    setNombreBeneficiario(b.nombre);
    setBusqueda(b.nombre);
    setShowResults(false);
  };

  // Otros cargos
  const addOtroCargo = () => setOtrosCargos([...otrosCargos, { razon: '', valor: '' }]);
  const removeOtroCargo = (i) => setOtrosCargos(otrosCargos.filter((_, idx) => idx !== i));
  const updateOtroCargo = (i, field, val) => {
    const copy = [...otrosCargos];
    copy[i][field] = val;
    setOtrosCargos(copy);
  };

  // Retenciones
  const addRetencion = () => setRetenciones([...retenciones, { tipo: 'IVA', concepto: '', base: '', porcentaje: '', valor: '' }]);
  const removeRetencion = (i) => setRetenciones(retenciones.filter((_, idx) => idx !== i));
  const updateRetencion = (i, field, val) => {
    const copy = [...retenciones];
    copy[i][field] = val;
    // Auto-calculate valor from base * porcentaje
    if (field === 'base' || field === 'porcentaje') {
      const base = parseFloat(field === 'base' ? val : copy[i].base) || 0;
      const pct = parseFloat(field === 'porcentaje' ? val : copy[i].porcentaje) || 0;
      copy[i].valor = (base * pct / 100).toFixed(2);
    }
    setRetenciones(copy);
  };
  const selectRetCatalogo = (i, catalogoId) => {
    const cat = retencionesCatalogo.find(r => r.id === parseInt(catalogoId));
    if (cat) {
      const copy = [...retenciones];
      copy[i].tipo = cat.tipo;
      copy[i].concepto = cat.nombre;
      copy[i].porcentaje = String(cat.porcentaje);
      copy[i].catalogoId = cat.id;
      // Recalculate if base exists
      const base = parseFloat(copy[i].base) || 0;
      copy[i].valor = (base * cat.porcentaje / 100).toFixed(2);
      setRetenciones(copy);
    }
  };
  const addRetencionManual = () => setRetencionesManuales([...retencionesManuales, { concepto: '', valor: '' }]);
  const removeRetencionManual = (i) => setRetencionesManuales(retencionesManuales.filter((_, idx) => idx !== i));
  const updateRetencionManual = (i, field, val) => {
    const copy = [...retencionesManuales];
    copy[i][field] = val;
    setRetencionesManuales(copy);
  };

  // Calculations
  const vp = parseFloat(valorPlanilla) || 0;
  const vi = parseFloat(valorIva) || 0;
  const totalOtrosCargos = otrosCargos.reduce((s, c) => s + (parseFloat(c.valor) || 0), 0);
  const totalCargos = vp + vi + totalOtrosCargos;
  const totalRetencionesCatalogo = retenciones.reduce((s, r) => s + (parseFloat(r.valor) || 0), 0);
  const totalRetencionesManuales = retencionesManuales.reduce((s, r) => s + (parseFloat(r.valor) || 0), 0);
  const totalRetenciones = totalRetencionesCatalogo + totalRetencionesManuales;
  const liquidoPagar = totalCargos - totalRetenciones;

  const updateProgress = (progressEvent) => {
    setDownloadProgress((prev) => {
      const loaded = progressEvent?.loaded || 0;
      const total = progressEvent?.total || 0;
      if (total > 0) {
        const percent = Math.min(100, Math.round((loaded / total) * 100));
        return { percent, knownTotal: true };
      }

      const base = prev?.percent || 10;
      return { percent: Math.min(90, base + 5), knownTotal: false };
    });
  };

  const getProgressStage = (percent) => {
    if (percent >= 100) return 'Documento listo';
    if (percent >= 75) return 'Transfiriendo archivo';
    if (percent >= 35) return 'Generando comprobante';
    return 'Preparando solicitud';
  };

  const handleSubmit = async (generarPdf = false) => {
    if (submitLockRef.current || loading) return;
    if (!nombreBeneficiario.trim()) return toast.error('Ingrese el beneficiario');
    if (!detalle.trim()) return toast.error('Ingrese el detalle');
    if (detalle.trim().length < 10) return toast.error('El detalle debe tener al menos 10 caracteres');
    if (totalCargos <= 0) return toast.error('Ingrese al menos un valor en Subtotal u Otros Cargos');

    submitLockRef.current = true;
    setLoading(true);
    try {
      const pctIva = aplicaIva ? (parseFloat(porcentajeIva) || 0) : 0;
      const valIva = aplicaIva ? (parseFloat(valorIva) || 0) : 0;

      const retencionesPayload = [
        ...retenciones
          .filter(r => r.concepto && parseFloat(r.valor) > 0)
          .map(r => ({
            tipo: r.tipo || 'OTRO',
            concepto: r.concepto,
            base: parseFloat(r.base) || 0,
            porcentaje: parseFloat(r.porcentaje) || 0,
            valor: parseFloat(r.valor) || 0,
          })),
        ...retencionesManuales
          .filter(r => r.concepto && parseFloat(r.valor) > 0)
          .map(r => ({ tipo: 'OTRO', concepto: r.concepto, base: 0, porcentaje: 0, valor: parseFloat(r.valor) || 0 })),
      ];

      const body = {
        codigo_beneficiario: codigoBeneficiario,
        nombre_beneficiario: nombreBeneficiario,
        detalle,
        valor_planilla: vp,
        porcentaje_iva: pctIva,
        valor_iva: valIva,
        otros_cargos: otrosCargos
          .filter(c => c.razon && parseFloat(c.valor) > 0)
          .map(c => ({
            razon: c.razon,
            valor: parseFloat(c.valor) || 0,
          })),
        retenciones: retencionesPayload,
      };

      // Only send cheque_numero if the admin explicitly typed a custom value.
      // When auto-populated from the form load/cuenta-BC change, let the backend
      // compute the next free number itself to avoid stale-value race conditions.
      if (cuentaBcSeleccionada) {
        body.cuenta_banco_central = cuentaBcSeleccionada;
      }
      if (codigoBancoSeleccionado) {
        body.codigo_banco = codigoBancoSeleccionado;
      }
      if (isAdmin && permitirEditarCheque && numCheque && chequeEditadoManualmenteRef.current) {
        body.cheque_numero = numCheque;
      }
      if (fechaOrden) {
        body.fecha_orden = fechaOrden;
      }
      const { data } = await api.post('/ordenes-pago', body);
      toast.success(`Orden N° ${data.data.numero_orden} creada`);

      if (generarPdf) {
        setGenerandoDoc({ tipo: 'pdf' });
        setDownloadProgress({ percent: 10, knownTotal: false });

        try {
          const pdfResponse = await api.get(`/documentos/${data.data.id}/pdf`, {
            responseType: 'blob',
            onDownloadProgress: updateProgress,
          });

          setDownloadProgress({ percent: 100, knownTotal: true });
          const blobUrl = URL.createObjectURL(pdfResponse.data);
          setPdfUrl(blobUrl);
          setPdfNumOrden(data.data.numero_orden);
          setShowPdfViewer(true);
        } catch (pdfErr) {
          toast.error(pdfErr?.response?.data?.error || 'Error al generar PDF');
        } finally {
          setTimeout(() => {
            setGenerandoDoc(null);
            setDownloadProgress(null);
          }, 250);
        }
      } else {
        navigate('/ordenes-pago');
      }
    } catch (err) {
      const details = err.response?.data?.details;
      if (Array.isArray(details) && details.length > 0 && details[0]?.message) {
        toast.error(details[0].message);
      } else {
        toast.error(err.response?.data?.error || 'Error al crear');
      }
    } finally {
      setLoading(false);
      submitLockRef.current = false;
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Nueva Orden de Pago</h1>
        <p className="text-gray-500 text-sm">Complete los datos para generar el comprobante</p>
      </motion.div>

      {/* Info bar */}
      <div className="glass rounded-2xl p-4 flex flex-wrap gap-4">
        <div className="flex-shrink-0">
          <p className="text-xs text-gray-500 uppercase tracking-wider">N° Orden</p>
          <p className="text-xl font-mono neon-text font-bold">{numOrden}</p>
        </div>
        <div className="flex-shrink-0">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Fecha</p>
          <input
            type="date"
            value={fechaOrden}
            onChange={(e) => setFechaOrden(e.target.value)}
            className="input-field w-44"
          />
        </div>
        <div className="flex-shrink-0">
          <p className="text-xs text-gray-500 uppercase tracking-wider">IVA Vigente</p>
          <p className="text-lg text-gray-900 dark:text-white">{porcentajeIva}%</p>
        </div>
        <div className="flex-1 min-w-[220px]">
          <MultiLineDropdown
            label="Cuenta BC"
            items={cuentasCatalogo}
            value={cuentaBcSeleccionada}
            onChange={(cuenta) => {
              setCuentaBcSeleccionada(cuenta);
              const cuentaInfo = cuentasCatalogo.find((c) => c.cuenta_bancaria === cuenta);
              if (cuentaInfo?.siguiente_numero_transfer) {
                setNumCheque(String(cuentaInfo.siguiente_numero_transfer));
                chequeEditadoManualmenteRef.current = false;
              }

              const banco = cuentasBancarias.find((c) => c.cuenta_bancaria === cuenta);
              setCodigoBancoSeleccionado(banco?.codigo_banco || '');
            }}
            placeholder="Seleccionar cuenta..."
            disabled={false}
            getKey={(item) => item.cuenta_bancaria}
            getDisplay={(item) => [
              item.cuenta_bancaria,
              item.descripcion_cuenta || item.cuenta_bancaria,
            ]}
          />
        </div>
        <div className="flex-shrink-0">
          <p className="text-xs text-gray-500 uppercase tracking-wider">N° Cheque</p>
          <input
            type="text"
            value={numCheque}
            onChange={(e) => {
              setNumCheque(e.target.value.toUpperCase());
              chequeEditadoManualmenteRef.current = true;
            }}
            className="input-field font-mono text-purple-400 font-bold w-32"
            placeholder="Auto"
            disabled={!isAdmin || !permitirEditarCheque}
          />
          {isAdmin && permitirEditarCheque ? (
            <p className="mt-1 text-[11px] text-gray-500">Editable por administradores</p>
          ) : (
            <p className="mt-1 text-[11px] text-gray-500">Auto-generado</p>
          )}
        </div>
      </div>

      {/* Beneficiario */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass relative z-40 rounded-2xl p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center text-dark-900 text-sm font-bold">1</span>
          Beneficiario
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="relative">
            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Buscar Beneficiario</label>
            <div className="relative">
              <HiOutlineMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                value={busqueda}
                onChange={(e) => { setBusqueda(e.target.value); setNombreBeneficiario(e.target.value); }}
                className="input-field pl-10"
                placeholder="Nombre o RUC/CI..."
              />
            </div>
            {showResults && resultados.length > 0 && (
              <div className="absolute z-50 top-full left-0 right-0 mt-2 rounded-xl max-h-48 overflow-y-auto bg-white dark:bg-dark-800 border border-gray-300 dark:border-white/10 shadow-xl">
                {resultados.map(b => (
                  <button
                    key={b.id}
                    onClick={() => selectBeneficiario(b)}
                    className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors border-b border-gray-200 dark:border-white/5 last:border-b-0"
                  >
                    <p className="text-sm text-gray-900 dark:text-white font-medium">{b.nombre}</p>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">{b.ruc_cedula}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">RUC / Cédula</label>
            <input
              type="text"
              value={codigoBeneficiario}
              onChange={(e) => setCodigoBeneficiario(e.target.value)}
              className="input-field"
              placeholder="0691786489001"
            />
          </div>
        </div>
      </motion.div>

      {/* Detalle */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass relative z-10 rounded-2xl p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-400 to-pink-500 flex items-center justify-center text-white text-sm font-bold">2</span>
          Concepto / Detalle
        </h2>
        <textarea
          value={detalle}
          onChange={(e) => setDetalle(e.target.value)}
          rows={5}
          className="input-field"
          placeholder="Detalle del pago, anexos, memorandos, oficios..."
        />
      </motion.div>

      {/* Valores */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="glass relative z-10 rounded-2xl p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center text-dark-900 text-sm font-bold">3</span>
          Valores
        </h2>
        <div className="flex items-center justify-between rounded-xl border border-cyan-400/20 bg-gradient-to-r from-cyan-500/10 to-blue-500/10 px-3 py-2">
          <div>
            <p className="text-sm font-medium text-gray-800 dark:text-gray-100">Aplicar IVA</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Desactívelo para vacaciones, atrasos u órdenes sin impuesto</p>
          </div>
          <button
            type="button"
            onClick={() => {
              const checked = !aplicaIva;
              setAplicaIva(checked);
              if (!checked) {
                setPorcentajeIva('0');
                setValorIva('0.00');
                return;
              }

              if ((parseFloat(porcentajeIva) || 0) <= 0) {
                setPorcentajeIva(String(config?.iva_porcentaje || '15'));
              }
            }}
            className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${aplicaIva ? 'bg-cyan-500' : 'bg-gray-300 dark:bg-dark-600'}`}
            aria-pressed={aplicaIva}
            aria-label="Aplicar IVA"
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${aplicaIva ? 'translate-x-6' : 'translate-x-1'}`}
            />
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Valor (Subtotal)</label>
            <input type="number" step="0.01" value={valorPlanilla} onChange={(e) => setValorPlanilla(e.target.value)} className="input-field" placeholder="0.00" />
          </div>
          <div>
            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">% IVA</label>
            <input type="number" step="0.01" value={porcentajeIva} onChange={(e) => setPorcentajeIva(e.target.value)} className="input-field" placeholder="15" disabled={!aplicaIva} />
          </div>
          <div>
            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Valor IVA</label>
            <input type="number" step="0.01" value={valorIva} onChange={(e) => setValorIva(e.target.value)} className="input-field bg-gray-100 dark:bg-dark-600" disabled={!aplicaIva} />
          </div>
          <div className="flex items-end">
            <div className="w-full p-3 rounded-xl bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border border-cyan-500/20">
              <p className="text-xs text-cyan-400">Subtotal + IVA</p>
              <p className="text-lg font-bold neon-text">${formatMoney(vp + vi)}</p>
            </div>
          </div>
        </div>

        {/* Otros cargos */}
        <div className="border-t border-gray-200/70 dark:border-white/5 pt-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-gray-600 dark:text-gray-400">Otros Cargos</p>
            <button onClick={addOtroCargo} className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1">
              <HiOutlinePlus className="w-4 h-4" /> Agregar
            </button>
          </div>
          {otrosCargos.map((c, i) => (
            <div key={i} className="flex gap-3 mb-2">
              <input type="text" value={c.razon} onChange={(e) => updateOtroCargo(i, 'razon', e.target.value)} className="input-field flex-1 text-sm" placeholder="Concepto" />
              <input type="number" step="0.01" value={c.valor} onChange={(e) => updateOtroCargo(i, 'valor', e.target.value)} className="input-field w-32 text-sm" placeholder="0.00" />
              <button onClick={() => removeOtroCargo(i)} className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg"><HiOutlineTrash className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Retenciones */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="glass relative z-10 rounded-2xl p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-400 to-rose-500 flex items-center justify-center text-white text-sm font-bold">4</span>
          Retenciones
        </h2>
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm text-gray-600 dark:text-gray-400">Agregue las retenciones aplicables</p>
          <button onClick={addRetencion} className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1">
            <HiOutlinePlus className="w-4 h-4" /> Agregar Retención
          </button>
        </div>
        {retenciones.map((r, i) => (
          <div key={i} className="grid grid-cols-12 gap-2 items-end">
            <div className="col-span-3">
              {i === 0 && <label className="block text-xs text-gray-500 mb-1">Catálogo</label>}
              <select value={r.catalogoId || ''} onChange={(e) => selectRetCatalogo(i, e.target.value)} className="input-field text-sm">
                <option value="">Seleccionar...</option>
                {retencionesCatalogo.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.nombre}</option>
                ))}
              </select>
            </div>
            <div className="col-span-3">
              {i === 0 && <label className="block text-xs text-gray-500 mb-1">Concepto</label>}
              <input type="text" value={r.concepto} onChange={(e) => updateRetencion(i, 'concepto', e.target.value)} className="input-field text-sm" placeholder="Concepto" />
            </div>
            <div className="col-span-2">
              {i === 0 && <label className="block text-xs text-gray-500 mb-1">Base</label>}
              <input type="number" step="0.01" value={r.base} onChange={(e) => updateRetencion(i, 'base', e.target.value)} className="input-field text-sm" placeholder="0.00" />
            </div>
            <div className="col-span-1">
              {i === 0 && <label className="block text-xs text-gray-500 mb-1">%</label>}
              <input type="number" step="0.001" value={r.porcentaje} onChange={(e) => updateRetencion(i, 'porcentaje', e.target.value)} className="input-field text-sm" placeholder="0" />
            </div>
            <div className="col-span-2">
              {i === 0 && <label className="block text-xs text-gray-500 mb-1">Valor</label>}
              <input type="number" step="0.01" value={r.valor} onChange={(e) => updateRetencion(i, 'valor', e.target.value)} className="input-field text-sm bg-gray-100 dark:bg-dark-600" placeholder="0.00" />
            </div>
            <div className="col-span-1">
              <button onClick={() => removeRetencion(i)} className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg"><HiOutlineTrash className="w-4 h-4" /></button>
            </div>
          </div>
        ))}

        <div className="border-t border-gray-200/70 dark:border-white/5 pt-4 mt-2">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-gray-600 dark:text-gray-400">Retención Manual (Concepto + Valor)</p>
            <button onClick={addRetencionManual} className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1">
              <HiOutlinePlus className="w-4 h-4" /> Agregar
            </button>
          </div>
          {retencionesManuales.map((r, i) => (
            <div key={i} className="flex gap-3 mb-2">
              <input
                type="text"
                value={r.concepto}
                onChange={(e) => updateRetencionManual(i, 'concepto', e.target.value)}
                className="input-field flex-1 text-sm"
                placeholder="Concepto"
              />
              <input
                type="number"
                step="0.01"
                value={r.valor}
                onChange={(e) => updateRetencionManual(i, 'valor', e.target.value)}
                className="input-field w-32 text-sm"
                placeholder="0.00"
              />
              <button onClick={() => removeRetencionManual(i)} className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg">
                <HiOutlineTrash className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Summary */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="glass relative z-10 neon-border rounded-2xl p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Resumen</h2>
        <div className="grid grid-cols-3 gap-6">
          <div className="text-center p-4 rounded-xl bg-gray-100/80 dark:bg-white/5">
            <p className="text-xs text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-1">Total Cargos</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">${formatMoney(totalCargos)}</p>
          </div>
          <div className="text-center p-4 rounded-xl bg-red-500/10 border border-red-500/20">
            <p className="text-xs text-red-400 uppercase tracking-wider mb-1">Total Retenciones</p>
            <p className="text-2xl font-bold text-red-400">${formatMoney(totalRetenciones)}</p>
          </div>
          <div className="text-center p-4 rounded-xl bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border border-cyan-500/30">
            <p className="text-xs text-cyan-400 uppercase tracking-wider mb-1">Líquido a Pagar</p>
            <p className="text-3xl font-bold neon-text">${formatMoney(liquidoPagar)}</p>
          </div>
        </div>

        <div className="flex gap-3 mt-6 justify-end">
          <button onClick={() => navigate('/ordenes-pago')} className="btn-secondary text-sm">Cancelar</button>
          <button onClick={() => handleSubmit(false)} disabled={loading} className="btn-secondary text-sm">
            {loading ? 'Guardando...' : 'Guardar'}
          </button>
          <button onClick={() => handleSubmit(true)} disabled={loading} className="btn-primary text-sm">
            {loading ? 'Generando...' : 'Guardar y Generar PDF'}
          </button>
        </div>
      </motion.div>

      {/* PDF Viewer Modal */}
      {showPdfViewer && (
        <PdfViewer
          pdfUrl={pdfUrl}
          numeroOrden={pdfNumOrden}
          onClose={() => {
            setShowPdfViewer(false);
            navigate('/ordenes-pago');
          }}
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
              <p className="text-sm font-medium text-gray-900 dark:text-white mb-1">Generando PDF</p>
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
                <p className="text-xs font-semibold text-cyan-400">{downloadProgress?.percent || 10}%</p>
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
