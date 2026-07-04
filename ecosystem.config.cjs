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
