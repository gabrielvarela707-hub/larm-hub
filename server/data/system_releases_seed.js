/**
 * server/data/system_releases_seed.js
 * Fonte inicial do changelog versionado do sistema.
 * Próximas versões devem ser adicionadas aqui e aplicadas via migration/seed.
 */

const SYSTEM_RELEASES = [
  {
    version: '0.0.1',
    title: 'Base de versionamento e auditoria operacional',
    description: 'Primeira versão controlada do LARM HUB / Santa Clara HUB com histórico técnico e changelog administrativo.',
    frontend_version: '0.0.1',
    backend_version: '0.0.1',
    released_at: '2026-05-17T00:00:00.000Z',
    changes: [
      'Criada a aba Sobre sistema em Configurações.',
      'Adicionado controle inicial de versão do front-end e backend em 0.0.1.',
      'Criada tabela de changelog no PostgreSQL para histórico de versões.',
      'Documentada arquitetura básica: Next.js, React, TailwindCSS, Zustand, Node.js, Express, JWT, PostgreSQL e AWS SES.',
      'Mantida a versão como dado técnico de deploy e o changelog como dado administrativo consultável.',
      'Preparado o padrão para próximas interações incrementarem a versão e registrarem alterações detalhadas.'
    ],
    architecture: {
      frontend: ['Next.js App Router', 'React', 'TypeScript', 'TailwindCSS', 'Zustand', 'Axios'],
      backend: ['Node.js', 'Express.js', 'JWT', 'REST API', 'PM2'],
      database: ['PostgreSQL', 'Multi-tenant', 'Auditoria', 'Permissões', 'Financeiro'],
      integrations: ['AWS SES', 'Google Maps', 'CRM externo', 'WhatsApp API']
    }
  },
  {
    version: '0.0.2',
    title: 'CRM/Funil Fase 1',
    description: 'Evolução do funil para operação comercial com etapas configuráveis, Kanban persistente, histórico de leads e motivos de perda.',
    frontend_version: '0.0.2',
    backend_version: '0.0.2',
    released_at: '2026-05-17T03:00:00.000Z',
    changes: [
      'Criada estrutura de banco para CRM/Funil: crm_funnel_stages, crm_leads, crm_lead_history e crm_loss_reasons.',
      'Adicionadas etapas configuráveis do funil com cor, ordem, prazo máximo, status de ganho/perda e inativação segura.',
      'Criado Kanban de leads com dados persistidos via API, filtros por busca, etapa, responsável, origem e temperatura.',
      'Adicionado cadastro rápido de lead com responsável, origem, campanha, empreendimento, valor estimado, temperatura e próximo retorno.',
      'Adicionado histórico por lead com criação, atualização, mudança de etapa, observações e inativação.',
      'Adicionados motivos de perda padronizados e obrigatoriedade de informar motivo ao mover o lead para Perdido.',
      'Adicionada importação de leads do Excel para persistir os registros no backend, evitando ficar apenas em estado local.',
      'Mantidas regras de permissão do CRM também no backend, não apenas no menu lateral.',
      'Preparada a base para próximas fases de campanhas, automações com SES/SNS e follow-up comercial.'
    ],
    architecture: {
      frontend: ['Next.js App Router', 'React', 'TypeScript', 'TailwindCSS', 'Zustand', 'XLSX'],
      backend: ['Node.js', 'Express.js', 'JWT', 'REST API CRM', 'PM2'],
      database: ['PostgreSQL', 'crm_funnel_stages', 'crm_leads', 'crm_lead_history', 'crm_loss_reasons'],
      integrations: ['AWS SES preparado para campanhas', 'AWS SNS preparado para SMS/avisos', 'WhatsApp preparado para próxima fase']
    }
  }
  ,{
    version: '0.0.3',
    title: 'CRM/Funil Fase 2',
    description: 'Gestão comercial com tarefas, follow-up, alertas de SLA e visão de prioridades do atendimento.',
    frontend_version: '0.0.3',
    backend_version: '0.0.3',
    released_at: '2026-05-17T04:00:00.000Z',
    changes: [
      'Criada tabela crm_lead_tasks para tarefas e follow-ups vinculados aos leads.',
      'Adicionado CRUD de tarefas por lead com responsável, prioridade, prazo, status, conclusão e cancelamento lógico.',
      'Adicionado resumo comercial com tarefas de hoje, tarefas atrasadas, retornos próximos, leads sem contato e etapas com SLA vencido.',
      'Incluídos alertas no Kanban para tarefas vencidas e próximos retornos diretamente no card do lead.',
      'Adicionada área de tarefas dentro do modal do lead para criar, concluir e cancelar follow-ups sem sair do histórico.',
      'Criada visão operacional de tarefas pendentes na tela do funil para priorizar o atendimento diário.',
      'Registradas ações de tarefas no histórico do lead e no log de auditoria.',
      'Mantidas as regras de permissão do CRM no backend para leitura e escrita das tarefas.',
      'Atualizada versão técnica do front-end e backend para 0.0.3.'
    ],
    architecture: {
      frontend: ['Next.js App Router', 'React', 'TypeScript', 'TailwindCSS', 'XLSX', 'Kanban CRM'],
      backend: ['Node.js', 'Express.js', 'JWT', 'REST API CRM', 'PM2', 'Auditoria'],
      database: ['PostgreSQL', 'crm_lead_tasks', 'crm_leads', 'crm_lead_history', 'crm_funnel_stages'],
      integrations: ['AWS SES preparado para campanhas', 'AWS SNS preparado para próxima fase', 'WhatsApp preparado para acionamento comercial']
    }
  }

  ,{
    version: '0.0.4',
    title: 'CRM/Funil Fase 3',
    description: 'Inteligência comercial com lead scoring, relatórios de conversão, ranking de responsáveis, análise por campanhas e previsão ponderada de fechamento.',
    frontend_version: '0.0.4',
    backend_version: '0.0.4',
    released_at: '2026-05-17T05:00:00.000Z',
    changes: [
      'Criada visão de Inteligência no CRM com KPIs de pipeline, receita vendida, conversão geral, score médio, leads quentes e previsão ponderada.',
      'Adicionado endpoint GET /crm/analytics para relatórios consolidados por etapa, origem, responsável, campanha, motivo de perda e temperatura do lead.',
      'Adicionado endpoint POST /crm/leads/recalculate-scores para recalcular automaticamente score e temperatura dos leads com base em dados de contato, origem, campanha, tarefas, interações e status do funil.',
      'Criado relatório de conversão por origem para identificar canais com melhor qualidade comercial.',
      'Criado ranking por responsável com leads, vendas, taxa de conversão, atrasos e potencial de pipeline.',
      'Criado relatório por etapa para identificar gargalos, SLA vencido, score médio e valor parado no funil.',
      'Criado relatório de campanhas como base para a próxima fase de disparos e automações com SES/SNS.',
      'Criado relatório de motivos de perda com volume e valor perdido.',
      'Adicionados índices no PostgreSQL para melhorar consultas analíticas do CRM.',
      'Atualizada versão técnica do front-end e backend para 0.0.4.'
    ],
    architecture: {
      frontend: ['Next.js App Router', 'React', 'TypeScript', 'TailwindCSS', 'Kanban CRM', 'Relatórios analíticos'],
      backend: ['Node.js', 'Express.js', 'JWT', 'REST API CRM', 'Analytics API', 'PM2', 'Auditoria'],
      database: ['PostgreSQL', 'crm_leads', 'crm_funnel_stages', 'crm_lead_tasks', 'crm_loss_reasons', 'hub_system_releases'],
      integrations: ['AWS SES preparado para campanhas', 'AWS SNS preparado para próxima fase', 'WhatsApp preparado para acionamento comercial']
    }
  }


  ,{
    version: '0.0.5',
    title: 'CRM/Funil Fase 4',
    description: 'Campanhas e comunicação com templates, segmentação de leads, disparos por AWS SES/SNS, histórico de envio e controle de opt-out.',
    frontend_version: '0.0.5',
    backend_version: '0.0.5',
    released_at: '2026-05-17T06:00:00.000Z',
    changes: [
      'Criada estrutura de campanhas do CRM com crm_campaigns, crm_campaign_recipients, crm_message_templates e crm_communication_events.',
      'Adicionado controle de opt-out por lead para e-mail e SMS, preservando conformidade operacional e evitando disparos indevidos.',
      'Criados templates de comunicação para e-mail e SMS com variáveis como {{nome}}, {{empreendimento}}, {{telefone}}, {{campanha}} e {{responsavel}}.',
      'Criados endpoints para listar, criar, preparar, cancelar e enviar campanhas comerciais a partir dos leads do funil.',
      'Integrado envio de e-mail transacional/campanhas via AWS SES usando as credenciais já configuradas por tenant.',
      'Adicionada base de envio SMS via AWS SNS, com colunas administrativas de configuração SNS no tenant.',
      'Registrado histórico de comunicação por lead e por campanha, incluindo status, provedor, erro e identificador da mensagem.',
      'Criada visão de Campanhas no CRM para cadastrar templates, criar campanhas, preparar destinatários e disparar comunicações.',
      'Mantidas regras de permissão do CRM e auditoria para criação, preparação, envio e cancelamento de campanhas.',
      'Atualizada versão técnica do front-end e backend para 0.0.5.'
    ],
    architecture: {
      frontend: ['Next.js App Router', 'React', 'TypeScript', 'TailwindCSS', 'Kanban CRM', 'Campanhas CRM'],
      backend: ['Node.js', 'Express.js', 'JWT', 'REST API CRM', 'AWS SES', 'AWS SNS', 'Auditoria', 'PM2'],
      database: ['PostgreSQL', 'crm_campaigns', 'crm_campaign_recipients', 'crm_message_templates', 'crm_communication_events', 'crm_leads'],
      integrations: ['AWS SES para e-mails', 'AWS SNS para SMS', 'Templates com variáveis', 'Histórico de comunicação por lead']
    }
  }


  ,{
    version: '0.0.6',
    title: 'Relatórios — Mapa de Vendas legado',
    description: 'Integração do relatório Mapa de Vendas com as tabelas legadas de vendas e recebíveis no PostgreSQL, removendo o erro 404 das rotas do relatório.',
    frontend_version: '0.0.6',
    backend_version: '0.0.6',
    released_at: '2026-05-17T07:00:00.000Z',
    changes: [
      'Mapeado o pacote PHP/Scriptcase enviado, identificando os módulos legados de Obras, Unidades, Implantação, Pessoas, Usuários, Logs e Manutenção.',
      'Criada rota backend GET /mapa-vendas/anos para retornar anos disponíveis a partir de ts1_vend.',
      'Criada rota backend GET /mapa-vendas/resumo para consolidar VGV, entradas, contratos, empresas e últimas vendas.',
      'Criada rota backend GET /mapa-vendas para listagem paginada com filtros por ano, empresa e busca livre.',
      'Vinculado o Mapa de Vendas às tabelas legadas ts1_vend, ts1_univ, tb2_pess, tb2_obra, ts1_cemp e ts1_core.',
      'Mantida consulta defensiva para não derrubar o backend caso alguma tabela/view legada esteja ausente.',
      'Corrigido o problema de carregamento eterno causado por 404 nas rotas /mapa-vendas/anos, /mapa-vendas/resumo e /mapa-vendas.',
      'Atualizada versão técnica do front-end e backend para 0.0.6.'
    ],
    architecture: {
      frontend: ['Next.js App Router', 'React', 'TypeScript', 'TailwindCSS', 'Relatórios operacionais'],
      backend: ['Node.js', 'Express.js', 'JWT', 'REST API Relatórios', 'PM2', 'Auditoria'],
      database: ['PostgreSQL', 'ts1_vend', 'ts1_univ', 'tb2_pess', 'tb2_obra', 'ts1_cemp', 'ts1_core'],
      integrations: ['Legado Scriptcase mapeado', 'Relatório Next.js consumindo API Node']
    }
  }


  ,{
    version: '0.0.7',
    title: 'Relatórios Tools por projeto',
    description: 'Separação dos relatórios legados por projeto/obra, com novos módulos de Projetos/Obras, Unidades do Estoque e Implantação/Plantas no LARM HUB.',
    frontend_version: '0.0.7',
    backend_version: '0.0.7',
    released_at: '2026-05-17T08:00:00.000Z',
    changes: [
      'Criada rota backend GET /relatorios-tools/filtros para carregar obras, empresas, situações e tipos de unidade usados nos relatórios.',
      'Criada rota backend GET /relatorios-tools/projetos para listar projetos/obras com empresa, cidade, endereço, área, totais de unidades, disponíveis, vendidas e última venda.',
      'Criada rota backend GET /relatorios-tools/unidades para listar unidades do estoque com filtros por obra, situação, tipo e busca livre.',
      'Criada rota backend GET /relatorios-tools/implantacoes para consultar plantas/implantação a partir das obras cadastradas.',
      'Atualizado o relatório Mapa de Vendas para aceitar filtro por obra/projeto, evitando misturar Residencial Santa Clara, Aluguel CJ 23, Terras de Santa Adélia e demais projetos.',
      'Adicionados menus em Relatórios: Projetos / Obras, Unidades do Estoque e Implantação / Plantas.',
      'Criadas telas Next.js para os novos relatórios consumindo a API Node, sem incorporar o PHP Scriptcase legado.',
      'Mantida consulta defensiva para colunas opcionais do legado, como imagem de planta, evitando quebra caso o banco tenha variações de schema.',
      'Atualizada versão técnica do front-end e backend para 0.0.7.'
    ],
    architecture: {
      frontend: ['Next.js App Router', 'React', 'TypeScript', 'TailwindCSS', 'Relatórios Tools'],
      backend: ['Node.js', 'Express.js', 'JWT', 'REST API Relatórios', 'PM2', 'Auditoria'],
      database: ['PostgreSQL', 'tb2_obra', 'ts1_univ', 'ts1_situ', 'ts1_vend', 'ts1_desu', 'ts1_tpun', 'tb2_pess'],
      integrations: ['Legado Scriptcase mapeado', 'Relatórios Next.js por projeto/obra', 'Base para recebíveis na próxima versão']
    }
  }


  ,{
    version: '0.0.8',
    title: 'Correção de build e versionamento de relatórios',
    description: 'Correção do tipo TypeScript no Mapa de Vendas e registro da evolução de versionamento para manter o changelog consistente.',
    frontend_version: '0.0.8',
    backend_version: '0.0.8',
    released_at: '2026-05-17T09:00:00.000Z',
    changes: [
      'Corrigido o tipo do array recentes no relatório Mapa de Vendas, incluindo obra_id e obra para compatibilidade com o layout por projeto.',
      'Resolvido o erro de build do Next.js: Property obra_id does not exist on type recentes.',
      'Mantida a separação por projeto/obra adicionada na versão 0.0.7 sem alterar a lógica do relatório.',
      'Atualizada versão técnica do front-end e backend para 0.0.8.',
      'Registrado no changelog que a sequência de versionamento seguirá 0.0.8, 0.0.9 e depois 0.1.0.'
    ],
    architecture: {
      frontend: ['Next.js App Router', 'React', 'TypeScript', 'TailwindCSS', 'Relatórios Tools'],
      backend: ['Node.js', 'Express.js', 'JWT', 'REST API Relatórios', 'PM2', 'Auditoria'],
      database: ['PostgreSQL', 'hub_system_releases', 'tb2_obra', 'ts1_vend', 'ts1_univ'],
      integrations: ['Relatórios Next.js por projeto/obra', 'Changelog versionado no banco']
    }
  }


]

module.exports = { SYSTEM_RELEASES }
