const path = require('node:path');
const root = path.resolve(__dirname, '../..');
require(path.join(root,'scripts/verify-staging-runtime.cjs'))();
if (!process.env.STAGING_ENV_FILE) throw Error('Set STAGING_ENV_FILE to the private absolute env file');
process.loadEnvFile(process.env.STAGING_ENV_FILE);
require(path.join(root,'apps/api/dist/common/security/production-config')).validateProductionConfig(process.env);
if (process.env.ORDERSAWA_ENV !== 'staging') throw Error('Staging only');
const runtimeEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^STAGING_(?:BOOTSTRAP|SMOKE)_/.test(key) && !/^(?:PLAYWRIGHT_MODULE|V62_BROWSER_EXECUTABLE|SMOKE_OUTPUT|PGPASSWORD)$/.test(key)));
module.exports = { apps: [
  { name:'ordersawa-staging-api',cwd:path.join(root,'apps/api'),script:'dist/main.js',instances:1,exec_mode:'fork',kill_timeout:15000,env:runtimeEnv },
  { name:'ordersawa-staging-web',cwd:path.join(root,'apps/web'),script:path.join(root,'node_modules/next/dist/bin/next'),args:['start','-H','127.0.0.1','-p',process.env.WEB_PORT || '3000'],instances:1,exec_mode:'fork',kill_timeout:15000,env:runtimeEnv }
] };
