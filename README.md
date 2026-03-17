# Sistema Financiero GAD Municipal de Chunchi

Sistema web para la gestión de Órdenes de Pago del GAD Municipal de Chunchi.  
Migrado desde Microsoft Access — 6,895 registros históricos importados.

## Stack

- **Backend**: Express.js 5 + PostgreSQL (puerto 3001)
- **Frontend**: React 19 + Vite + Tailwind CSS (puerto 5173)
- **Base de datos**: PostgreSQL — `financiero_gad_chunchi`, schema `financiero`
- **Documentos**: PDF (Puppeteer) + Word (docx)

## Usuarios por defecto

| Usuario | Contraseña | Rol |
|---------|-----------|-----|
| admin | admin123 | Administrador |
| financiero | financiero123 | Financiero |

> ⚠️ **Cambiar las contraseñas después del primer inicio de sesión.**

## Inicio rápido (desarrollo)

```bash
# Backend
cd backend
npm install
node src/config/init-db.js   # Solo la primera vez
node src/app.js              # Inicia en puerto 3001

# Frontend (otra terminal)
cd frontend
npm install
npx vite --host              # Inicia en puerto 5173
```

## Base de datos (primera vez)

```bash
createdb financiero_gad_chunchi
psql financiero_gad_chunchi -f database/schema.sql
cd backend && node src/config/init-db.js
# Migrar datos históricos de Access:
python3 database/migrar_ordenes_pago.py
```

## Despliegue en servidor Linux

```bash
# Construir frontend
cd frontend && npm run build

# Configurar backend en producción
cd backend
cp .env .env.production
# Editar .env.production con credenciales del servidor
NODE_ENV=production node src/app.js
# El backend sirve el frontend desde frontend/dist/
```

## Variables de entorno (backend/.env)

```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=financiero_gad_chunchi
DB_USER=postgres
DB_PASSWORD=tu_password
JWT_SECRET=cambia_esto_en_produccion
PORT=3001
```

## Funcionalidades

- ✅ Login con JWT (roles: admin, financiero, auditor)
- ✅ Listado de órdenes de pago con búsqueda y filtros
- ✅ Crear nueva orden de pago (auto-numerada)
- ✅ Editar orden de pago
- ✅ Anular orden de pago con motivo
- ✅ Generar comprobante en **PDF** y **Word**
- ✅ Gestión de beneficiarios con autocompletado
- ✅ Configuración: IVA, firmantes, catálogo de retenciones
- ✅ Auditoría completa de cambios
- ✅ 6,895 registros históricos migrados desde Access

