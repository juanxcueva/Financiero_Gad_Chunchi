import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { HiOutlinePlus, HiOutlineTrash, HiOutlineMagnifyingGlass } from 'react-icons/hi2';
import api from '../services/api';
import toast from 'react-hot-toast';
import MultiLineDropdown from '../components/MultiLineDropdown';

const formatMoney = (v) => parseFloat(v || 0).toFixed(2);

export default function EditarOrden() {
  const { id } = useParams();
  const navigate = useNavigate();
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
  const isAdmin = currentUser?.rol === 'admin';
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [orden, setOrden] = useState(null);
  const [retencionesCatalogo, setRetencionesCatalogo] = useState([]);

  const [cuentasBancarias, setCuentasBancarias] = useState([]);
  const [cuentasBCCatalogo, setCuentasBCCatalogo] = useState([]);
  const [cuentaBcSeleccionada, setCuentaBcSeleccionada] = useState('');
  const [codigoBancoSeleccionado, setCodigoBancoSeleccionado] = useState('');
  const [numCheque, setNumCheque] = useState('');
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
  const [permitirEditarCheque, setPermitirEditarCheque] = useState(false);
  const [fechaOrden, setFechaOrden] = useState('');

  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState([]);
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get(`/ordenes-pago/${id}`),
      api.get('/configuracion/retenciones-catalogo'),
      api.get('/ordenes-pago/cuentas-bancarias'),
      api.get('/configuracion'),
    ]).then(([ordenRes, retRes, cuentasRes, cfgRes]) => {
      const o = ordenRes.data.data;
      setOrden(o);
      setCodigoBeneficiario(o.codigo_beneficiario || '');
      setNombreBeneficiario(o.nombre_beneficiario || '');
      setBusqueda(o.nombre_beneficiario || '');
      setDetalle(o.detalle || '');
      setValorPlanilla(String(o.valor_planilla || ''));
      const pct = parseFloat(o.porcentaje_iva) || 0;
      const val = parseFloat(o.valor_iva) || 0;
      setAplicaIva(pct > 0 || val > 0);
      setPorcentajeIva(String(pct));
      setValorIva(String(val.toFixed(2)));
      setOtrosCargos(o.otros_cargos?.length ? o.otros_cargos : []);
      setCuentaBcSeleccionada(o.cuenta_banco_central || '');
      setCodigoBancoSeleccionado(o.codigo_banco || '');
      setNumCheque(o.cheque_numero || '');
        setFechaOrden(o.fecha_orden ? o.fecha_orden.split('T')[0] : '');
      setCuentasBancarias(cuentasRes.data.data || []);
      setCuentasBCCatalogo(cuentasRes.data.cuentas_bc || []);
      const cfg = cfgRes.data.data || {};
      setPermitirEditarCheque(['1', 'true', 'si', 'sí', 'yes'].includes(String(cfg.permitir_editar_cheque || '').toLowerCase()));
      const retencionesOrden = o.retenciones?.length ? o.retenciones : [];
      const retencionesDesdeCatalogo = retencionesOrden
        .filter(r => !(r.tipo === 'OTRO' && (parseFloat(r.base_imponible) || 0) === 0 && (parseFloat(r.porcentaje) || 0) === 0))
        .map(r => ({
          tipo: r.tipo,
          concepto: r.concepto,
          base: String(r.base_imponible || ''),
          porcentaje: String(r.porcentaje || ''),
          valor: String(r.valor || ''),
        }));
      const retencionesManuales = retencionesOrden
        .filter(r => r.tipo === 'OTRO' && (parseFloat(r.base_imponible) || 0) === 0 && (parseFloat(r.porcentaje) || 0) === 0)
        .map(r => ({
          concepto: r.concepto,
          valor: String(r.valor || ''),
        }));
      setRetenciones(retencionesDesdeCatalogo);
      setRetencionesManuales(retencionesManuales);
      setRetencionesCatalogo(retRes.data.data);
      setLoading(false);
    }).catch(() => { toast.error('Error cargando orden'); navigate('/ordenes-pago'); });
  }, [id, navigate]);

  useEffect(() => {
    if (!aplicaIva) {
      setValorIva('0.00');
      return;
    }

    const vp = parseFloat(valorPlanilla) || 0;
    const pct = parseFloat(porcentajeIva) || 0;
    setValorIva((vp * pct / 100).toFixed(2));
  }, [valorPlanilla, porcentajeIva, aplicaIva]);

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

  const addOtroCargo = () => setOtrosCargos([...otrosCargos, { razon: '', valor: '' }]);
  const removeOtroCargo = (i) => setOtrosCargos(otrosCargos.filter((_, idx) => idx !== i));
  const updateOtroCargo = (i, field, val) => { const c = [...otrosCargos]; c[i][field] = val; setOtrosCargos(c); };

  const addRetencion = () => setRetenciones([...retenciones, { tipo: 'IVA', concepto: '', base: '', porcentaje: '', valor: '' }]);
  const removeRetencion = (i) => setRetenciones(retenciones.filter((_, idx) => idx !== i));
  const updateRetencion = (i, field, val) => {
    const copy = [...retenciones];
    copy[i][field] = val;
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

  const vp = parseFloat(valorPlanilla) || 0;
  const vi = parseFloat(valorIva) || 0;
  const totalOtrosCargos = otrosCargos.reduce((s, c) => s + (parseFloat(c.valor) || 0), 0);
  const totalCargos = vp + vi + totalOtrosCargos;
  const totalRetencionesCatalogo = retenciones.reduce((s, r) => s + (parseFloat(r.valor) || 0), 0);
  const totalRetencionesManuales = retencionesManuales.reduce((s, r) => s + (parseFloat(r.valor) || 0), 0);
  const totalRetenciones = totalRetencionesCatalogo + totalRetencionesManuales;
  const liquidoPagar = totalCargos - totalRetenciones;

  const handleSubmit = async () => {
    if (!nombreBeneficiario.trim()) return toast.error('Ingrese el beneficiario');
    if (!detalle.trim()) return toast.error('Ingrese el detalle');
    if (detalle.trim().length < 10) return toast.error('El detalle debe tener al menos 10 caracteres');
    if (totalCargos <= 0) return toast.error('Ingrese al menos un valor en Subtotal u Otros Cargos');

    setSaving(true);
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

      // Add bank and check number if selected
      if (cuentaBcSeleccionada) {
        body.cuenta_banco_central = cuentaBcSeleccionada;
      }
      if (isAdmin && numCheque && permitirEditarCheque) {
        body.cheque_numero = numCheque;
      }
      await api.put(`/ordenes-pago/${id}`, body);
      toast.success('Orden actualizada');
      navigate('/ordenes-pago');
    } catch (err) {
      const details = err.response?.data?.details;
      if (Array.isArray(details) && details.length > 0 && details[0]?.message) {
        toast.error(details[0].message);
      } else {
        toast.error(err.response?.data?.error || 'Error al actualizar');
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin w-10 h-10 border-2 border-cyan-400 border-t-transparent rounded-full" /></div>;

  const disabled = orden?.estado === 'ANULADO';

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Editar Orden de Pago</h1>
        <p className="text-gray-500 text-sm">N° {orden?.numero_orden} — {orden?.estado}</p>
      </motion.div>

      {disabled && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-400 text-sm">
          Esta orden está ANULADA y no puede ser modificada.
        </div>
      )}

      {/* Info bar */}
      <div className="glass rounded-2xl p-4 flex flex-wrap gap-4">
        <div className="flex-shrink-0">
          <p className="text-xs text-gray-500 uppercase">N° Orden</p>
          <p className="text-xl font-mono neon-text font-bold">{orden?.numero_orden}</p>
        </div>
        <div className="flex-shrink-0">
          <p className="text-xs text-gray-500 uppercase">Fecha Creación</p>
          <input
            type="date"
            value={fechaOrden}
            onChange={(e) => setFechaOrden(e.target.value)}
            disabled={disabled}
            className="input-field"
          />
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
              }

              const banco = cuentasBancarias.find((c) => c.cuenta_bancaria === cuenta);
              setCodigoBancoSeleccionado(banco?.codigo_banco || '');
            }}
            placeholder="Seleccionar cuenta..."
            disabled={disabled}
            getKey={(item) => item.cuenta_bancaria}
            getDisplay={(item) => [
              item.cuenta_bancaria,
              item.descripcion_cuenta || item.cuenta_bancaria,
            ]}
          />
        </div>
        <div className="flex-shrink-0">
          <p className="text-xs text-gray-500 uppercase">N° Cheque</p>
          <input
            type="text"
            value={numCheque}
            onChange={(e) => setNumCheque(e.target.value.toUpperCase())}
            className="input-field font-mono text-purple-400 font-bold w-32"
            placeholder="—"
            disabled={disabled || !isAdmin || !permitirEditarCheque}
          />
        </div>
      </div>

      {/* Beneficiario */}
      <div className="glass relative z-40 rounded-2xl p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Beneficiario</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="relative">
            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Buscar</label>
            <div className="relative">
              <HiOutlineMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input type="text" value={busqueda} onChange={(e) => { setBusqueda(e.target.value); setNombreBeneficiario(e.target.value); }} className="input-field pl-10" disabled={disabled} />
            </div>
            {showResults && resultados.length > 0 && (
              <div className="absolute z-50 top-full left-0 right-0 mt-2 rounded-xl max-h-48 overflow-y-auto bg-white dark:bg-dark-800 border border-gray-300 dark:border-white/10 shadow-xl">
                {resultados.map(b => (
                  <button key={b.id} onClick={() => selectBeneficiario(b)} className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-white/10 border-b border-gray-200 dark:border-white/5 last:border-b-0">
                    <p className="text-sm text-gray-900 dark:text-white font-medium">{b.nombre}</p>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">{b.ruc_cedula}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">RUC / Cédula</label>
            <input type="text" value={codigoBeneficiario} onChange={(e) => setCodigoBeneficiario(e.target.value)} className="input-field" disabled={disabled} />
          </div>
        </div>
      </div>

      {/* Detalle */}
      <div className="glass relative z-10 rounded-2xl p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Detalle</h2>
        <textarea value={detalle} onChange={(e) => setDetalle(e.target.value)} rows={5} className="input-field" disabled={disabled} />
      </div>

      {/* Valores */}
      <div className="glass relative z-10 rounded-2xl p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Valores</h2>
        <div className="flex items-center justify-between rounded-xl border border-cyan-400/20 bg-gradient-to-r from-cyan-500/10 to-blue-500/10 px-3 py-2">
          <div>
            <p className="text-sm font-medium text-gray-800 dark:text-gray-100">Aplicar IVA</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Desactívelo cuando la orden no tenga impuesto</p>
          </div>
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              const checked = !aplicaIva;
              setAplicaIva(checked);
              if (!checked) {
                setPorcentajeIva('0');
                setValorIva('0.00');
              }
            }}
            className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${aplicaIva ? 'bg-cyan-500' : 'bg-gray-300 dark:bg-dark-600'} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            aria-pressed={aplicaIva}
            aria-label="Aplicar IVA"
          >
            <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${aplicaIva ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Valor (Subtotal)</label>
            <input type="number" step="0.01" value={valorPlanilla} onChange={(e) => setValorPlanilla(e.target.value)} className="input-field" disabled={disabled} />
          </div>
          <div>
            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">% IVA</label>
            <input type="number" step="0.01" value={porcentajeIva} onChange={(e) => setPorcentajeIva(e.target.value)} className="input-field" disabled={disabled || !aplicaIva} />
          </div>
          <div>
            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Valor IVA</label>
            <input type="number" step="0.01" value={valorIva} className="input-field bg-gray-100 dark:bg-dark-600" readOnly disabled={!aplicaIva} />
          </div>
          <div className="flex items-end">
            <div className="w-full p-3 rounded-xl bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border border-cyan-500/20">
              <p className="text-xs text-cyan-400">Sub + IVA</p>
              <p className="text-lg font-bold neon-text">${formatMoney(vp + vi)}</p>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-200/70 dark:border-white/5 pt-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-gray-600 dark:text-gray-400">Otros Cargos</p>
            {!disabled && <button onClick={addOtroCargo} className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1"><HiOutlinePlus className="w-4 h-4" /> Agregar</button>}
          </div>
          {otrosCargos.map((c, i) => (
            <div key={i} className="flex gap-3 mb-2">
              <input type="text" value={c.razon} onChange={(e) => updateOtroCargo(i, 'razon', e.target.value)} className="input-field flex-1 text-sm" disabled={disabled} />
              <input type="number" step="0.01" value={c.valor} onChange={(e) => updateOtroCargo(i, 'valor', e.target.value)} className="input-field w-32 text-sm" disabled={disabled} />
              {!disabled && <button onClick={() => removeOtroCargo(i)} className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg"><HiOutlineTrash className="w-4 h-4" /></button>}
            </div>
          ))}
        </div>
      </div>

      {/* Retenciones */}
      <div className="glass relative z-10 rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Retenciones</h2>
          {!disabled && <button onClick={addRetencion} className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1"><HiOutlinePlus className="w-4 h-4" /> Agregar</button>}
        </div>
        {retenciones.map((r, i) => (
          <div key={i} className="grid grid-cols-12 gap-2 items-end">
            <div className="col-span-3">
              <select onChange={(e) => selectRetCatalogo(i, e.target.value)} className="input-field text-sm" defaultValue="" disabled={disabled}>
                <option value="">Catálogo...</option>
                {retencionesCatalogo.map(cat => <option key={cat.id} value={cat.id}>{cat.nombre}</option>)}
              </select>
            </div>
            <div className="col-span-3">
              <input type="text" value={r.concepto} onChange={(e) => updateRetencion(i, 'concepto', e.target.value)} className="input-field text-sm" disabled={disabled} />
            </div>
            <div className="col-span-2">
              <input type="number" step="0.01" value={r.base} onChange={(e) => updateRetencion(i, 'base', e.target.value)} className="input-field text-sm" disabled={disabled} />
            </div>
            <div className="col-span-1">
              <input type="number" step="0.001" value={r.porcentaje} onChange={(e) => updateRetencion(i, 'porcentaje', e.target.value)} className="input-field text-sm" disabled={disabled} />
            </div>
            <div className="col-span-2">
              <input type="number" step="0.01" value={r.valor} className="input-field text-sm bg-gray-100 dark:bg-dark-600" readOnly />
            </div>
            <div className="col-span-1">
              {!disabled && <button onClick={() => removeRetencion(i)} className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg"><HiOutlineTrash className="w-4 h-4" /></button>}
            </div>
          </div>
        ))}

        <div className="border-t border-gray-200/70 dark:border-white/5 pt-4 mt-2">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-gray-600 dark:text-gray-400">Retención Manual (Concepto + Valor)</p>
            {!disabled && <button onClick={addRetencionManual} className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1"><HiOutlinePlus className="w-4 h-4" /> Agregar</button>}
          </div>
          {retencionesManuales.map((r, i) => (
            <div key={i} className="flex gap-3 mb-2">
              <input
                type="text"
                value={r.concepto}
                onChange={(e) => updateRetencionManual(i, 'concepto', e.target.value)}
                className="input-field flex-1 text-sm"
                placeholder="Concepto"
                disabled={disabled}
              />
              <input
                type="number"
                step="0.01"
                value={r.valor}
                onChange={(e) => updateRetencionManual(i, 'valor', e.target.value)}
                className="input-field w-32 text-sm"
                placeholder="0.00"
                disabled={disabled}
              />
              {!disabled && <button onClick={() => removeRetencionManual(i)} className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg"><HiOutlineTrash className="w-4 h-4" /></button>}
            </div>
          ))}
        </div>
      </div>

      {/* Summary */}
      <div className="glass relative z-10 neon-border rounded-2xl p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Resumen</h2>
        <div className="grid grid-cols-3 gap-6">
          <div className="text-center p-4 rounded-xl bg-gray-100/80 dark:bg-white/5">
            <p className="text-xs text-gray-600 dark:text-gray-400 uppercase mb-1">Total Cargos</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">${formatMoney(totalCargos)}</p>
          </div>
          <div className="text-center p-4 rounded-xl bg-red-500/10 border border-red-500/20">
            <p className="text-xs text-red-400 uppercase mb-1">Total Retenciones</p>
            <p className="text-2xl font-bold text-red-400">${formatMoney(totalRetenciones)}</p>
          </div>
          <div className="text-center p-4 rounded-xl bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border border-cyan-500/30">
            <p className="text-xs text-cyan-400 uppercase mb-1">Líquido a Pagar</p>
            <p className="text-3xl font-bold neon-text">${formatMoney(liquidoPagar)}</p>
          </div>
        </div>
        <div className="flex gap-3 mt-6 justify-end">
          <button onClick={() => navigate('/ordenes-pago')} className="btn-secondary text-sm">Volver</button>
          {!disabled && (
            <button onClick={handleSubmit} disabled={saving} className="btn-primary text-sm">
              {saving ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
      if (fechaOrden) {
        body.fecha_orden = fechaOrden;
      }
