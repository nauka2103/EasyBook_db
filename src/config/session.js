const session = require('express-session');
const { MongoStore } = require('connect-mongo');

const buildMongoStore = (mongoUri) => MongoStore.create({
  mongoUrl: mongoUri,
  collectionName: 'sessions',
  ttl: 24 * 60 * 60
});

const createSessionMiddleware = ({
  mongoUri,
  sessionSecret,
  isProduction,
  isTest = false
}) => {
  const config = {
    name: 'easybook.sid',
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000
    }
  };

  if (!isTest) {
    config.store = buildMongoStore(mongoUri);
  }

  return session(config);
};

module.exports = { createSessionMiddleware };
