const { env } = require('./src/config/env');
const { connectToDb } = require('./database/db');
const { createApp } = require('./src/app');
const { ensureStartupMaintenance } = require('./src/services/seedService');

const logFatalAndExit = (label, error) => {
  const message = error instanceof Error ? `${error.message}\n${error.stack}` : String(error);
  console.error(`${label}: ${message}`);
  process.exit(1);
};

process.on('uncaughtException', (error) => {
  logFatalAndExit('Uncaught exception', error);
});

process.on('unhandledRejection', (reason) => {
  logFatalAndExit('Unhandled rejection', reason);
});

(async () => {
  try {
    await connectToDb();
    await ensureStartupMaintenance();

    const app = createApp();
    const server = app.listen(env.port, () => {
      console.log(`Server running on port ${env.port}`);
      console.log(`Open: http://127.0.0.1:${env.port}`);
    });

    server.on('error', (error) => {
      logFatalAndExit('HTTP server error', error);
    });
  } catch (error) {
    console.error('Startup failed:', error.message);
    process.exit(1);
  }
})();
