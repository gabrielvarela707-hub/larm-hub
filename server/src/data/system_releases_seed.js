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
  }
]

module.exports = { SYSTEM_RELEASES }
