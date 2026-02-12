const { randomUUID } = require('crypto');
const rateLimit = require('express-rate-limit');
const { ObjectId } = require('mongodb');
const { env } = require('../config/env');
const { acquirePresenceSlot } = require('../models/presenceModel');
const { getCookieValue } = require('../utils/cookies');

const PRESENCE_COOKIE_NAME = 'presence_token';

const getOrCreatePresenceToken = (req, res) => {
  let token = getCookieValue(req, PRESENCE_COOKIE_NAME);

  if (!token) {
    token = randomUUID();
  }

  res.cookie(PRESENCE_COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: '/'
  });

  return token;
};

const queueGuardForHotelPage = async (req, res, next) => {
  if (!env.presenceEnabled) {
    return next();
  }

  const hotelId = String(req.params.id || '').trim();
  if (!ObjectId.isValid(hotelId)) {
    return next();
  }

  try {
    const token = getOrCreatePresenceToken(req, res);
    const acquisition = await acquirePresenceSlot({
      hotelId,
      token,
      userId: req.currentUser?.id || null
    });

    if (acquisition.granted) {
      req.presence = {
        token,
        slot: acquisition.slot,
        expiresAt: acquisition.expiresAt
      };
      return next();
    }

    return res.redirect(`/hotel-wait?hotelId=${encodeURIComponent(hotelId)}`);
  } catch (error) {
    return next(error);
  }
};

const presenceStatusRateLimiter = rateLimit({
  windowMs: 15 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false
});

const presenceHeartbeatRateLimiter = rateLimit({
  windowMs: 15 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false
});

module.exports = {
  PRESENCE_COOKIE_NAME,
  getOrCreatePresenceToken,
  queueGuardForHotelPage,
  presenceStatusRateLimiter,
  presenceHeartbeatRateLimiter
};
