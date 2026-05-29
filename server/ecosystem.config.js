// ecosystem.config.js — PM2 configuration
module.exports = {
  apps: [
    {
      name:           'larmhub-api',
      script:         'src/server.js',
      instances:      2,
      exec_mode:      'cluster',
      watch:          false,
      max_memory_restart: '512M',

      env: {
        NODE_ENV: 'development',
        PORT:     3001,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT:     3001,
      },

      // Logs
      log_date_format:   'YYYY-MM-DD HH:mm:ss',
      error_file:        '/var/log/larmhub-api/pm2-error.log',
      out_file:          '/var/log/larmhub-api/pm2-out.log',
      merge_logs:        true,

      // Restart policy
      restart_delay:     3000,
      max_restarts:      10,
      autorestart:       true,
    },
  ],
}
