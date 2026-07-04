# Deployment Guide (MySQL + VPS)

Manual deployment on a Linux VPS using MySQL, nginx, PM2, and Certbot. This stack is self-hosted on your VPS — no cloud PaaS (Heroku, Railway, etc.) is required or documented here.

## Prerequisites

- Ubuntu 22.04+ (or similar)
- Node.js 20 LTS
- MySQL 8.0
- nginx
- PM2 (`npm install -g pm2`)
- Certbot (`apt install certbot python3-certbot-nginx`)
- Domain pointing to the VPS (e.g. `ops.example.com`)

## 1. MySQL setup

```bash
sudo apt update && sudo apt install -y mysql-server
sudo mysql_secure_installation
```

Create database and user:

```sql
CREATE DATABASE production_ops CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'app'@'localhost' IDENTIFIED BY 'strong_password_here';
GRANT ALL PRIVILEGES ON production_ops.* TO 'app'@'localhost';
FLUSH PRIVILEGES;
```

Or use Docker locally for development:

```bash
npm run db:up   # starts mysql from docker-compose.yml
```

For production, set `DATABASE_URL` in `backend/.env`:

```
DATABASE_URL="mysql://app:strong_password_here@localhost:3306/production_ops"
```

Update `backend/prisma/schema.prisma` datasource to `provider = "mysql"` before migrating in production.

## 2. Application setup

```bash
git clone <repo-url> /var/www/production-ops
cd /var/www/production-ops
npm install
```

Create `backend/.env`:

```env
NODE_ENV=production
DATABASE_URL="mysql://app:PASSWORD@localhost:3306/production_ops"
JWT_SECRET="<long-random-secret-min-32-chars>"
PORT=4000
UPLOAD_DIR="/var/www/production-ops/backend/uploads"
FRONTEND_URL="https://ops.example.com"
TRUST_PROXY=true
SEED_ADMIN_EMAIL="admin@example.com"
SEED_ADMIN_PASSWORD="<strong-initial-password-min-12-chars>"
```

Build and migrate:

```bash
npm run build -w shared
npm run db:generate -w backend
npm run db:migrate:deploy -w backend
npm run db:seed -w backend    # optional: seed admin user
npm run build
```

Ensure upload directory exists:

```bash
mkdir -p backend/uploads/photos backend/uploads/pdfs
```

## 3. PM2 (API process)

Create `ecosystem.config.cjs` in project root:

```js
module.exports = {
  apps: [{
    name: 'production-ops-api',
    cwd: './backend',
    script: 'dist/index.js',
    instances: 1,
    autorestart: true,
    env: { NODE_ENV: 'production' },
  }],
};
```

Start:

```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup   # follow printed instructions for boot persistence
```

Health check:

```bash
curl http://localhost:4000/api/v1/health
# { "ok": true, "db": "connected", "timestamp": "..." }
```

## 4. nginx (frontend + API proxy)

Build frontend:

```bash
npm run build -w frontend
# output: frontend/dist/
```

Site config `/etc/nginx/sites-available/production-ops`:

```nginx
server {
    listen 80;
    server_name ops.example.com;

    root /var/www/production-ops/frontend/dist;
    index index.html;

    client_max_body_size 50M;

    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Uploads are private. Do not expose `/uploads` directly from nginx; photos and PDFs are served through authenticated API routes.

Enable and reload:

```bash
sudo ln -s /etc/nginx/sites-available/production-ops /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

## 5. TLS with Certbot

```bash
sudo certbot --nginx -d ops.example.com
```

Certbot updates the nginx config for HTTPS and sets up auto-renewal.

## 6. Deploy updates

```bash
cd /var/www/production-ops
git pull
npm install
npm run build
npm run db:migrate:deploy -w backend
pm2 restart production-ops-api
```

Arabic PDF generation expects the Amiri regular TTF at `frontend/public/fonts/Amiri-Regular.ttf` before building. If it is missing, the PDF generator falls back to shaped text without embedding the font.

## Troubleshooting

| Issue | Check |
|-------|-------|
| 503 on `/api/v1/health` | MySQL running, `DATABASE_URL` correct, migrations applied |
| 401 on all routes | `JWT_SECRET` set and unchanged between deploys |
| Upload failures | `UPLOAD_DIR` writable by PM2 user |
| CORS errors | `FRONTEND_URL` matches public site URL exactly |
