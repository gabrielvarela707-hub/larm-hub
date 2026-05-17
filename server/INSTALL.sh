# 🚀 GUIA DE INSTALAÇÃO — Backend API no Linux Ubuntu
# Servidor: 185.2.103.185
# Domínio API: api.loteamentosantaclara.imb.br
# Todos os comandos são rodados no servidor via SSH

# ═══════════════════════════════════════════════════════════════════
# ETAPA 1 — Acesso e atualização do servidor
# ═══════════════════════════════════════════════════════════════════

ssh root@185.2.103.185

# Atualiza o sistema
apt update && apt upgrade -y


# ═══════════════════════════════════════════════════════════════════
# ETAPA 2 — Instalar Node.js 20 LTS
# ═══════════════════════════════════════════════════════════════════

# Adiciona o repositório oficial NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Verifica versões
node -v    # deve mostrar v20.x.x
npm -v     # deve mostrar 10.x.x

# Instala o PM2 globalmente (gerenciador de processos)
npm install -g pm2


# ═══════════════════════════════════════════════════════════════════
# ETAPA 3 — Criar usuário dedicado para a API (boa prática)
# ═══════════════════════════════════════════════════════════════════

useradd -m -s /bin/bash apiuser
# Cria diretório do projeto
mkdir -p /var/www/lotemobile-api
chown apiuser:apiuser /var/www/lotemobile-api

# Cria diretório de logs
mkdir -p /var/log/lotemobile-api
chown apiuser:apiuser /var/log/lotemobile-api


# ═══════════════════════════════════════════════════════════════════
# ETAPA 4 — Enviar os arquivos do backend para o servidor
# ═══════════════════════════════════════════════════════════════════

# Execute isso na SUA MÁQUINA (não no servidor):
# scp -r ./backend-api/* root@185.2.103.185:/var/www/lotemobile-api/

# Ou se usar Git (recomendado para o futuro):
# cd /var/www/lotemobile-api
# git clone https://github.com/SEU_USUARIO/lotemobile-api.git .


# ═══════════════════════════════════════════════════════════════════
# ETAPA 5 — Configurar o .env de produção
# ═══════════════════════════════════════════════════════════════════

cd /var/www/lotemobile-api

# Cria o .env a partir do exemplo
cp .env.example .env

# Edita com nano (ou vim)
nano .env

# ─── Preencha os valores reais: ───────────────────────────────────
#
# NODE_ENV=production
# PORT=3001
# API_URL=https://api.loteamentosantaclara.imb.br
#
# DB_HOST=localhost
# DB_PORT=5432
# DB_NAME=lotemobile_prod
# DB_USER=lotemobile
# DB_PASSWORD=SUA_SENHA_REAL_DO_POSTGRES
#
# JWT_SECRET=$(openssl rand -hex 64)
# JWT_REFRESH_SECRET=$(openssl rand -hex 64)
# JWT_EXPIRES_IN=8h
# JWT_REFRESH_EXPIRES_IN=30d
#
# CORS_ORIGINS=https://hub.loteamentosantaclara.imb.br,https://loteamentosantaclara.imb.br
#
# LOG_LEVEL=info
# LOG_DIR=/var/log/lotemobile-api
#
# ─── Para gerar os JWT secrets automaticamente: ───────────────────
# openssl rand -hex 64
# (rode duas vezes, uma para cada secret)


# ═══════════════════════════════════════════════════════════════════
# ETAPA 6 — Instalar dependências e rodar migrations
# ═══════════════════════════════════════════════════════════════════

cd /var/www/lotemobile-api

# Instala as dependências Node
npm install --omit=dev

# Roda a migration (cria as tabelas hub_* no PostgreSQL)
node scripts/migrate.js
# Saída esperada:
# ✅  PostgreSQL conectado: PostgreSQL 16.x
# ✅  Migração concluída! Tabelas criadas:
#    - hub_tenants
#    - hub_users
#    - hub_refresh_tokens
#    - hub_audit_logs
#    - hub_tenant_settings

# Roda o seed (cria tenants e usuários iniciais)
node scripts/seed.js
# Saída esperada:
# ✅  Seed concluído!
# ┌─────────────────────────────────────────┐
# │ Santa Clara: admin@santaclara.com.br    │
# │ LARM:        admin@larmgroup.com.br     │
# │ Senha:       Troque@2024!               │
# └─────────────────────────────────────────┘


# ═══════════════════════════════════════════════════════════════════
# ETAPA 7 — Testar a API antes de colocar em produção
# ═══════════════════════════════════════════════════════════════════

# Inicia em modo dev para ver logs no terminal
node src/server.js &

# Testa o health check
curl http://localhost:3001/health
# Saída esperada: {"ok":true,"service":"lotemobile-api","db":{"ok":true,...}}

# Testa o login (Santa Clara)
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@santaclara.com.br","password":"Troque@2024!"}'
# Saída esperada: {"ok":true,"data":{"accessToken":"eyJ...","refreshToken":"eyJ...","user":{...}}}

# Para o processo de teste
kill %1


# ═══════════════════════════════════════════════════════════════════
# ETAPA 8 — Iniciar com PM2 (daemon + restart automático)
# ═══════════════════════════════════════════════════════════════════

cd /var/www/lotemobile-api

# Inicia a API com PM2
pm2 start src/server.js \
  --name "lotemobile-api" \
  --instances 2 \
  --exec-mode cluster \
  --max-memory-restart 512M \
  --env production

# Verifica se está rodando
pm2 status
pm2 logs lotemobile-api --lines 30

# Configura PM2 para iniciar com o sistema (após reboot)
pm2 startup systemd
# Copia e roda o comando que aparecer (algo como:)
# sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u root --hp /root

# Salva o estado atual do PM2
pm2 save


# ═══════════════════════════════════════════════════════════════════
# ETAPA 9 — Instalar Nginx como reverse proxy
# ═══════════════════════════════════════════════════════════════════

apt install -y nginx

# Cria o arquivo de configuração do site
cat > /etc/nginx/sites-available/lotemobile-api << 'EOF'
server {
    listen 80;
    server_name api.loteamentosantaclara.imb.br;

    # Redireciona para HTTPS depois do Certbot
    # (por enquanto deixa em HTTP para o Certbot funcionar)

    location / {
        proxy_pass         http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout    60s;
        proxy_read_timeout    60s;
    }
}
EOF

# Ativa o site e testa a configuração
ln -sf /etc/nginx/sites-available/lotemobile-api /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx

# Testa via domínio (o DNS precisa estar apontando para o servidor)
curl http://api.loteamentosantaclara.imb.br/health


# ═══════════════════════════════════════════════════════════════════
# ETAPA 10 — SSL com Let's Encrypt (HTTPS)
# ═══════════════════════════════════════════════════════════════════

apt install -y certbot python3-certbot-nginx

# Gera o certificado (DNS precisa já estar apontando)
certbot --nginx -d api.loteamentosantaclara.imb.br

# Segue as instruções na tela:
#   - Informa seu e-mail
#   - Aceita os termos
#   - Escolhe opção 2 (redireciona HTTP → HTTPS)

# Renova automaticamente via cron (já vem configurado pelo certbot)
certbot renew --dry-run


# ═══════════════════════════════════════════════════════════════════
# ETAPA 11 — Verificação final
# ═══════════════════════════════════════════════════════════════════

# Health check via HTTPS
curl https://api.loteamentosantaclara.imb.br/health

# Login real
curl -X POST https://api.loteamentosantaclara.imb.br/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@santaclara.com.br","password":"Troque@2024!"}'

# Ver logs em tempo real
pm2 logs lotemobile-api

# Status do PM2
pm2 status

# ═══════════════════════════════════════════════════════════════════
# COMANDOS ÚTEIS DO DIA A DIA
# ═══════════════════════════════════════════════════════════════════

# Reiniciar a API (após atualização de código)
pm2 restart lotemobile-api

# Ver logs
pm2 logs lotemobile-api --lines 100

# Monitoramento em tempo real
pm2 monit

# Atualizar código (quando usar Git)
cd /var/www/lotemobile-api
git pull
npm install --omit=dev
pm2 restart lotemobile-api

# Verificar uso de recursos
pm2 status
free -h
df -h
