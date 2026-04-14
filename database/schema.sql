-- ============================================================================
-- SCHEMA: Sistema de Órdenes de Pago - GAD Municipal de Chunchi
-- Base de datos: financiero_gad_chunchi
-- Fecha: 2026-03-12
-- ============================================================================

-- Extensiones
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Schema principal
CREATE SCHEMA IF NOT EXISTS financiero;

-- ============================================================================
-- TABLA: usuarios
-- ============================================================================
CREATE TABLE financiero.usuarios (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    nombre_completo VARCHAR(200) NOT NULL,
    email VARCHAR(200),
    rol VARCHAR(20) NOT NULL CHECK (rol IN ('admin', 'financiero', 'auditor')),
    activo BOOLEAN DEFAULT true,
    ultimo_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================================
-- TABLA: beneficiarios
-- ============================================================================
CREATE TABLE financiero.beneficiarios (
    id SERIAL PRIMARY KEY,
    ruc_cedula VARCHAR(20) NOT NULL,
    nombre VARCHAR(200) NOT NULL,
    tipo_cuenta VARCHAR(20),
    cuenta_bancaria VARCHAR(50),
    banco VARCHAR(100),
    direccion VARCHAR(300),
    telefono VARCHAR(50),
    email VARCHAR(200),
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_beneficiarios_ruc ON financiero.beneficiarios(ruc_cedula);
CREATE INDEX idx_beneficiarios_nombre ON financiero.beneficiarios USING gin(nombre gin_trgm_ops);

-- ============================================================================
-- TABLA: configuracion
-- ============================================================================
CREATE TABLE financiero.configuracion (
    id SERIAL PRIMARY KEY,
    clave VARCHAR(100) UNIQUE NOT NULL,
    valor TEXT NOT NULL,
    descripcion VARCHAR(300),
    updated_at TIMESTAMP DEFAULT NOW(),
    updated_by INTEGER REFERENCES financiero.usuarios(id)
);

-- ============================================================================
-- TABLA: firmantes
-- ============================================================================
CREATE TABLE financiero.firmantes (
    id SERIAL PRIMARY KEY,
    cargo VARCHAR(100) NOT NULL,
    nombre VARCHAR(200) NOT NULL,
    orden INTEGER DEFAULT 0,
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================================
-- TABLA: retenciones_catalogo
-- ============================================================================
CREATE TABLE financiero.retenciones_catalogo (
    id SERIAL PRIMARY KEY,
    codigo VARCHAR(20),
    nombre VARCHAR(100) NOT NULL,
    tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('IVA', 'IR', 'OTRO')),
    porcentaje NUMERIC(6,3) NOT NULL,
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================================
-- TABLA: cuentas_bancarias
-- ============================================================================
CREATE TABLE financiero.cuentas_bancarias (
    id SERIAL PRIMARY KEY,
    codigo_banco VARCHAR(20) UNIQUE NOT NULL,
    nombre_banco VARCHAR(200) NOT NULL,
    cuenta_bancaria VARCHAR(50) NOT NULL,
    descripcion_cuenta VARCHAR(200),
    descripcion_banco VARCHAR(300),
    siguiente_numero_cheque INTEGER DEFAULT 1,
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_cuentas_codigo ON financiero.cuentas_bancarias(codigo_banco);

-- ============================================================================
-- TABLA: cuentas_bc_catalogo (catalogo Registro/Cuenta BC de Access)
-- ============================================================================
CREATE TABLE financiero.cuentas_bc_catalogo (
    id SERIAL PRIMARY KEY,
    cuenta_bancaria VARCHAR(50) UNIQUE NOT NULL,
    descripcion_cuenta VARCHAR(200),
    siguiente_numero_transfer INTEGER DEFAULT 1,
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_cuentas_bc_catalogo_cuenta ON financiero.cuentas_bc_catalogo(cuenta_bancaria);

-- ============================================================================
-- TABLA: auditoria_cheques (cambios manuales de secuencia/numero)
-- ============================================================================
CREATE TABLE financiero.auditoria_cheques (
    id SERIAL PRIMARY KEY,
    orden_pago_id INTEGER,
    accion VARCHAR(30) NOT NULL CHECK (accion IN ('MANUAL_OVERRIDE_CREAR', 'MANUAL_OVERRIDE_EDITAR')),
    codigo_banco VARCHAR(20),
    cheque_anterior VARCHAR(20),
    cheque_nuevo VARCHAR(20),
    motivo VARCHAR(300),
    usuario_id INTEGER REFERENCES financiero.usuarios(id),
    usuario_nombre VARCHAR(200),
    ip_address VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_auditoria_cheques_fecha ON financiero.auditoria_cheques(created_at);
CREATE INDEX idx_auditoria_cheques_orden ON financiero.auditoria_cheques(orden_pago_id);

-- ============================================================================
-- TABLA: ordenes_pago (principal)
-- ============================================================================
CREATE TABLE financiero.ordenes_pago (
    id SERIAL PRIMARY KEY,

    -- Identificación
    numero_orden INTEGER NOT NULL,
    tipo_comprobante VARCHAR(20) DEFAULT '4112',
    numero_comprobante VARCHAR(20),
    fecha DATE NOT NULL,
    situacion VARCHAR(20) DEFAULT 'ACTIVO',

    -- Beneficiario
    beneficiario_id INTEGER REFERENCES financiero.beneficiarios(id),
    codigo_beneficiario VARCHAR(20),
    nombre_beneficiario VARCHAR(200) NOT NULL,

    -- Cuentas bancarias
    cuenta_banco_central VARCHAR(20),
    codigo_inst_financiera VARCHAR(20),
    tipo_cuenta_beneficiario VARCHAR(5),
    cuenta_beneficiario VARCHAR(50),

    -- Detalle
    detalle TEXT NOT NULL,

    -- Valores
    valor_planilla NUMERIC(12,2) DEFAULT 0,
    valor_iva NUMERIC(12,2) DEFAULT 0,
    porcentaje_iva NUMERIC(5,2) DEFAULT 15,

    -- Otros cargos (hasta 5 conceptos adicionales)
    razon_otros_cargos VARCHAR(100),
    valor_otros_cargos NUMERIC(12,2) DEFAULT 0,
    razon_otros_cargos_1 VARCHAR(100),
    valor_otros_cargos_1 NUMERIC(12,2) DEFAULT 0,
    razon_otros_cargos_2 VARCHAR(100),
    valor_otros_cargos_2 NUMERIC(12,2) DEFAULT 0,
    razon_otros_cargos_3 VARCHAR(100),
    valor_otros_cargos_3 NUMERIC(12,2) DEFAULT 0,
    razon_otros_cargos_4 VARCHAR(100),
    valor_otros_cargos_4 NUMERIC(12,2) DEFAULT 0,
    razon_otros_cargos_5 VARCHAR(100),
    valor_otros_cargos_5 NUMERIC(12,2) DEFAULT 0,

    -- Totales calculados
    total_cargos NUMERIC(12,2) DEFAULT 0,
    total_retenciones NUMERIC(12,2) DEFAULT 0,
    liquido_pagar NUMERIC(12,2) DEFAULT 0,

    -- Cheque informativo
    codigo_banco VARCHAR(20),
    cheque_numero VARCHAR(20),
    valor_cheque NUMERIC(12,2) DEFAULT 0,

    -- Auditoría
    usuario_creacion INTEGER REFERENCES financiero.usuarios(id),
    usuario_modificacion INTEGER REFERENCES financiero.usuarios(id),
    motivo_anulacion TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    -- Campos originales de Access (para migración)
    access_num_orden_pago INTEGER,
    access_user_mov VARCHAR(20),
    access_fecha_comp TIMESTAMP,
    access_user_mod VARCHAR(20),
    access_fecha_mod TIMESTAMP
);

CREATE UNIQUE INDEX idx_ordenes_numero ON financiero.ordenes_pago(numero_orden);
CREATE INDEX idx_ordenes_fecha ON financiero.ordenes_pago(fecha);
CREATE INDEX idx_ordenes_beneficiario ON financiero.ordenes_pago(nombre_beneficiario);
CREATE INDEX idx_ordenes_situacion ON financiero.ordenes_pago(situacion);

ALTER TABLE financiero.auditoria_cheques
    ADD CONSTRAINT fk_auditoria_cheques_orden_pago
    FOREIGN KEY (orden_pago_id)
    REFERENCES financiero.ordenes_pago(id)
    ON DELETE SET NULL;

-- ============================================================================
-- TABLA: ordenes_pago_retenciones
-- ============================================================================
CREATE TABLE financiero.ordenes_pago_retenciones (
    id SERIAL PRIMARY KEY,
    orden_pago_id INTEGER NOT NULL REFERENCES financiero.ordenes_pago(id) ON DELETE CASCADE,
    tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('IVA', 'IR', 'OTRO')),
    concepto VARCHAR(100) NOT NULL,
    base NUMERIC(12,2) DEFAULT 0,
    porcentaje NUMERIC(6,3) DEFAULT 0,
    valor NUMERIC(12,2) DEFAULT 0
);
CREATE INDEX idx_retenciones_orden ON financiero.ordenes_pago_retenciones(orden_pago_id);

-- ============================================================================
-- TABLA: ordenes_pago_otros_valores (deducciones y extras del comprobante)
-- ============================================================================
CREATE TABLE financiero.ordenes_pago_otros_valores (
    id SERIAL PRIMARY KEY,
    orden_pago_id INTEGER NOT NULL REFERENCES financiero.ordenes_pago(id) ON DELETE CASCADE,
    tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('CARGO', 'DEDUCCION')),
    concepto VARCHAR(100) NOT NULL,
    valor NUMERIC(12,2) DEFAULT 0
);
CREATE INDEX idx_otros_valores_orden ON financiero.ordenes_pago_otros_valores(orden_pago_id);

-- ============================================================================
-- TABLA: auditoria
-- ============================================================================
CREATE TABLE financiero.auditoria (
    id SERIAL PRIMARY KEY,
    tabla VARCHAR(100) NOT NULL,
    registro_id INTEGER NOT NULL,
    accion VARCHAR(20) NOT NULL CHECK (accion IN ('CREAR', 'EDITAR', 'ANULAR', 'ELIMINAR')),
    datos_anteriores JSONB,
    datos_nuevos JSONB,
    usuario_id INTEGER REFERENCES financiero.usuarios(id),
    usuario_nombre VARCHAR(200),
    ip_address VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_auditoria_tabla ON financiero.auditoria(tabla, registro_id);
CREATE INDEX idx_auditoria_fecha ON financiero.auditoria(created_at);
CREATE INDEX idx_auditoria_usuario ON financiero.auditoria(usuario_id);

-- ============================================================================
-- DATOS INICIALES
-- ============================================================================

-- Configuración por defecto
INSERT INTO financiero.configuracion (clave, valor, descripcion) VALUES
    ('iva_porcentaje', '15', 'Porcentaje de IVA vigente'),
    ('institucion_nombre', 'GAD MUNICIPAL DE CHUNCHI', 'Nombre de la institución'),
    ('institucion_ruc', '', 'RUC de la institución'),
    ('cuenta_banco_central', '79220009', 'Cuenta del Banco Central del Ecuador'),
    ('codigo_banco', '1110303', 'Código del banco para cheques'),
    ('banco_nombre', 'Banco C. el Ecuador Matriz Quito', 'Nombre del banco'),
    ('permitir_editar_cheque', '0', 'Permitir edición manual del número de cheque'),
    ('siguiente_numero_orden', '29002', 'Siguiente número de orden de pago'),
    ('siguiente_numero_cheque', '26643', 'Siguiente número de cheque');

-- Cuentas bancarias de la institución (migradas desde Access)
INSERT INTO financiero.cuentas_bancarias (
    codigo_banco, nombre_banco, cuenta_bancaria, descripcion_cuenta, descripcion_banco, siguiente_numero_cheque
) VALUES
    ('1110303', 'Banco C. el Ecuador Matriz Quito', '79220009', 'CHEQUES UNICEF', 'Banco C. el Ecuador Matriz Quito Cta. Cte 79220099 PRAGUAS', 26643),
    ('1110302', 'Banco C. el Ecuador Matriz Quito', '79220009', 'TRANSFERENCIAS GENERALES', 'Banco C. el Ecuador Matriz Quito 79220099 PRAGUAS', 24801),
    ('1110309', 'Banco C. el Ecuador Matriz Quito', '79220337', 'CONVENIO 65393 BANCO DE DESARROLLO', 'Convenio 65393 Banco de Desarrollo', 24805),
    ('1110304', 'Banco C. el Ecuador BDE Credito CN', '79220009', 'TRANSFERENCIA MATERNIDAD GRATUITA', 'Banco C. el Ecuador BDE CREDITO CN 79220398', 25112),
    ('1110305', 'BCE Donaciones', '79220401', 'DONACIONES D/N', 'BCE - DONACIONES/DN 79220401', 7),
    ('1110310', 'Bco. Pichincha', '79220401', 'CHUNCHI INFA PE', 'Cta. 01523914-8 Bco. Pichincha Suc. Riobamba', 3),
    ('1110311', 'Banco Bolivariano', '79220398', 'GAD MUN-CANT CHUNCHI', 'GADCHUNCHI BDE CREDITO CN', 3)
ON CONFLICT (codigo_banco) DO NOTHING;

-- Catalogo Cuenta BC (APContabSPICuentasBC)
INSERT INTO financiero.cuentas_bc_catalogo (
    cuenta_bancaria, descripcion_cuenta, siguiente_numero_transfer
) VALUES
    ('41007717', 'CHEQUES UNICEF', 296),
    ('79220009', 'TRANSFERENCIAS GENERALES', 26289),
    ('79220061', 'TRANSFERENCIA MATERNIDAD GRATUITA', 3),
    ('79220074', 'TRANSFERENCIAS 65% imp renta', 172),
    ('79220075', 'TRANSFERENCIAS 35%', 151),
    ('79220196', 'CHUNCHI- INFA', 217),
    ('79220223', 'CHUNCHI INFA PE', 88),
    ('79220337', 'GAD MUN-CHUNCHI-DIRECCION DISTRITAL MIES DN', 440),
    ('79220389', 'GADCHUNCHI BDE CREDITO CN', 1),
    ('79220398', 'CONVENIO 65386 BD - GAD CHUNCHI', 8),
    ('79220401', 'CONVENIO 65393 BD - GAD CHUNCHI', 6)
ON CONFLICT (cuenta_bancaria) DO NOTHING;

-- Firmantes por defecto (basado en los datos del comprobante)
INSERT INTO financiero.firmantes (cargo, nombre, orden) VALUES
    ('Alcalde del Concejo', 'Lic. Jessica Reyes G.', 1),
    ('Jefe Financiero', 'Ing. Jhecenia Cabrera', 2),
    ('Tesorero', 'Ing. Fausto S.', 3),
    ('Dir.OO.PP.', 'Ing. Oswald G.', 4),
    ('G.Alm.', 'Lic. Benjamin C.', 5);

-- Retenciones comunes del catálogo
INSERT INTO financiero.retenciones_catalogo (codigo, nombre, tipo, porcentaje) VALUES
    ('RIV100', 'Retención IVA Servicios 100%', 'IVA', 100.000),
    ('RIV70', 'Retención IVA Servicios 70%', 'IVA', 70.000),
    ('RIV30', 'Retención IVA Bienes 30%', 'IVA', 30.000),
    ('RIR1', 'Retención IR 1%', 'IR', 1.000),
    ('RIR2', 'Retención IR 2%', 'IR', 2.000),
    ('RIR8', 'Retención IR 8%', 'IR', 8.000),
    ('RIR10', 'Retención IR 10%', 'IR', 10.000);

-- Usuario admin por defecto (password: admin123 - CAMBIAR EN PRODUCCIÓN)
-- El hash se genera en el backend al inicializar
