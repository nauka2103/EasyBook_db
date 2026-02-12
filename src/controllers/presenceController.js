const path = require('path');
const { ObjectId } = require('mongodb');
const { env } = require('../config/env');
const { renderView } = require('../utils/view');
const { getCookieValue } = require('../utils/cookies');
const { PRESENCE_COOKIE_NAME } = require('../middlewares/presence');
const { getPresenceStatus, heartbeatPresenceSlot } = require('../models/presenceModel');

const sendNotFoundPage = (res, statusCode = 404) => (
  res.status(statusCode).sendFile(path.join(process.cwd(), 'views', '404.html'))
);

const renderHotelWaitPage = async (req, res) => {
  const hotelId = String(req.query.hotelId || '').trim();
  if (!ObjectId.isValid(hotelId)) {
    return sendNotFoundPage(res, 400);
  }

  return res.send(renderView('hotel-wait.html', {
    hotelId,
    pollSeconds: '4'
  }));
};

const getHotelPresenceStatusApi = async (req, res) => {
  if (!env.presenceEnabled) {
    return res.status(200).json({
      active: 0,
      capacity: env.presenceCapacity,
      canEnter: true
    });
  }

  const hotelId = String(req.params.hotelId || '').trim();
  if (!ObjectId.isValid(hotelId)) {
    return res.status(400).json({ error: 'Invalid hotel ID' });
  }

  const token = getCookieValue(req, PRESENCE_COOKIE_NAME);
  const status = await getPresenceStatus({ hotelId, token });
  return res.status(200).json(status);
};

const postHotelPresenceHeartbeatApi = async (req, res) => {
  if (!env.presenceEnabled) {
    return res.status(200).json({ ok: true, disabled: true });
  }

  const hotelId = String(req.params.hotelId || '').trim();
  if (!ObjectId.isValid(hotelId)) {
    return res.status(400).json({ ok: false, reason: 'invalid_hotel' });
  }

  const token = getCookieValue(req, PRESENCE_COOKIE_NAME);
  if (!token) {
    return res.status(401).json({ ok: false, reason: 'no_slot' });
  }

  const result = await heartbeatPresenceSlot({ hotelId, token });
  if (!result.ok) {
    return res.status(200).json({ ok: false, reason: 'no_slot' });
  }

  return res.status(200).json({
    ok: true,
    expiresAt: result.expiresAt
  });
};

module.exports = {
  renderHotelWaitPage,
  getHotelPresenceStatusApi,
  postHotelPresenceHeartbeatApi
};
