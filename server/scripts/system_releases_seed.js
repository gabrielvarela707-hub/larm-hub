/**
 * server/data/system_releases_seed.js
 * Fonte inicial do changelog versionado do sistema.
 * Próximas versões devem ser adicionadas aqui e aplicadas via migration/seed.
 */

const SYSTEM_RELEASES = [
  {
    version: "0.0.1",
    title: "Base de versionamento e auditoria operacional",
    description:
      "Primeira versão controlada do LARM HUB / Santa Clara HUB com histórico técnico e changelog administrativo.",
    frontend_version: "0.0.1",
    backend_version: "0.0.1",
    released_at: "2026-05-17T00:00:00.000Z",
    changes: [
      "Criada a aba Sobre sistema em Configurações.",
      "Adicionado controle inicial de versão do front-end e backend em 0.0.1.",
      "Criada tabela de changelog no PostgreSQL para histórico de versões.",
      "Documentada arquitetura básica: Next.js, React, TailwindCSS, Zustand, Node.js, Express, JWT, PostgreSQL e AWS SES.",
      "Mantida a versão como dado técnico de deploy e o changelog como dado administrativo consultável.",
      "Preparado o padrão para próximas interações incrementarem a versão e registrarem alterações detalhadas.",
    ],
    architecture: {
      frontend: [
        "Next.js App Router",
        "React",
        "TypeScript",
        "TailwindCSS",
        "Zustand",
        "Axios",
      ],
      backend: ["Node.js", "Express.js", "JWT", "REST API", "PM2"],
      database: [
        "PostgreSQL",
        "Multi-tenant",
        "Auditoria",
        "Permissões",
        "Financeiro",
      ],
      integrations: ["AWS SES", "Google Maps", "CRM externo", "WhatsApp API"],
    },
  },
  {
    version: "0.0.2",
    title: "CRM/Funil Fase 1",
    description:
      "Evolução do funil para operação comercial com etapas configuráveis, Kanban persistente, histórico de leads e motivos de perda.",
    frontend_version: "0.0.2",
    backend_version: "0.0.2",
    released_at: "2026-05-17T03:00:00.000Z",
    changes: [
      "Criada estrutura de banco para CRM/Funil: crm_funnel_stages, crm_leads, crm_lead_history e crm_loss_reasons.",
      "Adicionadas etapas configuráveis do funil com cor, ordem, prazo máximo, status de ganho/perda e inativação segura.",
      "Criado Kanban de leads com dados persistidos via API, filtros por busca, etapa, responsável, origem e temperatura.",
      "Adicionado cadastro rápido de lead com responsável, origem, campanha, empreendimento, valor estimado, temperatura e próximo retorno.",
      "Adicionado histórico por lead com criação, atualização, mudança de etapa, observações e inativação.",
      "Adicionados motivos de perda padronizados e obrigatoriedade de informar motivo ao mover o lead para Perdido.",
      "Adicionada importação de leads do Excel para persistir os registros no backend, evitando ficar apenas em estado local.",
      "Mantidas regras de permissão do CRM também no backend, não apenas no menu lateral.",
      "Preparada a base para próximas fases de campanhas, automações com SES/SNS e follow-up comercial.",
    ],
    architecture: {
      frontend: [
        "Next.js App Router",
        "React",
        "TypeScript",
        "TailwindCSS",
        "Zustand",
        "XLSX",
      ],
      backend: ["Node.js", "Express.js", "JWT", "REST API CRM", "PM2"],
      database: [
        "PostgreSQL",
        "crm_funnel_stages",
        "crm_leads",
        "crm_lead_history",
        "crm_loss_reasons",
      ],
      integrations: [
        "AWS SES preparado para campanhas",
        "AWS SNS preparado para SMS/avisos",
        "WhatsApp preparado para próxima fase",
      ],
    },
  },
  {
    version: "0.0.3",
    title: "CRM/Funil Fase 2",
    description:
      "Gestão comercial com tarefas, follow-up, alertas de SLA e visão de prioridades do atendimento.",
    frontend_version: "0.0.3",
    backend_version: "0.0.3",
    released_at: "2026-05-17T04:00:00.000Z",
    changes: [
      "Criada tabela crm_lead_tasks para tarefas e follow-ups vinculados aos leads.",
      "Adicionado CRUD de tarefas por lead com responsável, prioridade, prazo, status, conclusão e cancelamento lógico.",
      "Adicionado resumo comercial com tarefas de hoje, tarefas atrasadas, retornos próximos, leads sem contato e etapas com SLA vencido.",
      "Incluídos alertas no Kanban para tarefas vencidas e próximos retornos diretamente no card do lead.",
      "Adicionada área de tarefas dentro do modal do lead para criar, concluir e cancelar follow-ups sem sair do histórico.",
      "Criada visão operacional de tarefas pendentes na tela do funil para priorizar o atendimento diário.",
      "Registradas ações de tarefas no histórico do lead e no log de auditoria.",
      "Mantidas as regras de permissão do CRM no backend para leitura e escrita das tarefas.",
      "Atualizada versão técnica do front-end e backend para 0.0.3.",
    ],
    architecture: {
      frontend: [
        "Next.js App Router",
        "React",
        "TypeScript",
        "TailwindCSS",
        "XLSX",
        "Kanban CRM",
      ],
      backend: [
        "Node.js",
        "Express.js",
        "JWT",
        "REST API CRM",
        "PM2",
        "Auditoria",
      ],
      database: [
        "PostgreSQL",
        "crm_lead_tasks",
        "crm_leads",
        "crm_lead_history",
        "crm_funnel_stages",
      ],
      integrations: [
        "AWS SES preparado para campanhas",
        "AWS SNS preparado para próxima fase",
        "WhatsApp preparado para acionamento comercial",
      ],
    },
  },
  {
    version: "0.0.4",
    title: "CRM/Funil Fase 3",
    description:
      "Inteligência comercial com lead scoring, relatórios de conversão, ranking de responsáveis, análise por campanhas e previsão ponderada de fechamento.",
    frontend_version: "0.0.4",
    backend_version: "0.0.4",
    released_at: "2026-05-17T05:00:00.000Z",
    changes: [
      "Criada visão de Inteligência no CRM com KPIs de pipeline, receita vendida, conversão geral, score médio, leads quentes e previsão ponderada.",
      "Adicionado endpoint GET /crm/analytics para relatórios consolidados por etapa, origem, responsável, campanha, motivo de perda e temperatura do lead.",
      "Adicionado endpoint POST /crm/leads/recalculate-scores para recalcular automaticamente score e temperatura dos leads com base em dados de contato, origem, campanha, tarefas, interações e status do funil.",
      "Criado relatório de conversão por origem para identificar canais com melhor qualidade comercial.",
      "Criado ranking por responsável com leads, vendas, taxa de conversão, atrasos e potencial de pipeline.",
      "Criado relatório por etapa para identificar gargalos, SLA vencido, score médio e valor parado no funil.",
      "Criado relatório de campanhas como base para a próxima fase de disparos e automações com SES/SNS.",
      "Criado relatório de motivos de perda com volume e valor perdido.",
      "Adicionados índices no PostgreSQL para melhorar consultas analíticas do CRM.",
      "Atualizada versão técnica do front-end e backend para 0.0.4.",
    ],
    architecture: {
      frontend: [
        "Next.js App Router",
        "React",
        "TypeScript",
        "TailwindCSS",
        "Kanban CRM",
        "Relatórios analíticos",
      ],
      backend: [
        "Node.js",
        "Express.js",
        "JWT",
        "REST API CRM",
        "Analytics API",
        "PM2",
        "Auditoria",
      ],
      database: [
        "PostgreSQL",
        "crm_leads",
        "crm_funnel_stages",
        "crm_lead_tasks",
        "crm_loss_reasons",
        "hub_system_releases",
      ],
      integrations: [
        "AWS SES preparado para campanhas",
        "AWS SNS preparado para próxima fase",
        "WhatsApp preparado para acionamento comercial",
      ],
    },
  },
  {
    version: "0.0.5",
    title: "CRM/Funil Fase 4",
    description:
      "Campanhas e comunicação com templates, segmentação de leads, disparos por AWS SES/SNS, histórico de envio e controle de opt-out.",
    frontend_version: "0.0.5",
    backend_version: "0.0.5",
    released_at: "2026-05-17T06:00:00.000Z",
    changes: [
      "Criada estrutura de campanhas do CRM com crm_campaigns, crm_campaign_recipients, crm_message_templates e crm_communication_events.",
      "Adicionado controle de opt-out por lead para e-mail e SMS, preservando conformidade operacional e evitando disparos indevidos.",
      "Criados templates de comunicação para e-mail e SMS com variáveis como {{nome}}, {{empreendimento}}, {{telefone}}, {{campanha}} e {{responsavel}}.",
      "Criados endpoints para listar, criar, preparar, cancelar e enviar campanhas comerciais a partir dos leads do funil.",
      "Integrado envio de e-mail transacional/campanhas via AWS SES usando as credenciais já configuradas por tenant.",
      "Adicionada base de envio SMS via AWS SNS, com colunas administrativas de configuração SNS no tenant.",
      "Registrado histórico de comunicação por lead e por campanha, incluindo status, provedor, erro e identificador da mensagem.",
      "Criada visão de Campanhas no CRM para cadastrar templates, criar campanhas, preparar destinatários e disparar comunicações.",
      "Mantidas regras de permissão do CRM e auditoria para criação, preparação, envio e cancelamento de campanhas.",
      "Atualizada versão técnica do front-end e backend para 0.0.5.",
    ],
    architecture: {
      frontend: [
        "Next.js App Router",
        "React",
        "TypeScript",
        "TailwindCSS",
        "Kanban CRM",
        "Campanhas CRM",
      ],
      backend: [
        "Node.js",
        "Express.js",
        "JWT",
        "REST API CRM",
        "AWS SES",
        "AWS SNS",
        "Auditoria",
        "PM2",
      ],
      database: [
        "PostgreSQL",
        "crm_campaigns",
        "crm_campaign_recipients",
        "crm_message_templates",
        "crm_communication_events",
        "crm_leads",
      ],
      integrations: [
        "AWS SES para e-mails",
        "AWS SNS para SMS",
        "Templates com variáveis",
        "Histórico de comunicação por lead",
      ],
    },
  },
  {
    version: "0.0.6",
    title: "Relatórios — Mapa de Vendas legado",
    description:
      "Integração do relatório Mapa de Vendas com as tabelas legadas de vendas e recebíveis no PostgreSQL, removendo o erro 404 das rotas do relatório.",
    frontend_version: "0.0.6",
    backend_version: "0.0.6",
    released_at: "2026-05-17T07:00:00.000Z",
    changes: [
      "Mapeado o pacote PHP/Scriptcase enviado, identificando os módulos legados de Obras, Unidades, Implantação, Pessoas, Usuários, Logs e Manutenção.",
      "Criada rota backend GET /mapa-vendas/anos para retornar anos disponíveis a partir de ts1_vend.",
      "Criada rota backend GET /mapa-vendas/resumo para consolidar VGV, entradas, contratos, empresas e últimas vendas.",
      "Criada rota backend GET /mapa-vendas para listagem paginada com filtros por ano, empresa e busca livre.",
      "Vinculado o Mapa de Vendas às tabelas legadas ts1_vend, ts1_univ, tb2_pess, tb2_obra, ts1_cemp e ts1_core.",
      "Mantida consulta defensiva para não derrubar o backend caso alguma tabela/view legada esteja ausente.",
      "Corrigido o problema de carregamento eterno causado por 404 nas rotas /mapa-vendas/anos, /mapa-vendas/resumo e /mapa-vendas.",
      "Atualizada versão técnica do front-end e backend para 0.0.6.",
    ],
    architecture: {
      frontend: [
        "Next.js App Router",
        "React",
        "TypeScript",
        "TailwindCSS",
        "Relatórios operacionais",
      ],
      backend: [
        "Node.js",
        "Express.js",
        "JWT",
        "REST API Relatórios",
        "PM2",
        "Auditoria",
      ],
      database: [
        "PostgreSQL",
        "ts1_vend",
        "ts1_univ",
        "tb2_pess",
        "tb2_obra",
        "ts1_cemp",
        "ts1_core",
      ],
      integrations: [
        "Legado Scriptcase mapeado",
        "Relatório Next.js consumindo API Node",
      ],
    },
  },
  {
    version: "0.0.7",
    title: "Relatórios Tools por projeto",
    description:
      "Separação dos relatórios legados por projeto/obra, com novos módulos de Projetos/Obras, Unidades do Estoque e Implantação/Plantas no LARM HUB.",
    frontend_version: "0.0.7",
    backend_version: "0.0.7",
    released_at: "2026-05-17T08:00:00.000Z",
    changes: [
      "Criada rota backend GET /relatorios-tools/filtros para carregar obras, empresas, situações e tipos de unidade usados nos relatórios.",
      "Criada rota backend GET /relatorios-tools/projetos para listar projetos/obras com empresa, cidade, endereço, área, totais de unidades, disponíveis, vendidas e última venda.",
      "Criada rota backend GET /relatorios-tools/unidades para listar unidades do estoque com filtros por obra, situação, tipo e busca livre.",
      "Criada rota backend GET /relatorios-tools/implantacoes para consultar plantas/implantação a partir das obras cadastradas.",
      "Atualizado o relatório Mapa de Vendas para aceitar filtro por obra/projeto, evitando misturar Residencial Santa Clara, Aluguel CJ 23, Terras de Santa Adélia e demais projetos.",
      "Adicionados menus em Relatórios: Projetos / Obras, Unidades do Estoque e Implantação / Plantas.",
      "Criadas telas Next.js para os novos relatórios consumindo a API Node, sem incorporar o PHP Scriptcase legado.",
      "Mantida consulta defensiva para colunas opcionais do legado, como imagem de planta, evitando quebra caso o banco tenha variações de schema.",
      "Atualizada versão técnica do front-end e backend para 0.0.7.",
    ],
    architecture: {
      frontend: [
        "Next.js App Router",
        "React",
        "TypeScript",
        "TailwindCSS",
        "Relatórios Tools",
      ],
      backend: [
        "Node.js",
        "Express.js",
        "JWT",
        "REST API Relatórios",
        "PM2",
        "Auditoria",
      ],
      database: [
        "PostgreSQL",
        "tb2_obra",
        "ts1_univ",
        "ts1_situ",
        "ts1_vend",
        "ts1_desu",
        "ts1_tpun",
        "tb2_pess",
      ],
      integrations: [
        "Legado Scriptcase mapeado",
        "Relatórios Next.js por projeto/obra",
        "Base para recebíveis na próxima versão",
      ],
    },
  },
  {
    version: "0.0.8",
    title: "Correção de build e versionamento de relatórios",
    description:
      "Correção do tipo TypeScript no Mapa de Vendas e registro da evolução de versionamento para manter o changelog consistente.",
    frontend_version: "0.0.8",
    backend_version: "0.0.8",
    released_at: "2026-05-17T09:00:00.000Z",
    changes: [
      "Corrigido o tipo do array recentes no relatório Mapa de Vendas, incluindo obra_id e obra para compatibilidade com o layout por projeto.",
      "Resolvido o erro de build do Next.js: Property obra_id does not exist on type recentes.",
      "Mantida a separação por projeto/obra adicionada na versão 0.0.7 sem alterar a lógica do relatório.",
      "Atualizada versão técnica do front-end e backend para 0.0.8.",
      "Registrado no changelog que a sequência de versionamento seguirá 0.0.8, 0.0.9 e depois 0.1.0.",
    ],
    architecture: {
      frontend: [
        "Next.js App Router",
        "React",
        "TypeScript",
        "TailwindCSS",
        "Relatórios Tools",
      ],
      backend: [
        "Node.js",
        "Express.js",
        "JWT",
        "REST API Relatórios",
        "PM2",
        "Auditoria",
      ],
      database: [
        "PostgreSQL",
        "hub_system_releases",
        "tb2_obra",
        "ts1_vend",
        "ts1_univ",
      ],
      integrations: [
        "Relatórios Next.js por projeto/obra",
        "Changelog versionado no banco",
      ],
    },
  },
  {
    version: "0.0.9",
    title: "Contas a Pagar — edição, exclusão, NFS e datas de baixa",
    description:
      "Correções pontuais no Contas a Pagar para edição/exclusão de lançamentos, inclusão do tipo NFS e tratamento de datas sem deslocamento por fuso horário.",
    frontend_version: "0.0.9",
    backend_version: "0.0.9",
    released_at: "2026-05-21T12:00:00.000Z",
    changes: [
      "Adicionadas rotas backend PUT e DELETE para /financeiro/lancamentos-cp/:id, removendo o erro 404 ao editar ou excluir lançamentos de Contas a Pagar.",
      "Permitida a edição de lançamentos já criados, preservando parcelas com baixa registrada para evitar inconsistência no movimento bancário.",
      "A exclusão de lançamento remove também as parcelas e os movimentos bancários gerados por baixas vinculadas ao título.",
      "Adicionado o tipo de documento NFS aos tipos padrão de documentos financeiros.",
      "Corrigido o tratamento de datas de baixa e exibição em Contas a Pagar para evitar gravação/exibição no dia anterior por conversão de fuso horário.",
      "Atualizada versão técnica do front-end e backend para 0.0.9.",
    ],
    architecture: {
      frontend: [
        "Next.js App Router",
        "React",
        "TypeScript",
        "TailwindCSS",
        "Contas a Pagar",
      ],
      backend: [
        "Node.js",
        "Express.js",
        "JWT",
        "REST API Financeiro",
        "PM2",
        "Auditoria",
      ],
      database: [
        "PostgreSQL",
        "fin_lancamentos_cp",
        "fin_parcelas_cp",
        "fin_movimento",
        "fin_tipos_documento",
        "hub_system_releases",
      ],
      integrations: [
        "Movimento Bancário integrado ao Contas a Pagar",
        "Changelog versionado no banco",
      ],
    },
  },
  {
    version: "0.1.0",
    title: "Financeiro — datas sem fuso, detalhes da baixa e bancos",
    description:
      "Correções no financeiro para padronizar datas como texto ISO no backend, exibir detalhes da baixa em Contas a Pagar e ajustar formato do saldo inicial em Bancos.",
    frontend_version: "0.1.0",
    backend_version: "0.1.0",
    released_at: "2026-05-21T13:00:00.000Z",
    changes: [
      "Padronizada a saída de datas de Contas a Pagar e Movimento Bancário em YYYY-MM-DD diretamente no backend, evitando deslocamento de um dia por fuso horário no front-end.",
      "A listagem de Contas a Pagar passou a mostrar dados da baixa em parcelas pagas: forma de pagamento, multa, juros, desconto, acréscimo, valor final e motivo quando informado.",
      "Corrigido o cadastro/listagem de Bancos para tratar saldo inicial como número, evitando exibição como 081850.4900.",
      "Removidas as setas do campo Saldo Inicial no cadastro de bancos, mantendo entrada decimal em formato brasileiro ou decimal com ponto.",
      "Corrigida a exibição da Data do Saldo Inicial para não aparecer Invalid Date quando a API retornar data ISO completa.",
      "Atualizada versão técnica do front-end e backend para 0.1.0.",
    ],
    architecture: {
      frontend: [
        "Next.js App Router",
        "React",
        "TypeScript",
        "TailwindCSS",
        "Financeiro",
      ],
      backend: ["Node.js", "Express.js", "JWT", "REST API Financeiro", "PM2"],
      database: [
        "PostgreSQL",
        "fin_lancamentos_cp",
        "fin_parcelas_cp",
        "fin_movimento",
        "fin_bancos_contas",
        "hub_system_releases",
      ],
      integrations: [
        "Movimento Bancário integrado ao Contas a Pagar",
        "Changelog versionado no banco",
      ],
    },
  },
  {
    version: "0.1.1",
    title: "Financeiro — fornecedores e bancos com busca",
    description:
      "Ajustes no cadastro de fornecedores e contas bancárias para separar conta e dígito, ampliar a lista de bancos brasileiros e permitir busca por código ou nome.",
    frontend_version: "0.1.1",
    backend_version: "0.1.1",
    released_at: "2026-05-21T14:00:00.000Z",
    changes: [
      "Separado o campo Conta / Dígito no cadastro de fornecedores, mantendo Conta e Dígito em campos independentes.",
      "Adicionado armazenamento de código do banco e dígito bancário em fin_fornecedores via migration compatível com bases existentes.",
      "Atualizado o backend de fornecedores para gravar e atualizar codigo_banco e digito.",
      "Substituída a lista curta de bancos do cadastro de fornecedores por busca com a lista completa de bancos brasileiros usada no financeiro.",
      "Substituído o select limitado de Banco em Nova Conta Bancária por busca por código ou nome com a lista completa de bancos.",
      "Mantidas as regras existentes de cadastro, edição, histórico e vínculo de fornecedores sem alterar fluxos de Contas a Pagar.",
      "Atualizada versão técnica do front-end e backend para 0.1.1.",
    ],
    architecture: {
      frontend: [
        "Next.js App Router",
        "React",
        "TypeScript",
        "TailwindCSS",
        "Financeiro",
      ],
      backend: ["Node.js", "Express.js", "JWT", "REST API Financeiro", "PM2"],
      database: [
        "PostgreSQL",
        "fin_fornecedores",
        "fin_bancos_contas",
        "hub_system_releases",
      ],
      integrations: [
        "Lista local de bancos brasileiros",
        "Changelog versionado no banco",
      ],
    },
  },
  {
    version: "0.1.2",
    title: "Financeiro — cálculo e gravação de valores da parcela",
    description:
      "Correção em Contas a Pagar para salvar multa, juros, desconto e valor final das parcelas, além de normalizar os campos monetários sem quatro casas decimais.",
    frontend_version: "0.1.2",
    backend_version: "0.1.2",
    released_at: "2026-05-21T14:30:00.000Z",
    changes: [
      "Corrigida a gravação de multa, juros, desconto, acréscimo e valor final das parcelas em novos lançamentos de Contas a Pagar.",
      "Corrigida a edição de lançamentos para preservar parcelas pagas e atualizar os valores financeiros somente das parcelas ainda não baixadas.",
      "Adicionado cálculo visual do valor final da parcela no formulário de Contas a Pagar: valor + acréscimo + multa + juros - desconto.",
      "Normalizada a exibição dos campos monetários das parcelas para evitar valores com quatro casas decimais como 1500,0000 e 0,0000.",
      "Corrigido o parser monetário do backend para aceitar decimal técnico com ponto sem multiplicar o valor indevidamente.",
      "Atualizada versão técnica do front-end e backend para 0.1.2.",
    ],
    architecture: {
      frontend: [
        "Next.js App Router",
        "React",
        "TypeScript",
        "TailwindCSS",
        "Contas a Pagar",
      ],
      backend: ["Node.js", "Express.js", "JWT", "REST API Financeiro", "PM2"],
      database: [
        "PostgreSQL",
        "fin_lancamentos_cp",
        "fin_parcelas_cp",
        "fin_movimento",
        "hub_system_releases",
      ],
      integrations: [
        "Movimento Bancário integrado ao Contas a Pagar",
        "Changelog versionado no banco",
      ],
    },
  },
  {
    version: "0.1.3",
    title: "Contas a Pagar — campos monetários sem setas",
    description:
      "Ajuste no formulário de Contas a Pagar para remover setas dos campos monetários, aceitar vírgula decimal e preservar multa, juros, desconto e valor final no salvamento.",
    frontend_version: "0.1.3",
    backend_version: "0.1.3",
    released_at: "2026-05-21T15:00:00.000Z",
    changes: [
      "Removidos os controles nativos de subir/descer dos campos monetários do lançamento e da baixa em Contas a Pagar.",
      "Alterados os campos Valor Total, Valor da Parcela, Multa, Juros, Desconto, Acréscimos e Valor Final para entrada decimal em texto com inputMode decimal.",
      "Corrigido o cálculo do Valor Total e das parcelas para usar parser monetário compatível com vírgula decimal, evitando perda de centavos ao salvar.",
      "Mantida a gravação de multa, juros, desconto, acréscimo e valor final no payload enviado ao backend.",
      "Atualizada versão técnica do front-end e backend para 0.1.3.",
    ],
    architecture: {
      frontend: [
        "Next.js App Router",
        "React",
        "TypeScript",
        "TailwindCSS",
        "Contas a Pagar",
      ],
      backend: ["Node.js", "Express.js", "JWT", "REST API Financeiro", "PM2"],
      database: [
        "PostgreSQL",
        "fin_lancamentos_cp",
        "fin_parcelas_cp",
        "hub_system_releases",
      ],
      integrations: [
        "Movimento Bancário integrado ao Contas a Pagar",
        "Changelog versionado no banco",
      ],
    },
  },
  {
    version: "0.1.4",
    title: "Contas a Pagar — preservação de valores por parcela",
    description:
      "Correção no formulário de Contas a Pagar para formatar valores monetários vindos do banco e impedir que o recálculo automático das parcelas apague multa, juros e desconto carregados ou digitados.",
    frontend_version: "0.1.4",
    backend_version: "0.1.4",
    released_at: "2026-05-21T15:30:00.000Z",
    changes: [
      "Corrigida a exibição de Valor Total vindo do banco como 1500.0000, formatando para padrão monetário PT-BR no formulário.",
      "Corrigida a edição de lançamento para preservar multa, juros, desconto, acréscimo e valor final das parcelas carregadas do backend.",
      "Ajustado o recálculo automático de parcelas para não zerar multa, juros e desconto já digitados pelo usuário.",
      "Tornado explícito o payload das parcelas no salvamento para garantir envio de valores financeiros por parcela ao backend.",
      "Atualizada versão técnica do front-end e backend para 0.1.4.",
    ],
    architecture: {
      frontend: [
        "Next.js App Router",
        "React",
        "TypeScript",
        "TailwindCSS",
        "Contas a Pagar",
      ],
      backend: ["Node.js", "Express.js", "JWT", "REST API Financeiro", "PM2"],
      database: [
        "PostgreSQL",
        "fin_lancamentos_cp",
        "fin_parcelas_cp",
        "hub_system_releases",
      ],
      integrations: [
        "Movimento Bancário integrado ao Contas a Pagar",
        "Changelog versionado no banco",
      ],
    },
  },
  {
    version: "0.1.5",
    title: "CRM — ações em massa, listas inteligentes e fila de ações manuais",
    description:
      "Evolução do módulo CRM com seleção múltipla de leads e ações em lote, listas inteligentes para salvar filtros, fila centralizada de ações manuais (ligações, SMS, visitas) e exportação de leads para Excel.",
    frontend_version: "0.1.5",
    backend_version: "0.1.5",
    released_at: "2026-05-21T20:00:00.000Z",
    changes: [
      "Adicionado campo type nas tarefas de lead (geral, ligação, SMS, e-mail, visita, outro) via migrate_crm_fase5.js.",
      "Adicionado select de tipo ao criar tarefa no modal do lead, com ícone visual por tipo.",
      "Criada tabela crm_smart_lists para salvar combinações de filtros nomeadas por tenant.",
      "Adicionado CRUD completo de listas inteligentes: POST, GET e DELETE em /crm/smart-lists.",
      "Implementada faixa de listas inteligentes no CRM: salvar filtro atual, aplicar com um clique e remover.",
      "Adicionadas rotas POST /crm/leads/bulk-update e POST /crm/leads/bulk-delete para operações em lote.",
      "Implementada seleção múltipla de leads na visão lista com checkbox por linha e checkbox de selecionar tudo.",
      "Adicionada barra flutuante de ações em massa: mover etapa, atribuir responsável, mudar temperatura, exportar e inativar em lote.",
      "Adicionada nova aba 'Ações manuais' no CRM: fila centralizada de tarefas de ligação, SMS e visita pendentes.",
      "Fila de ações manuais exibe contato, tipo, título, responsável, vencimento e prioridade; clicar abre o lead direto.",
      "Filtros da fila de ações manuais por tipo (ligação/SMS/visita), responsável e status (pendente/concluída/cancelada).",
      "Adicionado botão Exportar Excel no CRM que exporta todos os leads do filtro ativo em .xlsx.",
      "Adicionado índice de banco idx_crm_tasks_type_status para otimizar consultas da fila de ações manuais.",
      "Atualizada versão técnica do front-end e backend para 0.1.5.",
    ],
    architecture: {
      frontend: [
        "Next.js App Router",
        "React",
        "TypeScript",
        "TailwindCSS",
        "CRM v0.1.5",
        "XLSX export",
      ],
      backend: [
        "Node.js",
        "Express.js",
        "JWT",
        "REST API CRM v0.1.5",
        "PM2",
        "Auditoria",
      ],
      database: [
        "PostgreSQL",
        "crm_smart_lists",
        "crm_lead_tasks (type)",
        "crm_leads",
        "hub_system_releases",
      ],
      integrations: [
        "AWS SES / SNS (campanhas)",
        "Exportação XLSX local",
        "Changelog versionado no banco",
      ],
    },
  },
  {
    version: "0.1.6",
    title: "Conversas — inbox por lead, SLA e acoes manuais",
    description: "Novo modulo Conversas com inbox unificado de interacoes por lead, fila de acoes manuais, desempenho de SLA e configuracao de metas de tempo de resposta.",
    frontend_version: "0.1.6",
    backend_version: "0.1.6",
    released_at: "2026-05-21T22:00:00.000Z",
    changes: [
      "Criado modulo Conversas em /conversas com 4 abas: Conversas, Acoes manuais, Estatisticas e Configuracoes.",
      "Aba Conversas: inbox de leads com filtros Todos / Nao lidos / Marcados, busca e lista por ultima atividade.",
      "Thread de conversa: timeline unificada de crm_communication_events e crm_lead_history com icones por tipo.",
      "Compose bar: registrar Nota, Ligacao, WhatsApp, SMS ou E-mail diretamente na conversa.",
      "Adicionados endpoints GET/POST /crm/conversations, GET /crm/conversations/:id/events, POST /crm/conversations/:id/events, PATCH /crm/conversations/:id.",
      "Aba Acoes manuais: fila centralizada de tarefas com filtros por tipo, responsavel e status.",
      "Aba Estatisticas SLA: KPIs de total de conversas, SLA cumprido, tempo medio de resposta e distribuicao de status.",
      "Aba Configuracoes SLA: toggle para ativar SLA, campos de tempo de primeira resposta e resolucao em minutos.",
      "Criada tabela crm_conversations para metadata de conversa por lead (starred, unread, last_event_at, SLA tracking).",
      "Criada tabela crm_sla_configs para configuracao de SLA por tenant.",
      "Adicionados canais ligacao e nota ao check constraint de crm_communication_events.",
      "Adicionados GET /crm/sla-config, POST /crm/sla-config e GET /crm/sla-stats ao backend.",
      "Adicionado link Conversas no submenu CRM & Funil da sidebar.",
      "Atualizada versao tecnica do front-end e backend para 0.1.6.",
    ],
    architecture: {
      frontend: ["Next.js App Router", "React", "TypeScript", "TailwindCSS", "Modulo Conversas v0.1.6"],
      backend: ["Node.js", "Express.js", "JWT", "REST API Conversas v0.1.6", "PM2", "Auditoria"],
      database: ["PostgreSQL", "crm_conversations", "crm_sla_configs", "crm_communication_events (canais ampliados)", "hub_system_releases"],
      integrations: ["crm_communication_events", "crm_lead_history (unificados na timeline)", "Changelog versionado no banco"],
    },
  },
  {
    version: "0.1.7",
    title: "Marketing & Midia — painel unificado de campanhas, atribuicao, ligacoes e auditoria",
    description: "Novo modulo Marketing & Midia com visao geral, Google Ads, Meta Ads, relatorio de atribuicao UTM, relatorio de ligacoes e auditoria de marketing local. Dados de amostra ate integracao com APIs.",
    frontend_version: "0.1.7",
    backend_version: "0.1.6",
    released_at: "2026-05-21T23:00:00.000Z",
    changes: [
      "Criada pagina /marketing com 6 abas: Visao Geral, Google Ads, Meta Ads, Atribuicao, Ligacoes e Auditoria Local.",
      "Aba Visao Geral: KPIs consolidados (impressoes, cliques, leads, conversoes, investido) com graficos de area e barra por mes.",
      "Aba Google Ads: replica da tela GHL com 3 graficos de area, 4 KPIs de custo e tabela de campanhas com status.",
      "Aba Meta Ads: identica ao Google Ads com dados de Meta/Facebook Ads e coluna CTR.",
      "Aba Atribuicao: cards de receita/ganhos/leads e tabela de eventos de sessao com colunas UTM completas.",
      "Aba Ligacoes: grafico de rosca por status (atendida/perdida/voicemail), tabela de fontes e log completo de ligacoes.",
      "Aba Auditoria Local: 3 gauges circulares (site, SEO local, GBP), tabela de posicoes de busca e mapa de calor de cobertura local.",
      "Todos os dados sao mockup (amostra) com banner de aviso. Integracao real com Google/Meta OAuth e configuracoes em versao futura.",
      "Adicionado item Marketing & Midia na sidebar entre CRM & Funil e Landing Pages.",
      "Atualizada versao tecnica do front-end para 0.1.7 (sem mudanca de backend nesta versao).",
    ],
    architecture: {
      frontend: ["Next.js App Router", "React", "TypeScript", "TailwindCSS", "Recharts", "Marketing v0.1.7"],
      backend: ["Node.js", "Express.js", "JWT", "REST API v0.1.6", "PM2"],
      database: ["PostgreSQL", "hub_system_releases"],
      integrations: ["Google Ads OAuth (planejado)", "Meta Ads API (planejado)", "Google Business Profile (planejado)", "Changelog versionado no banco"],
    },
  },
  {
    version: "0.1.8",
    title: "Marketing & Midia — Controladoria integrada, sub-tabs Relatorio/Orcamento",
    description: "Controladoria de midia absorvida pelo modulo Marketing & Midia. Cada plataforma (Google Ads e Meta Ads) agora tem dois modos: Relatorio (mockup/API futura) e Orcamento (gestao mensal real com campanhas, depositos e calendario diario). Item Controladoria removido do menu.",
    frontend_version: "0.1.8",
    backend_version: "0.1.6",
    released_at: "2026-05-22T00:00:00.000Z",
    changes: [
      "Google Ads e Meta Ads agora tem sub-tabs: Relatorio (badge AMOSTRA) e Orcamento (badge REAL).",
      "Sub-tab Orcamento incorpora toda a logica da antiga pagina Controladoria: campanhas ativas, valores estimado/realizado, depositos mensais e calendario diario.",
      "Modal de registro de deposito integrado dentro de cada sub-tab de orcamento.",
      "Progress bar visual do percentual realizado vs estimado no painel de orcamento.",
      "Campanhas pausadas exibidas com risca e opacidade para diferenciar das ativas.",
      "Removido item Controladoria do menu lateral — funcionalidade agora em Marketing & Midia.",
      "Botao Conectar conta adicionado no banner de aviso das abas de relatorio.",
      "Atualizada versao tecnica do front-end para 0.1.8.",
    ],
    architecture: {
      frontend: ["Next.js App Router", "React", "TypeScript", "TailwindCSS", "Recharts", "Marketing v0.1.8"],
      backend: ["Node.js", "Express.js", "JWT", "REST API v0.1.6", "PM2"],
      database: ["PostgreSQL", "hub_system_releases"],
      integrations: ["Google Ads OAuth (planejado)", "Meta Ads API (planejado)", "Changelog versionado no banco"],
    },
  },
  {
    version: "0.1.9",
    title: "Reservas e Propostas — ciclo comercial do lote",
    description: "Modulo de Reservas com SLA de expiracao e trava anti-dupla venda. Modulo de Propostas com precificacao, alçadas de aprovacao por desconto e workflow ate o contrato. Ambos integrados ao CRM e ao Mapa de Lotes.",
    frontend_version: "0.1.9",
    backend_version: "0.1.9",
    released_at: "2026-05-22T02:00:00.000Z",
    changes: [
      "Criado modulo Reservas em /reservas: bloqueio temporario de lote com SLA configuravel (24h/48h/72h/7d).",
      "Trava anti-dupla venda: backend rejeita nova reserva ativa para lote ja reservado (HTTP 409).",
      "Auto-expiracao de reservas: ao listar, o backend atualiza status para expirada se expires_at < NOW().",
      "Alerta visual para reservas expirando em menos de 2 horas. Timer SLA em tempo real por linha.",
      "Acoes de prorrogar (+24h, somente manager/admin) e cancelar reserva com motivo.",
      "Acao de converter reserva em proposta (muda status para convertida).",
      "Cards de KPI: ativas, expirando em breve, expiradas, convertidas, canceladas.",
      "Criado modulo Propostas em /propostas: precificacao com preco lista vs negociado.",
      "Calculo automatico de desconto percentual. Desconto acima de 5% gera status aguardando_aprovacao automaticamente.",
      "Simulador embutido no formulario: entrada, valor financiado e parcela aproximada (Price) calculados em tempo real.",
      "Workflow de aprovacao: aprovar (manager/admin), recusar com motivo, converter em contrato.",
      "Vincular proposta a reserva ativa: campos de lote preenchidos automaticamente ao selecionar a reserva.",
      "Modal de detalhe da proposta com resumo completo de valores, condicoes, historico de aprovacao.",
      "KPIs: rascunhos, aguardando, aprovadas, recusadas, convertidas, pipeline aprovado, desconto medio.",
      "Criadas tabelas com_reservas e com_propostas via migrate_reservas_propostas.js.",
      "Adicionados endpoints GET/POST /reservas, PATCH /reservas/:id/cancel, extend, convert.",
      "Adicionados endpoints GET/POST /propostas, PATCH /propostas/:id/aprovar, recusar, converter.",
      "Adicionados GET /reservas/stats e GET /propostas/stats.",
      "Adicionados links Reservas e Propostas no submenu CRM & Funil da sidebar.",
      "server.js atualizado para registrar reservas_propostas routes.",
      "Atualizada versao tecnica do front-end e backend para 0.1.9.",
    ],
    architecture: {
      frontend: ["Next.js App Router", "React", "TypeScript", "TailwindCSS", "Reservas v0.1.9", "Propostas v0.1.9"],
      backend: ["Node.js", "Express.js", "JWT", "REST API v0.1.9", "PM2", "Auditoria"],
      database: ["PostgreSQL", "com_reservas", "com_propostas", "hub_system_releases"],
      integrations: ["crm_leads (lead vinculado)", "hub_users (responsavel, aprovador)", "Changelog versionado no banco"],
    },
  },
  {
    version: "0.2.0",
    title: "Agenda, Comissoes e Corretores — ciclo comercial completo",
    description: "Modulo de Agenda com calendario visual de tarefas por lead. Modulo de Comissoes com elegibilidade automatica, split corretor/imobiliaria e fluxo de pagamento. Cadastro de Corretores e Parceiros com exclusividade regional.",
    frontend_version: "0.2.0",
    backend_version: "0.2.0",
    released_at: "2026-05-22T04:00:00.000Z",
    changes: [
      "Criado modulo Agenda em /agenda: calendario mensal com tarefas de todos os leads.",
      "Calendario exibe tarefas com icone por tipo (ligacao, SMS, email, visita, geral) em cada celula de dia.",
      "Painel lateral de detalhe do dia: tarefas pendentes com opcao de concluir, e tarefas concluidas com risca.",
      "Cards de resumo mensal: total de ligacoes, SMS, e-mails e visitas pendentes no mes.",
      "Lista de tarefas sem data definida abaixo do calendario para nao perder nenhuma atividade.",
      "Filtros de tipo e responsavel no calendario. Navegacao por mes com setas.",
      "Criado modulo Comissoes em /comissoes com duas abas: Comissoes e Corretores & Parceiros.",
      "Aba Comissoes: registro de comissao vinculada a venda, com calculo automatico de comissao bruta e split.",
      "Auto-elegibilidade: backend atualiza status para elegivel quando elapsed >= elegivel_apos_dias.",
      "Fluxo de pagamento: botao Pagar disponivel para comissoes elegiveis ou em_pagamento.",
      "KPIs: a pagar, total pago, comissao bruta, valor corretor.",
      "Aba Corretores: cadastro de corretores autonomos e imobiliarias parceiras.",
      "Suporte a exclusividade regional de imobiliaria — campo e toggle no cadastro.",
      "Split configuravel: para imobiliarias, define percentual entre corretor indicado e a imobiliaria.",
      "KPIs de corretores: autonomos, imobiliarias, com exclusividade, comissao media.",
      "Criadas tabelas com_corretores e com_comissoes via migrate_corretores_comissoes.js.",
      "Adicionada coluna corretor_id em crm_leads para rastrear origem do lead.",
      "Adicionados endpoints GET/POST /corretores, PATCH /corretores/:id, GET /corretores/stats.",
      "Adicionados endpoints GET/POST /comissoes, PATCH /comissoes/:id/pagar, PATCH /comissoes/:id/status, GET /comissoes/stats.",
      "Adicionados links Comissoes e Agenda no submenu CRM & Funil da sidebar.",
      "server.js atualizado para registrar corretores_comissoes routes.",
      "Atualizada versao tecnica do front-end e backend para 0.2.0.",
    ],
    architecture: {
      frontend: ["Next.js App Router", "React", "TypeScript", "TailwindCSS", "Agenda v0.2.0", "Comissoes v0.2.0"],
      backend: ["Node.js", "Express.js", "JWT", "REST API v0.2.0", "PM2", "Auditoria"],
      database: ["PostgreSQL", "com_corretores", "com_comissoes", "crm_leads (corretor_id)", "hub_system_releases"],
      integrations: ["com_propostas (comissao vinculada)", "crm_lead_tasks (agenda)", "Changelog versionado no banco"],
    },
  },
  {
    version: "0.2.1",
    title: "Recebiveis Santa Clara — contratos reais, parcelas, cobranca, projecao e acordos",
    description: "Ciclo financeiro completo dos contratos de venda de lotes. Contratos com backend real e geracao automatica de parcelas ao assinar. Modulo de Recebiveis com carteira, parcelas, regua de cobranca, projecao de fluxo por safra e acordos/renegociacoes.",
    frontend_version: "0.2.1",
    backend_version: "0.2.1",
    released_at: "2026-05-22T06:00:00.000Z",
    changes: [
      "Contratos agora tem backend real — criacao, listagem, stats e workflow de assinatura.",
      "Ao assinar um contrato, parcelas sao geradas automaticamente (Price, SAC, a vista ou permuta).",
      "Entrada gerada como parcela numero 0 do tipo 'entrada'. Parcelas mensais a partir do mes seguinte.",
      "Workflow de contrato: rascunho, aguardando_assinatura, assinado, distratado, quitado.",
      "Barra de adimplencia por contrato: parcelas_pagas/parcelas_total com indicador visual.",
      "Criado modulo Recebiveis em /recebiveis com 5 abas: Carteira, Parcelas, Cobranca, Projecao e Acordos.",
      "Aba Carteira: visao consolidada de contratos ativos com saldo, adimplencia e parcelas em atraso.",
      "Aba Parcelas: listagem completa com filtros por status (aberta/atrasada/paga), baixa manual com modal.",
      "Baixa de parcela: valor recebido, forma de pagamento e data do pagamento configuravel.",
      "Auto-marcacao de parcelas atrasadas via funcao SQL fn_parcelas_atualiza_atraso().",
      "Aba Cobranca: regua em lote — dispara cobranca SMS/WhatsApp/email/ligacao para todas as parcelas atrasadas.",
      "Historico de acoes de cobranca por parcela e por contrato.",
      "Aba Projecao: grafico de barras de fluxo previsto vs realizado por mes. Tabela de safras com % de adimplencia.",
      "Projecao configuravel para 6, 12, 24 ou 36 meses.",
      "Aba Acordos: listagem de renegociacoes/distratos/quitacoes antecipadas com workflow de aprovacao.",
      "Alerta de banner quando ha parcelas atrasadas ou acordos pendentes.",
      "Criadas tabelas com_contratos, com_parcelas, com_cobrancas e com_acordos via migrate_recebiveis.js.",
      "Adicionado modulo Recebiveis no menu lateral como item standalone.",
      "server.js atualizado para registrar recebiveis routes em /contratos, /parcelas, /cobrancas, /acordos, /recebiveis.",
      "Atualizada versao tecnica do front-end e backend para 0.2.1.",
    ],
    architecture: {
      frontend: ["Next.js App Router", "React", "TypeScript", "TailwindCSS", "Recharts", "Recebiveis v0.2.1"],
      backend: ["Node.js", "Express.js", "JWT", "REST API v0.2.1", "PM2", "Auditoria"],
      database: ["PostgreSQL", "com_contratos", "com_parcelas", "com_cobrancas", "com_acordos", "hub_system_releases"],
      integrations: ["crm_leads (comprador)", "com_propostas (proposta de origem)", "hub_users (responsavel)", "Changelog versionado no banco"],
    },
  },

  {
    version: "0.2.2",
    title: "Contas a Pagar — fornecedor pesquisável, valor final e cancelamento de baixa",
    description:
      "Ajustes no financeiro para melhorar Contas a Pagar: busca de fornecedores no formulário, alerta de validação mais claro, exibição dos ajustes e valor final da parcela, baixa separada e cancelamento de baixa.",
    frontend_version: "0.2.2",
    backend_version: "0.2.2",
    released_at: "2026-05-25T14:00:00.000Z",
    changes: [
      "Substituído o campo Fornecedor do filtro e do formulário de Contas a Pagar por seletor pesquisável por razão social, nome fantasia, CNPJ/CPF ou empresa.",
      "Mantido o bloqueio do Número do Documento com menos de 9 dígitos, agora com alerta geral claro: Revise os campos: algum deles está impedindo o envio das informações.",
      "A coluna Valor passou a exibir o valor final previsto da parcela, considerando base, multa, juros, desconto e acréscimo do lançamento.",
      "A coluna Valor também exibe os detalhes de multa, juros, desconto e acréscimo quando existirem no lançamento.",
      "A baixa passou a usar campos financeiros separados dos valores originais da parcela: baixa_acrescimo, baixa_desconto, baixa_juros, baixa_multa e baixa_valor_final.",
      "A coluna Pagamento passou a exibir o valor final da baixa separadamente do valor final previsto do lançamento.",
      "Adicionado botão Cancelar baixa em parcelas pagas, retornando a parcela para pendente sem alterar o valor/descrição original da baixa no formulário.",
      "Criada rota PUT /lancamentos-cp/:id/parcelas/:parcId/cancelar-baixa para desfazer a baixa e remover o movimento bancário vinculado.",
      "Criada migration migrate_baixa_separada_contas_pagar.js para atualizar bases existentes sem recriar tabelas.",
      "Atualizadas as migrations financeiras para contemplar os novos campos de baixa em instalações novas e bases existentes.",
      "Sincronizado o seed real de versionamento entre front-end e backend.",
      "Atualizada versão técnica do front-end e backend para 0.2.2.",
    ],
    architecture: {
      frontend: [
        "Next.js App Router",
        "React",
        "TypeScript",
        "TailwindCSS",
        "Financeiro",
      ],
      backend: [
        "Node.js",
        "Express.js",
        "JWT",
        "REST API Financeiro",
        "PM2",
        "Auditoria",
      ],
      database: [
        "PostgreSQL",
        "fin_lancamentos_cp",
        "fin_parcelas_cp",
        "fin_movimento",
        "hub_system_releases",
      ],
      integrations: [
        "Movimento Bancário integrado ao Contas a Pagar",
        "Changelog versionado no banco",
      ],
    },
  },
  {
    version: "0.2.3",
    title: "Financeiro — importação de fornecedores por planilha",
    description:
      "Adicionado fluxo de importação de fornecedores por planilha no módulo Financeiro, com modelo padronizado, ciclos de até 100 registros e atualização automática quando o CNPJ/CPF já existir.",
    frontend_version: "0.2.3",
    backend_version: "0.2.3",
    released_at: "2026-05-25T14:30:00.000Z",
    changes: [
      "Adicionado botão Importar fornecedores na tela Financeiro > Fornecedores.",
      "Adicionado botão Baixar modelo da planilha com colunas padronizadas para o cliente preencher.",
      "Implementada leitura de arquivos .xlsx, .xls e .csv no frontend usando a dependência XLSX já existente no projeto.",
      "A importação envia fornecedores válidos ao backend em ciclos de 100 registros para evitar carga desnecessária.",
      "Criado endpoint POST /financeiro/fornecedores/importar para criação e atualização em lote.",
      "Quando o CNPJ/CPF já existe, o fornecedor é atualizado; quando não existe, um novo cadastro é criado.",
      "Adicionado resumo de importação com criados, atualizados, ignorados e erros por linha.",
      "Atualizada versão técnica do front-end e backend para 0.2.3.",
    ],
    architecture: {
      frontend: [
        "Next.js App Router",
        "React",
        "TypeScript",
        "TailwindCSS",
        "XLSX",
        "Financeiro Fornecedores v0.2.3",
      ],
      backend: ["Node.js", "Express.js", "JWT", "REST API Financeiro", "PM2", "Auditoria"],
      database: ["PostgreSQL", "fin_fornecedores", "hub_system_releases"],
      integrations: [
        "Importação XLSX/CSV local",
        "Changelog versionado no banco",
      ],
    },
  },
  {
    version: "0.2.4",
    title: "Financeiro — inativação e reativação de contas bancárias",
    description:
      "Ajuste no módulo Bancos e Contas para permitir inativar contas sem apagar histórico financeiro, reativar quando necessário e filtrar contas por status.",
    frontend_version: "0.2.4",
    backend_version: "0.2.4",
    released_at: "2026-05-25T15:00:00.000Z",
    changes: [
      "Adicionado botão Inativar na listagem de Financeiro > Bancos e Contas.",
      "Contas inativadas deixam de aparecer na listagem padrão, preservando lançamentos e histórico financeiro.",
      "Adicionado filtro de status para visualizar contas ativas, inativas ou todas as contas.",
      "Adicionado botão Reativar quando uma conta inativa estiver visível na listagem.",
      "Desabilitado o lançamento extra em contas inativas para evitar novas movimentações indevidas.",
      "Criado endpoint PATCH /financeiro/bancos/:id/status para ativar ou inativar conta bancária sem exclusão física.",
      "Mantido DELETE /financeiro/bancos/:id como soft delete, agora retornando a conta atualizada.",
      "Atualizada versão técnica do front-end e backend para 0.2.4.",
    ],
    architecture: {
      frontend: [
        "Next.js App Router",
        "React",
        "TypeScript",
        "TailwindCSS",
        "Financeiro Bancos v0.2.4",
      ],
      backend: ["Node.js", "Express.js", "JWT", "REST API Financeiro", "PM2"],
      database: [
        "PostgreSQL",
        "fin_bancos_contas",
        "fin_bancos_lancamentos",
        "fin_movimento",
        "hub_system_releases",
      ],
      integrations: [
        "Movimento Bancário integrado às contas bancárias",
        "Changelog versionado no banco",
      ],
    },
  },

  {
    version: "0.3.10",
    title: "Financeiro — detalhes do Cash Flow e ajustes de fornecedores",
    description:
      "Adiciona abertura de lançamentos no Cash Flow mensal e diário, botão direto para inativar/reativar fornecedores na listagem e flexibiliza o número do documento em Contas a Pagar para mínimo de 1 caractere.",
    frontend_version: "0.3.10",
    backend_version: "0.3.10",
    released_at: "2026-05-31T20:40:00.000Z",
    changes: [
      "Adicionado botão Inativar/Reativar na coluna Ações da listagem de Fornecedores, preservando o status atual e sem exclusão física.",
      "Alterada a validação do campo NF / Nº Documento em Contas a Pagar de mínimo 9 dígitos numéricos para mínimo 1 caractere.",
      "Adicionado modal de detalhamento no Cash Flow para abrir os lançamentos por célula na visão mensal ou diária.",
      "Criado endpoint GET /financeiro/cashflow/lancamentos para retornar lançamentos do Movimento Bancário, Contas a Pagar Futuro e Contas a Receber Futuro conforme linha, mês e dia selecionados.",
      "Mantidas as regras existentes de fornecedores, contratos, bancos, contas a pagar, movimento bancário, reservas, comissões e recebíveis sem alteração estrutural.",
      "Atualizada versão técnica do front-end e backend para 0.3.10."
    ],
    architecture: {
      frontend: [
        "Next.js App Router",
        "React",
        "TypeScript",
        "TailwindCSS",
        "Cash Flow Detalhes v0.3.10"
      ],
      backend: [
        "Node.js",
        "Express.js",
        "JWT",
        "REST API Financeiro",
        "PM2"
      ],
      database: [
        "PostgreSQL",
        "fin_movimento",
        "fin_lancamentos_cp",
        "fin_parcelas_cp",
        "hub_system_releases"
      ],
      integrations: [
        "Movimento Bancário",
        "Contas a Pagar Futuro",
        "Contas a Receber Futuro",
        "Changelog versionado no banco"
      ],
    },
  },

  {
    version: "0.3.11",
    title: "Financeiro — ajuste de lançamentos do Cash Flow diário",
    description:
      "Corrige a abertura de lançamentos nas linhas sintéticas do Cash Flow diário, inclui lançamentos internos de banco sem movimento vinculado e melhora a navegação horizontal da tabela com colunas fixas.",
    frontend_version: "0.3.11",
    backend_version: "0.3.11",
    released_at: "2026-05-31T22:10:00.000Z",
    changes: [
      "Corrigido o modal de lançamentos do Cash Flow diário para Receitas Realizadas, Despesas Realizadas e Saldo do Dia, sem filtrar indevidamente por natureza financeira 1/2/5.",
      "Incluídos lançamentos internos de banco existentes em fin_bancos_lancamentos sem movimento_id vinculado na composição da visão diária e no modal de detalhes.",
      "Mantido o filtro por natureza financeira nas linhas reais do Cash Flow mensal, preservando o comportamento existente.",
      "Adicionada barra de rolagem horizontal superior na tabela do Cash Flow para facilitar navegação em meses/dias.",
      "Travadas as colunas # e Descrição no Cash Flow para manter os nomes das linhas visíveis durante a rolagem horizontal.",
      "Atualizada versão técnica do front-end e backend para 0.3.11."
    ],
    architecture: {
      frontend: [
        "Next.js App Router",
        "React",
        "TypeScript",
        "TailwindCSS",
        "Cash Flow Sticky Columns v0.3.11"
      ],
      backend: [
        "Node.js",
        "Express.js",
        "JWT",
        "REST API Financeiro",
        "PM2"
      ],
      database: [
        "PostgreSQL",
        "fin_movimento",
        "fin_bancos_lancamentos",
        "fin_bancos_contas",
        "hub_system_releases"
      ],
      integrations: [
        "Movimento Bancário",
        "Lançamentos internos de banco",
        "Cash Flow Detalhado",
        "Changelog versionado no banco"
      ],
    },
  },


  {
    version: "0.3.12",
    title: "Financeiro — Cash Flow por Movimento Bancário e seed futuro de Contas a Pagar",
    description:
      "Ajusta o detalhamento do Cash Flow diário para usar o Movimento Bancário como fonte realizada, reforça o fallback visual do modal e adiciona importação de lançamentos futuros de 2026 diretamente em Contas a Pagar, sem criar movimento bancário antes da baixa.",
    frontend_version: "0.3.12",
    backend_version: "0.3.12",
    released_at: "2026-05-31T23:00:00.000Z",
    changes: [
      "Ajustado o backend do Cash Flow diário para buscar lançamentos realizados diretamente em fin_movimento, com filtro robusto por empresa, ano, mês e dia.",
      "Corrigido o detalhamento de Receitas Realizadas e Despesas Realizadas para aceitar valores de saída/entrada diferentes de zero, evitando modal vazio quando a célula possui valor.",
      "Mantido o uso de fin_bancos_lancamentos apenas para lançamentos internos sem movimento_id, evitando duplicidade quando já existe vínculo com o Movimento Bancário.",
      "Adicionado fallback no frontend para consultar a mesma listagem de Movimento Bancário quando o endpoint de detalhes do Cash Flow diário não localizar itens.",
      "Adicionado script de importação de contas a pagar futuras de 2026, gravando somente fin_lancamentos_cp e fin_parcelas_cp como pendente.",
      "Garantido que o Excel futuro de Contas a Pagar não alimente fin_movimento; o Movimento Bancário só é criado pelo rito normal de pagamento/baixa.",
      "Atualizada versão técnica do front-end e backend para 0.3.12."
    ],
    architecture: {
      frontend: [
        "Next.js App Router",
        "React",
        "TypeScript",
        "TailwindCSS",
        "Cash Flow Detalhes v0.3.12"
      ],
      backend: [
        "Node.js",
        "Express.js",
        "JWT",
        "REST API Financeiro",
        "Importação Contas a Pagar Futuro"
      ],
      database: [
        "PostgreSQL",
        "fin_movimento",
        "fin_lancamentos_cp",
        "fin_parcelas_cp",
        "fin_bancos_lancamentos",
        "hub_system_releases"
      ],
      integrations: [
        "Movimento Bancário",
        "Contas a Pagar Futuro",
        "Excel 2026 futuro",
        "Changelog versionado no banco"
      ],
    },
  },


  {
    version: "0.3.13",
    title: "Financeiro — Orçamento mensal, exportações e baixa com conta bancária",
    description:
      "Cria o módulo inicial de Orçamento Mensal com visão Previsto x Realizado, adiciona exportação Excel no Movimento Bancário e em Contas a Pagar, padroniza status do Movimento e exige conta bancária na baixa de parcelas.",
    frontend_version: "0.3.13",
    backend_version: "0.3.13",
    released_at: "2026-05-31T23:45:00.000Z",
    changes: [
      "Adicionado módulo Financeiro > Orçamento com estrutura mensal Previsto x Realizado por linha financeira, preparado para receber futura planilha de orçamento.",
      "Adicionado botão Exportar Excel na tela de Movimento Bancário usando os filtros ativos da listagem.",
      "Adicionado botão Exportar Excel na tela de Contas a Pagar usando os filtros ativos da listagem.",
      "Padronizado o Movimento Bancário para exibir apenas status Realizado para movimentos diretos e Pago para movimentos gerados por baixa de Contas a Pagar.",
      "A baixa de parcela em Contas a Pagar agora exige a seleção da conta bancária de pagamento, com banco, agência e conta, e grava esse vínculo no movimento bancário.",
      "Adicionada barra de rolagem horizontal superior na listagem de Contas a Pagar para facilitar navegação lateral.",
      "Atualizada versão técnica do front-end e backend para 0.3.13."
    ],
    architecture: {
      frontend: [
        "Next.js App Router",
        "React",
        "TypeScript",
        "TailwindCSS",
        "Orçamento Mensal v0.3.13"
      ],
      backend: [
        "Node.js",
        "Express.js",
        "JWT",
        "REST API Financeiro",
        "Exportação Excel XML"
      ],
      database: [
        "PostgreSQL",
        "fin_movimento",
        "fin_lancamentos_cp",
        "fin_parcelas_cp",
        "fin_bancos_contas",
        "hub_system_releases"
      ],
      integrations: [
        "Movimento Bancário",
        "Contas a Pagar",
        "Orçamento Mensal",
        "Changelog versionado no banco"
      ],
    },
  },
  {
    version: "0.3.14",
    title: "Financeiro — Status do movimento e ajustes de tabelas",
    description:
      "Padroniza o Movimento Bancário para status Pago/Recebido, ajusta filtros, melhora a rolagem horizontal das tabelas e usa o histórico quando não houver fornecedor identificado em Contas a Pagar.",
    frontend_version: "0.3.14",
    backend_version: "0.3.14",
    released_at: "2026-05-31T23:58:00.000Z",
    changes: [
      "Movimento Bancário passa a exibir Pago para saídas e Recebido para entradas, removendo o status Realizado da listagem e dos filtros.",
      "Filtro de status do Movimento Bancário passa a disponibilizar apenas Todos, Pago e Recebido.",
      "Exportação do Movimento Bancário usa a mesma regra de status Pago/Recebido aplicada na tela.",
      "Adicionada barra de rolagem horizontal superior na tela de Movimento Bancário para melhorar a navegação lateral da tabela.",
      "A tabela de Contas a Pagar foi ajustada com largura fixa por coluna para reduzir o espaço excessivo entre Pagamento e Status.",
      "Quando Contas a Pagar não tiver fornecedor identificado, a listagem passa a mostrar o histórico do lançamento como referência principal.",
      "Atualizada versão técnica do front-end e backend para 0.3.14."
    ],
    architecture: {
      frontend: [
        "Next.js App Router",
        "React",
        "TypeScript",
        "TailwindCSS",
        "Financeiro v0.3.14"
      ],
      backend: [
        "Node.js",
        "Express.js",
        "JWT",
        "REST API Financeiro",
        "Exportação Excel XML"
      ],
      database: [
        "PostgreSQL",
        "fin_movimento",
        "fin_lancamentos_cp",
        "fin_parcelas_cp",
        "hub_system_releases"
      ],
      integrations: [
        "Movimento Bancário",
        "Contas a Pagar",
        "Changelog versionado no banco"
      ],
    },
  },

  {
    version: "0.3.15",
    title: "Financeiro — Correção dos status do Movimento Bancário",
    description:
      "Corrige a lista de status do Movimento Bancário para usar somente Pago e Realizado, removendo Pendente e o Pago duplicado no filtro.",
    frontend_version: "0.3.15",
    backend_version: "0.3.15",
    released_at: "2026-06-01T00:15:00.000Z",
    changes: [
      "Filtro de status do Movimento Bancário agora exibe somente Todos status, Pago e Realizado.",
      "Removidas as opções Pendente e Recebido do filtro do Movimento Bancário.",
      "Corrigido o rótulo do status Realizado, que estava aparecendo como Pago e gerando duplicidade visual.",
      "Backend do Movimento Bancário passa a retornar Pago para movimentos vinculados à baixa de Contas a Pagar e Realizado para movimentos bancários diretos/importados.",
      "Exportação Excel do Movimento Bancário passa a seguir a mesma regra de status Pago/Realizado.",
      "Atualizada versão técnica do front-end e backend para 0.3.15."
    ],
    architecture: {
      frontend: [
        "Next.js App Router",
        "React",
        "TypeScript",
        "TailwindCSS",
        "Financeiro v0.3.15"
      ],
      backend: [
        "Node.js",
        "Express.js",
        "JWT",
        "REST API Financeiro",
        "Exportação Excel XML"
      ],
      database: [
        "PostgreSQL",
        "fin_movimento",
        "fin_lancamentos_cp",
        "fin_parcelas_cp",
        "hub_system_releases"
      ],
      integrations: [
        "Movimento Bancário",
        "Contas a Pagar",
        "Changelog versionado no banco"
      ],
    },
  },


  {
    version: "0.3.16",
    title: "Financeiro — Status correto do Movimento Bancário",
    description:
      "Ajusta definitivamente o Movimento Bancário para trabalhar com os status Pago e Recebido, derivados do tipo do movimento: saídas como Pago e entradas como Recebido.",
    frontend_version: "0.3.16",
    backend_version: "0.3.16",
    released_at: "2026-06-01T00:25:00.000Z",
    changes: [
      "Movimento Bancário passa a exibir somente Pago e Recebido como status operacionais.",
      "Saídas/débitos do Movimento Bancário, inclusive registros antigos importados como realizado, passam a ser tratados e filtrados como Pago.",
      "Entradas/créditos do Movimento Bancário passam a ser tratadas e filtradas como Recebido.",
      "Filtro de status do Movimento Bancário passa a disponibilizar apenas Todos status, Pago e Recebido.",
      "Exportação Excel do Movimento Bancário passa a usar a mesma regra visual: saídas como Pago e entradas como Recebido.",
      "Mantida compatibilidade para status antigo realizado no backend, direcionando-o para o filtro de saídas/Pago quando recebido por cache ou versão anterior do front-end.",
      "Atualizada versão técnica do front-end e backend para 0.3.16."
    ],
    architecture: {
      frontend: [
        "Next.js App Router",
        "React",
        "TypeScript",
        "TailwindCSS",
        "Financeiro v0.3.16"
      ],
      backend: [
        "Node.js",
        "Express.js",
        "JWT",
        "REST API Financeiro",
        "Exportação Excel XML"
      ],
      database: [
        "PostgreSQL",
        "fin_movimento",
        "hub_system_releases"
      ],
      integrations: [
        "Movimento Bancário",
        "Changelog versionado no banco"
      ],
    },
  },


  {
    version: "0.3.17",
    title: "Financeiro — Saldo final do Movimento com saldos bancários",
    description:
      "Atualiza o resumo do Movimento Bancário para calcular o Saldo Final a partir dos saldos iniciais das contas bancárias de 01/01 do ano selecionado, somando entradas e subtraindo saídas.",
    frontend_version: "0.3.17",
    backend_version: "0.3.17",
    released_at: "2026-06-01T00:45:00.000Z",
    changes: [
      "O card de Saldo do Movimento Bancário passa a representar o Saldo Final do ano selecionado.",
      "O cálculo considera a soma dos saldos iniciais das contas bancárias ativas cadastradas para 01/01 do ano filtrado.",
      "Para 2026, o cálculo usa os saldos iniciais cadastrados em fin_bancos_contas com data_saldo_inicial em 2026.",
      "Saldo Final = saldos iniciais dos bancos + entradas do Movimento Bancário - saídas do Movimento Bancário.",
      "Quando houver filtro por empresa, banco ou conta bancária, o saldo inicial considerado respeita o mesmo recorte financeiro.",
      "Atualizada versão técnica do front-end e backend para 0.3.17."
    ],
    architecture: {
      frontend: [
        "Next.js App Router",
        "React",
        "TypeScript",
        "TailwindCSS",
        "Financeiro v0.3.17"
      ],
      backend: [
        "Node.js",
        "Express.js",
        "JWT",
        "REST API Financeiro"
      ],
      database: [
        "PostgreSQL",
        "fin_movimento",
        "fin_bancos_contas",
        "hub_system_releases"
      ],
      integrations: [
        "Movimento Bancário",
        "Bancos e Contas",
        "Changelog versionado no banco"
      ],
    },
  },


  {
    version: "0.3.18",
    title: "Financeiro — card de Saldo Inicial no Movimento Bancário",
    description:
      "Adiciona o card de Saldo Inicial no resumo do Movimento Bancário para deixar visível a composição do Saldo Final do ano selecionado.",
    frontend_version: "0.3.18",
    backend_version: "0.3.18",
    released_at: "2026-06-01T01:05:00.000Z",
    changes: [
      "Resumo do Movimento Bancário passa a exibir o card Saldo Inicial do ano selecionado, antes de Entradas, Saídas e Saldo Final.",
      "Para 2026, o card mostra a soma dos saldos iniciais das contas bancárias cadastradas em 01/01/2026.",
      "Frontend passa a calcular o Saldo Final com fallback explícito: Saldo Inicial + Entradas - Saídas, evitando exibir apenas o saldo do movimento quando o backend ainda estiver em cache.",
      "Backend passa a retornar também saldo_final e formula_saldo_final na resposta do Movimento Bancário para facilitar conferência da composição.",
      "Atualizada versão técnica do front-end e backend para 0.3.18."
    ],
    architecture: {
      frontend: [
        "Next.js App Router",
        "React",
        "TypeScript",
        "TailwindCSS",
        "Financeiro v0.3.18"
      ],
      backend: [
        "Node.js",
        "Express.js",
        "JWT",
        "REST API Financeiro"
      ],
      database: [
        "PostgreSQL",
        "fin_movimento",
        "fin_bancos_contas",
        "hub_system_releases"
      ],
      integrations: [
        "Movimento Bancário",
        "Bancos e Contas",
        "Changelog versionado no banco"
      ],
    },
  },


  {
    version: "0.3.19",
    title: "Financeiro — correção do Saldo Inicial no Movimento Bancário",
    description:
      "Corrige o cálculo e a exibição do Saldo Inicial no Movimento Bancário, usando a mesma base de saldos cadastrados em Bancos e Contas quando necessário.",
    frontend_version: "0.3.19",
    backend_version: "0.3.19",
    released_at: "2026-06-01T01:25:00.000Z",
    changes: [
      "Backend passa a somar os saldos iniciais das contas bancárias do ano selecionado e aplica fallback para a soma das contas ativas quando a data do saldo inicial não estiver preenchida na base.",
      "Resumo do Movimento Bancário passa a retornar aliases saldo_inicial, saldo_inicial_ano e saldo_inicial_bancos para evitar incompatibilidade entre versões de frontend e backend.",
      "Frontend passa a aceitar os aliases de saldo inicial e exibir R$ 0,00 no card quando o valor for zero, evitando mostrar apenas traço no card de conferência.",
      "Mantida a fórmula do Saldo Final: Saldo Inicial + Entradas - Saídas.",
      "Atualizada versão técnica do front-end e backend para 0.3.19."
    ],
    architecture: {
      frontend: [
        "Next.js App Router",
        "React",
        "TypeScript",
        "TailwindCSS",
        "Financeiro v0.3.19"
      ],
      backend: [
        "Node.js",
        "Express.js",
        "JWT",
        "REST API Financeiro"
      ],
      database: [
        "PostgreSQL",
        "fin_movimento",
        "fin_bancos_contas",
        "hub_system_releases"
      ],
      integrations: [
        "Movimento Bancário",
        "Bancos e Contas",
        "Changelog versionado no banco"
      ],
    },
  },


  {
    version: "0.3.20",
    title: "Financeiro — Saldo Inicial do Movimento pela base de Bancos e Contas",
    description:
      "Corrige definitivamente o Saldo Inicial do Movimento Bancário usando a mesma origem do módulo Bancos e Contas, incluindo fallback no front-end quando o backend estiver em cache.",
    frontend_version: "0.3.20",
    backend_version: "0.3.20",
    released_at: "2026-06-01T01:45:00.000Z",
    changes: [
      "Movimento Bancário passa a consultar o saldo inicial diretamente em fin_bancos_contas, a mesma tabela usada por Financeiro > Bancos e Contas.",
      "Criado endpoint GET /financeiro/movimento/saldo-inicial-bancos para conferência isolada do saldo inicial por ano, empresa, banco e conta.",
      "Filtro por empresa no saldo inicial passa a comparar UPPER/TRIM, evitando retorno zerado por diferença de caixa ou espaços.",
      "Frontend passa a buscar fallback em /financeiro/bancos quando o resumo do movimento não trouxer saldo inicial, garantindo que LARM mostre R$ 88.195,56 e Consolidado mostre a soma das contas ativas.",
      "Saldo Final do Movimento continua sendo calculado como Saldo Inicial + Entradas - Saídas.",
      "Atualizada versão técnica do front-end e backend para 0.3.20."
    ],
    architecture: {
      frontend: [
        "Next.js App Router",
        "React",
        "TypeScript",
        "TailwindCSS",
        "Financeiro v0.3.20"
      ],
      backend: [
        "Node.js",
        "Express.js",
        "JWT",
        "REST API Financeiro"
      ],
      database: [
        "PostgreSQL",
        "fin_movimento",
        "fin_bancos_contas",
        "hub_system_releases"
      ],
      integrations: [
        "Movimento Bancário",
        "Bancos e Contas",
        "Changelog versionado no banco"
      ],
    },
  },


  {
    version: "0.3.21",
    title: "Financeiro — Orçamento 2026 com Previsto x Realizado",
    description:
      "Conclui a primeira versão operacional do módulo Orçamento, importando o CashFlow orçado e o Movimento Bancário orçado de 2026 para comparar previsto e realizado.",
    frontend_version: "0.3.21",
    backend_version: "0.3.21",
    released_at: "2026-06-01T02:15:00.000Z",
    changes: [
      "Criadas tabelas fin_orcamento_linhas, fin_orcamento_valores e fin_orcamento_movimento para separar orçamento do movimento bancário realizado.",
      "Criado importador scripts/import_orcamento_2026.py para carregar CashFlow Consolidado 2026-Orçado e Movimento Bancário 2026-Orçado.",
      "Adicionados comandos npm run db:migrate:orcamento e npm run db:seed:orcamento:2026 no backend.",
      "Criados endpoints GET /financeiro/orcamento, GET /financeiro/orcamento/empresas e GET /financeiro/orcamento/movimento.",
      "Tela Financeiro > Orçamento passa a exibir valores Previsto x Realizado por mês e por linha financeira.",
      "Movimento orçado fica armazenado separado em fin_orcamento_movimento, sem gravar nada em fin_movimento realizado.",
      "Atualizada versão técnica do front-end e backend para 0.3.21."
    ],
    architecture: {
      frontend: [
        "Next.js App Router",
        "React",
        "TypeScript",
        "TailwindCSS",
        "Financeiro v0.3.21"
      ],
      backend: [
        "Node.js",
        "Express.js",
        "JWT",
        "REST API Financeiro"
      ],
      database: [
        "PostgreSQL",
        "fin_orcamento_linhas",
        "fin_orcamento_valores",
        "fin_orcamento_movimento",
        "hub_system_releases"
      ],
      integrations: [
        "Orçamento Financeiro",
        "CashFlow Orçado",
        "Movimento Bancário Orçado",
        "Changelog versionado no banco"
      ],
    },
  },


  {
    version: "0.3.22",
    title: "Financeiro — Orçamento baseado no Movimento Orçado",
    description:
      "Corrige a origem do previsto no módulo Orçamento 2026 para usar a planilha de Movimento Bancário Orçado e adiciona a tela Movimento Orçado.",
    frontend_version: "0.3.22",
    backend_version: "0.3.22",
    released_at: "2026-06-01T02:45:00.000Z",
    changes: [
      "Alterado o seed do orçamento para usar a planilha Movimento Bancário-2026-orçado como fonte dos valores previstos.",
      "O importador passa a agregar o previsto por Natureza Financeira, empresa e mês em fin_orcamento_valores.",
      "Mantida a gravação do movimento orçado em fin_orcamento_movimento, sem misturar com fin_movimento realizado.",
      "Criada a tela Financeiro > Mov. Orçado para consultar os lançamentos previstos de 2026.",
      "Tela Orçamento passa a comparar Previsto do Movimento Orçado x Realizado do Movimento Bancário efetivo.",
      "Atualizado comando npm run db:seed:orcamento:2026 para usar somente scripts/imports/orcamento-movimento-2026.xlsx.",
      "Atualizada versão técnica do front-end e backend para 0.3.22."
    ],
    architecture: {
      frontend: [
        "Next.js App Router",
        "React",
        "TypeScript",
        "TailwindCSS",
        "Financeiro v0.3.22"
      ],
      backend: [
        "Node.js",
        "Express.js",
        "JWT",
        "REST API Financeiro"
      ],
      database: [
        "PostgreSQL",
        "fin_orcamento_linhas",
        "fin_orcamento_valores",
        "fin_orcamento_movimento",
        "hub_system_releases"
      ],
      integrations: [
        "Movimento Bancário Orçado",
        "Orçamento Financeiro",
        "Changelog versionado no banco"
      ],
    },
  },


  {
    version: "0.3.23",
    title: "Financeiro — correção do realizado e limpeza de movimento futuro",
    description:
      "Ajusta o Orçamento para usar o Movimento Bancário realmente pago/recebido como realizado, adiciona limpeza segura dos movimentos futuros de 2026 importados por engano e corrige a navegação do Mov. Orçado.",
    frontend_version: "0.3.23",
    backend_version: "0.3.23",
    released_at: "2026-06-01T03:20:00.000Z",
    changes: [
      "Orçamento passa a preencher Realizado a partir do Movimento Bancário efetivo, e não mais dos valores estáticos do CashFlow.",
      "Criada trava para ignorar movimentos futuros de 2026 sem vínculo com baixa de Contas a Pagar ou recebimento em Contas a Receber.",
      "Adicionado script seguro para prévia e limpeza dos movimentos futuros indevidos após 28/06/2026.",
      "Mov. Orçado recebeu barra horizontal superior para facilitar navegação lateral da tabela.",
      "Corrigido destaque duplicado no menu lateral entre Mov. Orçado e Mov. Bancário.",
      "Atualizada versão técnica do front-end e backend para 0.3.23."
    ],
    architecture: {
      frontend: [
        "Next.js App Router",
        "React",
        "TypeScript",
        "TailwindCSS",
        "Financeiro v0.3.23"
      ],
      backend: [
        "Node.js",
        "Express.js",
        "JWT",
        "REST API Financeiro"
      ],
      database: [
        "PostgreSQL",
        "fin_movimento",
        "fin_orcamento_movimento",
        "fin_orcamento_valores",
        "hub_system_releases"
      ],
      integrations: [
        "Movimento Bancário Realizado",
        "Movimento Bancário Orçado",
        "Orçamento Financeiro",
        "Changelog versionado no banco"
      ],
    },
  },

];

module.exports = { SYSTEM_RELEASES };
