const session = require('express-session');
const { MongoStore } = require('connect-mongo');

const createSessionMiddleware = ({ mongoUri, sessionSecret, isProduction }) => session({
  name: 'easybook.sid',
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000
  },
  store: MongoStore.create({
    mongoUrl: mongoUri,
    collectionName: 'sessions',
    ttl: 24 * 60 * 60
  })
});

module.exports = { createSessionMiddleware };
