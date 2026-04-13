const { z } = require('zod');

// Esquemas comunes
const loginSchema = z.object({
  username: z.string().min(3, 'Usuario debe tener al menos 3 caracteres').max(50),
  password: z.string().min(6, 'Contraseña debe tener al menos 6 caracteres'),
});

const crearUsuarioSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(8, 'Contraseña debe tener al menos 8 caracteres'),
  nombre_completo: z.string().min(3).max(200),
  rol: z.enum(['admin', 'financiero', 'auditor']),
});

const editarUsuarioSchema = z.object({
  username: z.string().min(3).max(50).optional(),
  nombre_completo: z.string().min(3).max(200).optional(),
  rol: z.enum(['admin', 'financiero', 'auditor']).optional(),
  activo: z.boolean().optional(),
  password: z.string().min(8).optional(),
});

const cambiarPasswordSchema = z.object({
  password_actual: z.string().min(6),
  password_nueva: z.string().min(8, 'Nueva contraseña debe tener al menos 8 caracteres'),
});

const crearOrdenSchema = z.object({
  codigo_beneficiario: z.string().max(20).optional(),
  nombre_beneficiario: z.string().min(3).max(200),
  detalle: z.string().min(10, 'Detalle debe tener al menos 10 caracteres').max(2000),
  valor_planilla: z.number().min(0).max(999999999),
  porcentaje_iva: z.number().min(0).max(100).optional(),
  valor_iva: z.number().min(0).optional(),
  otros_cargos: z.array(
    z.object({
      razon: z.string().max(100),
      valor: z.number().min(0),
    })
  ).max(5).optional(),
  retenciones: z.array(
    z.object({
      tipo: z.enum(['IVA', 'IR', 'OTRO']),
      concepto: z.string().max(100),
      base: z.number().min(0).optional(),
      porcentaje: z.number().min(0).max(999.999),
      valor: z.number().min(0),
    })
  ).max(10).optional(),
  cuenta_banco_central: z.string().max(20).optional(),
  codigo_banco: z.string().max(20).optional(),
  cheque_numero: z.string().max(20).optional(),
  codigo_inst_financiera: z.string().max(20).optional(),
  tipo_cuenta_beneficiario: z.string().max(5).optional(),
  cuenta_beneficiario: z.string().max(50).optional(),
});

const editarOrdenSchema = crearOrdenSchema.partial();

const crearBeneficiarioSchema = z.object({
  ruc_cedula: z.string().min(10).max(20),
  nombre: z.string().min(3).max(200),
  tipo_cuenta: z.string().max(20).optional(),
  cuenta_bancaria: z.string().max(50).optional(),
  banco: z.string().max(100).optional(),
  direccion: z.string().max(300).optional(),
  telefono: z.string().max(50).optional(),
  email: z.string().email().optional(),
});

const editarBeneficiarioSchema = crearBeneficiarioSchema.partial();

const crearFirmanteSchema = z.object({
  cargo: z.string().min(3).max(100),
  nombre: z.string().min(3).max(200),
  orden: z.number().min(0).optional(),
});

const editarFirmanteSchema = crearFirmanteSchema.partial();

const crearRetencionSchema = z.object({
  codigo: z.string().max(20).optional(),
  nombre: z.string().min(3).max(100),
  tipo: z.enum(['IVA', 'IR', 'OTRO']),
  porcentaje: z.number().min(0).max(999.999),
});

const editarRetencionSchema = crearRetencionSchema.partial();

const actualizarConfiguracionSchema = z.record(z.string(), z.any());

// Validator middleware factory
function validateBody(schema) {
  return (req, res, next) => {
    try {
      const validated = schema.parse(req.body);
      req.validated = validated;
      next();
    } catch (err) {
      // Formato de error Zod
      const issues = err?.issues || err?.errors || [];
      const errors = issues.map(e => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      res.status(400).json({
        success: false,
        error: 'Datos invalidos',
        details: errors,
      });
    }
  };
}

function validateQuery(schema) {
  return (req, res, next) => {
    try {
      const validated = schema.parse(req.query);
      req.validatedQuery = validated;
      next();
    } catch (err) {
      const issues = err?.issues || err?.errors || [];
      const errors = issues.map(e => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      res.status(400).json({
        success: false,
        error: 'Parametros invalidos',
        details: errors,
      });
    }
  };
}

module.exports = {
  // Schemas
  loginSchema,
  crearUsuarioSchema,
  editarUsuarioSchema,
  cambiarPasswordSchema,
  crearOrdenSchema,
  editarOrdenSchema,
  crearBeneficiarioSchema,
  editarBeneficiarioSchema,
  crearFirmanteSchema,
  editarFirmanteSchema,
  crearRetencionSchema,
  editarRetencionSchema,
  actualizarConfiguracionSchema,

  // Middleware factories
  validateBody,
  validateQuery,
};
