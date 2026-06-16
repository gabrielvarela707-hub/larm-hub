# LarmHub — Plataforma Integrada de Gestão

> Plataforma white-label para gestão de loteamentos, CRM, financeiro, contratos, obras e governança corporativa.

![Next.js](https://img.shields.io/badge/Next.js-15.3-black?logo=next.js)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)
![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?logo=postgresql)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)

---

## Visão Geral2

O LarmHub é uma plataforma SaaS multi-tenant construída para o Grupo LARM, com foco em loteamentos residenciais e gestão corporativa. Cada tenant (empreendimento ou empresa) possui identidade visual, usuários, permissões e dados totalmente isolados.

A plataforma é dividida em dois hubs:

| Hub | Público | Módulos principais |
|---|---|---|
| **Santa Clara HUB** | Corretores, clientes, equipe operacional | Empreendimentos, CRM, Contratos, Financeiro, Mapa |
| **LarmHub** | Holding, controladoria, diretoria | Governança, Financeiro Consolidado, Operações, Estratégia |

---

## Arquitetura

```
larmhub-web/          → Frontend (Next.js 15 App Router)
larmhub-api/       → Backend  (Node.js + Express)
PostgreSQL 16         → Banco de dados
PM2                   → Process manager (produção)
Vercel                → Deploy frontend
Ubuntu 24 VPS         → Deploy backend
```

### Fluxo de autenticação

```
Browser → POST /auth/login → JWT (accessToken + refreshToken)
       → Cookie hub_session → Middleware Next.js verifica sessão
       → API calls com Bearer token
```

---

## Stack Tecnológica

### Frontend

| Tecnologia | Versão | Uso |
|---|---|---|
| Next.js | 15.3 | Framework React, App Router |
| React | 19 | UI |
| TypeScript | 5 | Tipagem |
| Tailwind CSS | 3 | Estilização |
| Zustand | 5 | Estado global (auth, tenant config) |
| Axios | 1.15 | Requisições HTTP |
| Lucide React | 0.468 | Ícones |
| Recharts | 2.13 | Gráficos e dashboards |
| React Hook Form | 7.54 | Formulários |
| Zod | 3.24 | Validação de schemas |
| Geist | 1.3 | Tipografia |
| date-fns | 4.1 | Manipulação de datas |
| xlsx | 0.18 | Exportação de planilhas |
| @dnd-kit | 6/8 | Drag and drop |
| @radix-ui | vários | Componentes acessíveis |

### Backend

| Tecnologia | Versão | Uso |
|---|---|---|
| Node.js | 18+ | Runtime |
| Express | 4.19 | Framework HTTP |
| PostgreSQL | 16 | Banco de dados |
| node-postgres (pg) | 8.12 | Driver PostgreSQL |
| bcryptjs | 2.4 | Hash de senhas |
| jsonwebtoken | 9.0 | Autenticação JWT |
| @aws-sdk/client-ses | 3.750 | Envio de e-mail (AWS SES) |
| Joi | 17.13 | Validação de payload |
| Winston | 3.13 | Logs estruturados (JSON) |
| uuid | 10 | Geração de IDs |
| Helmet | 7.1 | Headers de segurança |
| Morgan | 1.10 | Log de requisições HTTP |
| express-rate-limit | 7.3 | Rate limiting |
| PM2 | — | Process manager em produção |

---

## Módulos da Plataforma

### CRM & Funil de Vendas
- Cadastro e gestão de leads
- Funil de vendas com stages customizáveis (drag-and-drop)
- Automações de follow-up
- Todos os leads com filtros avançados

### Empreendimentos
- Cadastro de empreendimentos com imagens e documentos
- Gestão de lotes e unidades
- Status de disponibilidade em tempo real

### Mapa Interativo
- Visualização geográfica dos loteamentos
- Integração com Google Maps API (configurável por tenant)
- Filtros por status, empresa e tipo

### Simulador de Vendas
- Cálculo de financiamento e parcelas
- Múltiplos cenários de entrada
- Exportação em PDF

### Contratos
- Geração e assinatura digital (ClickSign)
- Histórico de contratos por cliente
- Status de assinatura em tempo real

### Financeiro
Submódulos completos:

| Submódulo | Descrição |
|---|---|
| **CashFlow** | Fluxo de caixa consolidado por empresa |
| **Mov. Bancário** | Conciliação de extratos bancários |
| **Contas a Receber** | Parcelas, boletos e recebimentos |
| **Contas a Pagar** | Lançamentos, aprovações e pagamentos |
| **Fornecedores** | CRUD com lookup BrasilAPI (CNPJ) e ViaCEP |
| **Bancos e Contas** | Contas bancárias, saldos, taxas e rendimentos |
| **Boletos** | Geração e gestão de boletos |
| **Split de Pagamento** | Distribuição de recebimentos entre empresas |
| **SPED e DIMOB** | Obrigações fiscais e acessórias |

### Cadastros Auxiliares
- **Tipos de Documento** — NF, Boleto, Recibo, Contrato, Fatura, etc. (usados em todos os lançamentos financeiros)

### Obras
- Gestão de cronogramas e etapas
- Controle de fornecedores por obra

### Relatórios
- Dashboards consolidados
- Exportação em Excel e PDF

### Controladoria
- Visão financeira consolidada multi-empresa
- SPED, DIMOB e obrigações fiscais

### Chat IA
- Assistente integrado com contexto do tenant

### Landing Pages
- Criação de páginas de captura de leads

---

## Configurações (White-label)

Cada tenant pode configurar:

- **Identidade Visual** — logo (upload), nome da plataforma, cor primária, cor do sidebar
- **Domínio** — domínio customizado
- **Credenciais** — Google Maps API, AWS SES, AWS SNS, WhatsApp Business API, ClickSign, Banco
- **Usuários** — convite por e-mail com perfis de acesso
- **Perfis** — criação de perfis com matriz de permissões por módulo
- **Permissões** — vinculação de múltiplos perfis por usuário
- **E-mail (SES)** — envio transacional via AWS SES com teste integrado
- **Notificações** — configurações de alertas
- **Plano** — gestão do plano contratado

---

## Sistema de Permissões

O sistema utiliza um modelo de **perfis de acesso** (RBAC por perfil):

```
hub_profiles         → Define permissões por módulo (read/write)
hub_user_profiles    → Vínculo many-to-many usuário ↔ perfil
```

Permissões são combinadas por **OR** entre todos os perfis ativos do usuário.

**Perfis padrão** (seed automático):
- Administrador, Gerente, Corretor, Financeiro, Controladoria, Contador, Assistente, Consultor, Cliente, Fornecedor

**Módulos com controle de permissão:**
`dashboard`, `empreendimentos`, `mapa`, `crm`, `simulador`, `contratos`, `landing`, `fin_receber`, `fin_pagar`, `fin_boletos`, `fin_split`, `fin_sped`, `obras`, `relatorios`, `controladoria`, `ia`, `configuracoes`, `usuarios`

---

## Sistema de Convites

Fluxo completo de onboarding de usuários:

```
Admin convida → Seleciona perfis → Backend cria hub_invites
→ AWS SES envia e-mail com link → /convite/:token (público)
→ Usuário cria senha → Perfis vinculados automaticamente
→ Primeiro login → Redireciona para /trocar-senha se necessário
```

---

## Estrutura do Banco de Dados

### Tabelas principais

```sql
hub_tenants              -- Tenants (empreendimentos/empresas)
hub_users                -- Usuários
hub_invites              -- Convites pendentes
hub_profiles             -- Perfis de acesso
hub_user_profiles        -- Vínculo usuário ↔ perfil
hub_tenant_configs       -- Configurações white-label por tenant

fin_fornecedores         -- Fornecedores
fin_bancos_contas        -- Contas bancárias
fin_bancos_lancamentos   -- Lançamentos extras (taxas, rendimentos)
fin_tipos_documento      -- Tipos de documento financeiro
fin_lancamentos_cp       -- Contas a Pagar
fin_lancamentos_cr       -- Contas a Receber
fin_parcelas_cp          -- Parcelas a pagar
```

---

## Variáveis de Ambiente

### Backend (`.env`)

```env
# Servidor
NODE_ENV=production
PORT=3001

# Frontend (para URLs de convite)
FRONTEND_URL=https://larm-hub.vercel.app

# CORS
CORS_ORIGINS=https://larm-hub.vercel.app,https://larmhub-web.vercel.app,https://hub.loteamentosantaclara.imb.br,http://localhost:3000

# Banco de dados
DATABASE_URL=postgresql://user:password@localhost:5432/larmhub

# JWT
JWT_SECRET=sua_chave_secreta_aqui
JWT_REFRESH_SECRET=sua_chave_refresh_aqui
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
```

### Frontend (`.env.local`)

```env
NEXT_PUBLIC_API_URL=https://api.loteamentosantaclara.imb.br
NEXT_PUBLIC_GOOGLE_MAPS_KEY=sua_chave_google_maps   # fallback se não configurado no painel
```

---

## Instalação e Execução

### Pré-requisitos

- Node.js 18+
- PostgreSQL 16
- PM2 (produção)

### Backend

```bash
cd larmhub-api
npm install

# Configurar .env (ver seção acima)

# Rodar todas as migrations
node scripts/setup_all.js

# Seeds
node scripts/seed_profiles.js
node scripts/seed_tipos_documento.js

# Desenvolvimento
npm run dev

# Produção
pm2 start src/server.js --name larmhub-api
```

### Frontend

```bash
cd larmhub-web
npm install

# Configurar .env.local (ver seção acima)

# Desenvolvimento
npm run dev

# Build de produção
npm run build
npm start
```

---

## Scripts de Banco de Dados

| Script | Descrição |
|---|---|
| `setup_all.js` | Roda todas as migrations em sequência (idempotente) |
| `migrate_tenant_config.js` | Tabela de configurações white-label |
| `migrate_profiles.js` | Tabelas de perfis e vínculos usuário-perfil |
| `migrate_tipos_documento.js` | Tipos de documento financeiro |
| `migrate_bancos_lancamentos.js` | Lançamentos extras em contas bancárias |
| `migrate_invite_profiles.js` | Coluna profile_ids em hub_invites |
| `migrate_roles.js` | Adiciona novos roles ao enum PostgreSQL |
| `seed_profiles.js` | Popula 10 perfis padrão por tenant |
| `seed_tipos_documento.js` | Popula 11 tipos de documento padrão por tenant |

---

## Deploy

### Backend (VPS Ubuntu)

```bash
# Clone e instale
git clone https://github.com/seu-repo/larmhub-api
cd larmhub-api && npm install

# Configure .env e rode as migrations
node scripts/setup_all.js

# Inicie com PM2
pm2 start src/server.js --name larmhub-api
pm2 save
pm2 startup

# Nginx como reverse proxy para porta 3001
```

### Frontend (Vercel)

```bash
# Conecte o repositório no vercel.com
# Configure as env vars no painel da Vercel
# Deploy automático a cada push na branch main
```

---

## APIs Externas Integradas

| API | Uso | Configuração |
|---|---|---|
| **AWS SES** | E-mail transacional (convites, notificações) | Painel → Credenciais → E-mail |
| **AWS SNS** | SMS para leads | Painel → Credenciais → SMS |
| **WhatsApp Business API** | Mensagens por conta/tenant | Painel → Credenciais → WhatsApp |
| **BrasilAPI** | Consulta de CNPJ (dados da empresa) | Automático ao digitar CNPJ |
| **ViaCEP** | Consulta de CEP (endereço) | Automático ao digitar CEP |
| **Google Maps** | Mapa interativo de lotes | Painel → Credenciais → Google Maps |
| **ClickSign** | Assinatura digital de contratos | Painel → Credenciais → ClickSign |

---

## Estrutura de Pastas

```
larmhub-web/
├── src/
│   ├── app/
│   │   ├── (auth)/              # Login, convite, troca de senha
│   │   │   ├── login/
│   │   │   ├── convite/[token]/
│   │   │   └── trocar-senha/
│   │   └── (dashboard)/         # Área autenticada
│   │       ├── configuracoes/
│   │       ├── financeiro/
│   │       │   ├── bancos/
│   │       │   ├── fornecedores/
│   │       │   ├── contas-pagar/
│   │       │   ├── receber/
│   │       │   └── ...
│   │       ├── crm/
│   │       ├── contratos/
│   │       ├── empreendimentos/
│   │       ├── mapa/
│   │       ├── simulador/
│   │       ├── obras/
│   │       ├── relatorios/
│   │       ├── controladoria/
│   │       ├── cadastros/
│   │       │   └── tipo-documento/
│   │       └── ia/
│   ├── components/
│   │   ├── sidebar.tsx          # Menu lateral white-label
│   │   ├── topbar.tsx
│   │   ├── dynamic-title.tsx    # Título dinâmico por tenant
│   │   └── permission-gate.tsx
│   ├── hooks/
│   │   └── usePermission.ts     # Hook de controle de acesso
│   ├── lib/
│   │   ├── auth-store.ts        # Zustand: autenticação
│   │   └── tenant-config-store.ts  # Zustand: config white-label
│   └── middleware.ts            # Proteção de rotas (Next.js)

larmhub-api/
├── src/
│   ├── routes/
│   │   ├── auth.js
│   │   ├── users.js             # Usuários + sistema de convites
│   │   ├── profiles.js          # CRUD de perfis de acesso
│   │   ├── tenant-config.js     # Configurações white-label
│   │   ├── financeiro.js
│   │   ├── fornecedores_bancos.js
│   │   ├── tipos-documento.js
│   │   └── strato.js
│   ├── middleware/
│   │   └── authenticate.js      # JWT middleware
│   ├── config/
│   │   ├── database.js
│   │   └── logger.js
│   └── server.js
└── scripts/                     # Migrations e seeds
```

---

## Licença

Projeto proprietário — Grupo LARM. Todos os direitos reservados.

---

## Contato

**Grupo LARM** · Solidez Hoje, Legado Amanhã.

