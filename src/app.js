const express = require('express');
const path = require('path');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const { createSessionMiddleware } = require('./config/session');
const { env } = require('./config/env');
const { attachCurrentUser } = require('./middlewares/auth');
const { notFoundHandler, errorHandler } = require('./middlewares/errorHandlers');
const { webRouter } = require('./routes/webRoutes');
const { apiRouter } = require('./routes/apiRoutes');

const openApiSpecPath = path.join(process.cwd(), 'openapi.yaml');
const openApiSpec = YAML.load(openApiSpecPath);

const createApp = () => {
  const app = express();

  app.set('trust proxy', 1);
  app.use(express.static(path.join(process.cwd(), 'public')));
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
  app.use(createSessionMiddleware({
    mongoUri: env.mongoUri,
    sessionSecret: env.sessionSecret,
    isProduction: env.isProduction,
    isTest: env.isTest
  }));

  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
    next();
  });

  app.use(attachCurrentUser);

  app.use('/', webRouter);
  app.use('/api', apiRouter);
  app.use('/api/v1', apiRouter);
  app.get('/api/docs/openapi.yaml', (req, res) => {
    res.sendFile(openApiSpecPath);
  });
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec, {
    explorer: true
  }));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};

module.exports = {
  createApp
};
