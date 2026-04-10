# Guia de Despliegue en Ubuntu Server

Esta guia deja el sistema listo para produccion en red interna institucional.

## 1. Requisitos

- Ubuntu Server 22.04 o 24.04
- Usuario con sudo
- Acceso a PostgreSQL local o remoto
- DNS interno o IP fija

## 2. Instalar paquetes base

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl unzip nginx ufw ca-certificates
```

Firewall recomendado:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw allow 8082/tcp
sudo ufw enable
sudo ufw status
```

## 3. Instalar Node.js LTS y PM2

```bash
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt install -y nodejs build-essential
node -v
npm -v
sudo npm install -g pm2
```

Instalar dependencias del sistema para generar PDF con Puppeteer:

```bash
sudo apt install -y \
    libnss3 libatk-bridge2.0-0 libx11-xcb1 libxcomposite1 libxdamage1 libxrandr2 \
    libgbm1 libgtk-3-0 libasound2t64 libxshmfence1 fonts-liberation
```

Instalar Python para migraciones Access -> PostgreSQL:

```bash
sudo apt install -y python3 python3-pip python3-psycopg2
```

## 4. Instalar PostgreSQL

```bash
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable --now postgresql
```

Crear base y usuario:

```bash
sudo -u postgres psql
CREATE DATABASE financiero_gad_chunchi;
CREATE USER financiero_user WITH ENCRYPTED PASSWORD '0000';
GRANT ALL PRIVILEGES ON DATABASE financiero_gad_chunchi TO financiero_user;
\q
```

## 5. Desplegar el codigo

```bash
sudo mkdir -p /opt/financiero
sudo chown -R $USER:$USER /opt/financiero
cd /opt/financiero
git clone <URL_DEL_REPOSITORIO> app
cd app
```

Instalar dependencias:

```bash
cd /opt/financiero/app/backend && npm ci
cd /opt/financiero/app/frontend && npm ci
```

## 6. Configurar variables de entorno

Crear archivo backend/.env:

```bash
cd /opt/financiero/app/backend
cat > .env << 'EOF'
NODE_ENV=production
PORT=3001
DB_HOST=localhost
DB_PORT=5432
DB_NAME=financiero_gad_chunchi
DB_USER=financiero_user
DB_PASSWORD=0000
JWT_SECRET=CAMBIAR_SECRET_LARGO_Y_UNICO
CORS_ORIGIN=http://10.22.169.94:8082
LOG_LEVEL=info

# Opcional: ajustar límites de peticiones en producción
API_RATE_LIMIT_MAX=600
DOCUMENT_RATE_LIMIT_MAX=60
EOF
```

## 7. Inicializar esquema y datos

```bash
psql -h localhost -U financiero_user -d financiero_gad_chunchi -f /opt/financiero/app/database/schema.sql
cd /opt/financiero/app/backend
node src/config/init-db.js
```

Migracion historica desde Access (opcional):

```bash
cd /opt/financiero/app
python3 database/migrar_ordenes_pago.py
```

### Migracion desde archivo Access en carpeta Samba (recomendado)

Instalar herramientas para leer Access:

```bash
sudo apt install -y mdbtools samba
```

Crear carpetas compartidas:

```bash
sudo mkdir -p /srv/financiero/import /srv/financiero/procesados
sudo chown -R $USER:$USER /srv/financiero
chmod -R 775 /srv/financiero
```

Configurar Samba:

```bash
sudo cp /etc/samba/smb.conf /etc/samba/smb.conf.bak
sudo nano /etc/samba/smb.conf
```

Agregar al final del archivo:

```ini
[financiero-import]
    path = /srv/financiero/import
    browseable = yes
    writable = yes
    read only = no
    guest ok = no
    valid users = TU_USUARIO_LINUX
    create mask = 0664
    directory mask = 0775
```

Crear usuario Samba y reiniciar servicio:

```bash
sudo smbpasswd -a TU_USUARIO_LINUX
sudo systemctl restart smbd
sudo systemctl enable smbd
```

Desde Windows, abrir:

```text
\\IP_DEL_SERVIDOR\financiero-import
```

Copiar ahi el archivo .mdb o .accdb y luego ejecutar en el servidor:

```bash
cd /opt/financiero/app
bash database/importar_access_samba.sh
```

El script hace automaticamente:

- Toma el ultimo archivo .mdb/.accdb de /srv/financiero/import
- Exporta tabla APContabOrdenPago a CSV
- Ejecuta la migracion a PostgreSQL

Si quieres indicar un archivo exacto:

```bash
cd /opt/financiero/app
bash database/importar_access_samba.sh /srv/financiero/import/MI_ARCHIVO.accdb
```

## 8. Build de frontend

```bash
cd /opt/financiero/app/frontend
npm run build
```

## 9. Ejecutar backend con PM2

```bash
cd /opt/financiero/app/backend
pm2 start src/app.js --name financiero-backend
pm2 save
pm2 startup
```

Ejecuta el comando que PM2 imprime para habilitar autoinicio tras reboot.

## 10. Configurar Nginx (reverse proxy)

Crear archivo:

```bash
sudo nano /etc/nginx/sites-available/financiero
```

Contenido:

```nginx
server {
    listen 80;
    server_name _;

    client_max_body_size 512m;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Activar sitio:

```bash
sudo ln -sf /etc/nginx/sites-available/financiero /etc/nginx/sites-enabled/financiero
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
sudo systemctl enable nginx
```

### Si el puerto 80 ya lo usa otro servicio

Si ya tienes Mayan EDMS o cualquier otro servicio ocupando `80`, no lo fuerces. Usa otro puerto para tu proyecto, por ejemplo `8082`.

Cambios sugeridos:

```nginx
server {
    listen 8082;
    server_name _;

    client_max_body_size 512m;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Luego recarga Nginx:

```bash
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl start nginx
sudo systemctl enable nginx
sudo systemctl reload nginx
```

Y accede a la app como:

```text
http://IP_DEL_SERVIDOR:8082
```

Si prefieres usar el puerto 80 más adelante, cambia `CORS_ORIGIN` a `http://IP_DEL_SERVIDOR` sin el puerto.

## 11. Verificacion

Salud del backend:

```bash
curl -s http://127.0.0.1:3001/api/health
```

Ver logs:

```bash
pm2 logs financiero-backend --lines 100
```

Ejecutar smoke test:

```bash
cd /opt/financiero/app
DB_HOST=localhost DB_PORT=5432 DB_NAME=financiero_gad_chunchi DB_USER=financiero_user DB_PASSWORD=CAMBIAR_PASSWORD_FUERTE JWT_SECRET=testsecret TEST_PORT=3002 ./backend/scripts/smoke_test_endpoints.sh
```

## 12. Operacion diaria

Actualizar version:

```bash
cd /opt/financiero/app
git pull
cd backend && npm ci
cd ../frontend && npm ci && npm run build
cd ../backend && pm2 restart financiero-backend
```

Comandos utiles:

```bash
pm2 status
pm2 restart financiero-backend
pm2 logs financiero-backend
pm2 monit
```

## 13. Backups recomendados

Backup diario de base:

```bash
mkdir -p /opt/backups/financiero
pg_dump -h localhost -U financiero_user -d financiero_gad_chunchi > /opt/backups/financiero/financiero_$(date +%F).sql
```

Agregar en crontab (ejemplo 02:30 AM):

```bash
crontab -e
30 2 * * * pg_dump -h localhost -U financiero_user -d financiero_gad_chunchi > /opt/backups/financiero/financiero_$(date +\%F).sql
```

## 14. Checklist antes de pasar a produccion

- NODE_ENV=production activo
- JWT_SECRET cambiado
- Password de DB fuerte
- Usuario admin con nueva clave
- Smoke test exitoso
- pm2 save ejecutado
- Backup diario configurado
- Acceso por Nginx validado

## 15. Observaciones importantes para esta aplicacion

- El endpoint de login tiene rate limit dedicado.
- El resto de Auth (usuarios, verify, etc.) no queda bloqueado por ese limit.
- El sistema permite desactivar usuarios y tambien eliminacion definitiva con validacion de integridad historica.
- Desde Configuracion puedes cambiar contrasena de un usuario al editarlo en el modal de usuarios.
