# Guía de migración al servidor

Esta guía resume cómo llevar al servidor las nuevas tablas, cambios de backend y cambios de frontend del sistema financiero.

## Cuándo usar cada método

### 1. Servidor nuevo o base de datos vacía
Usa la migración completa.

```bash
cd /ruta/del/proyecto
export DB_HOST=localhost
export DB_PORT=5432
export DB_NAME=financiero_gad_chunchi
export DB_USER=tu_usuario
export DB_PASSWORD=tu_password
./database/migracion_completa.sh
```

Si ya subiste el archivo Access desde la interfaz, el script tomará automáticamente el archivo más reciente de `uploads/access`. Si quieres forzar uno específico, pásalo como primer argumento:

```bash
./database/migracion_completa.sh /ruta/al/archivo.mdb
```

Esto hace todo de una vez:
- recrea el schema `financiero`
- crea las tablas base
- inicializa usuarios
- exporta Access a CSV
- importa los datos históricos
- ejecuta validaciones finales

### 2. Servidor ya en producción
Si la base ya existe y solo quieres aplicar los cambios nuevos, NO uses la migración completa porque borra el schema.

Usa la migración incremental:

```bash
cd /ruta/del/proyecto/backend
npm install
npm run migrate-add-cuentas-bancarias
```

Eso crea o actualiza:
- `financiero.cuentas_bancarias`
- `financiero.auditoria_cheques`
- campos de descripciones en cuentas bancarias
- datos iniciales de bancos/cuentas
- sincronización de secuenciales de cheque usando el último cheque real registrado

## Archivos que debes desplegar

### Backend
Sube estos cambios al servidor:
- `backend/src/routes/ordenes-pago.js`
- `backend/src/routes/documentos.js`
- `backend/src/utils/auditoria.js`
- `backend/src/utils/validators.js`
- `backend/src/config/migrate-add-cuentas-bancarias.js`
- `backend/package.json`

### Frontend
Sube estos cambios al servidor:
- `frontend/src/pages/NuevaOrden.jsx`
- `frontend/src/pages/EditarOrden.jsx`
- `frontend/src/components/MultiLineDropdown.jsx`

### Base de datos
Sube y ejecuta:
- `database/schema.sql`
- `backend/src/config/migrate-add-cuentas-bancarias.js`

## Pasos recomendados en servidor

1. Respaldar la base de datos actual.
2. Subir el código actualizado.
3. Instalar dependencias del backend si cambió `package.json`.
4. Ejecutar la migración incremental:

```bash
cd backend
npm run migrate-add-cuentas-bancarias
```

5. Compilar el frontend:

```bash
cd frontend
npm install
npm run build
```

6. Reiniciar el backend:

```bash
pm2 restart financiero-backend
```

o el comando que uses normalmente con systemd o node directo.

## Importante sobre las secuencias de cheque

- La secuencia ahora se guarda por banco/cuenta en `financiero.cuentas_bancarias`.
- El sistema toma el siguiente cheque sugerido de esa tabla.
- Solo un usuario administrador puede forzar manualmente otro número.
- Si un administrador ajusta un cheque, el cambio queda registrado en `financiero.auditoria_cheques`.
- Para evitar duplicados, el backend valida que no exista ya ese cheque para el mismo banco.
- La migración completa ya no ejecuta smoke tests por defecto para no crear órdenes de prueba; si quieres ejecutarlos manualmente, usa `RUN_SMOKE_TESTS=1 ./database/migracion_completa.sh`.

## Si cambias solo el frontend
No basta con subir solo el frontend. También debes subir el backend porque:
- el dropdown nuevo consulta cuentas bancarias desde API,
- la auditoría de cheque manual se registra en backend,
- el comprobante PDF/Word se genera desde backend.

## Si cambias solo el archivo de Access exportado
No funcionará por sí solo. El archivo Access se usa como fuente de migración histórica, pero el sistema productivo ya trabaja sobre PostgreSQL.

## Resumen corto
- Base nueva: `./database/migracion_completa.sh`
- Base existente: `npm run migrate-add-cuentas-bancarias`
- Luego compilar frontend y reiniciar backend

