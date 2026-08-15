module.exports = {
  apps: [
    {
      name: 'keepstar-inventory',
      cwd: __dirname,
      script: 'backend/dist/server.js',
      env: {
        NODE_ENV: 'production',
      },
      autorestart: true,
      restart_delay: 5000,
      max_restarts: 10,
      watch: false,
      time: true,
      out_file: `${__dirname}/keepstar-inventory.log`,
      error_file: `${__dirname}/keepstar-inventory-error.log`,
      merge_logs: true,
    },
  ],
};