// PM2 ecosystem config
// Usage:
//   pm2 start ecosystem.config.cjs
//   pm2 save
//   pm2 startup

module.exports = {
  apps: [
    {
      name: "wfg-agent",
      cwd: "./apps/agent",
      script: "node",
      args: "--import tsx/esm src/server.ts",
      interpreter: "none",
      env: {
        NODE_ENV: "production",
        PORT: "4000",
      },
      // Restart if crashes
      autorestart: true,
      max_restarts: 10,
      min_uptime: "5s",
      // Log files
      out_file: "./logs/agent-out.log",
      error_file: "./logs/agent-err.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
    {
      name: "wfg-frontend",
      cwd: "./apps/frontend",
      script: "node_modules/.bin/next",
      args: "start",
      interpreter: "none",
      env: {
        NODE_ENV: "production",
        PORT: "3000",
      },
      autorestart: true,
      max_restarts: 10,
      min_uptime: "5s",
      out_file: "./logs/frontend-out.log",
      error_file: "./logs/frontend-err.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
  ],
};
