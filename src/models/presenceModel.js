const { ObjectId } = require('mongodb');
const { getDb } = require('../../database/db');
const { env } = require('../config/env');

const HOTEL_PRESENCE_COLLECTION = 'hotel_presence';

const getPresenceCollection = () => getDb().collection(HOTEL_PRESENCE_COLLECTION);

const normalizeHotelId = (hotelId) => {
  const text = String(hotelId || '').trim();
  if (!ObjectId.isValid(text)) return null;
  return new ObjectId(text);
};

const normalizeToken = (token) => String(token || '').trim();

const buildExpiresAt = (from = new Date()) => (
  new Date(from.getTime() + (env.presenceTtlSeconds * 1000))
);

const buildOptionalUserId = (userId) => (
  userId && ObjectId.isValid(String(userId)) ? new ObjectId(String(userId)) : null
);

const acquirePresenceSlot = async ({ hotelId, token, userId = null, now = new Date() }) => {
  const hotelObjectId = normalizeHotelId(hotelId);
  const tokenText = normalizeToken(token);

  if (!hotelObjectId || !tokenText) {
    return { granted: false, reason: 'invalid_payload', active: 0, capacity: env.presenceCapacity };
  }

  const presenceCollection = getPresenceCollection();
  const expiresAt = buildExpiresAt(now);
  const updatedAt = new Date();
  const userObjectId = buildOptionalUserId(userId);

  const existing = await presenceCollection.findOneAndUpdate(
    {
      hotelId: hotelObjectId,
      token: tokenText,
      expiresAt: { $gt: now }
    },
    {
      $set: {
        expiresAt,
        updatedAt
      }
    },
    {
      returnDocument: 'after'
    }
  );

  if (existing) {
    return {
      granted: true,
      token: tokenText,
      slot: existing.slot,
      expiresAt
    };
  }

  for (let slot = 1; slot <= env.presenceCapacity; slot += 1) {
    try {
      const updateResult = await presenceCollection.updateOne(
        {
          hotelId: hotelObjectId,
          slot,
          $or: [
            { expiresAt: { $lte: now } },
            { token: tokenText },
            { expiresAt: { $exists: false } }
          ]
        },
        {
          $set: {
            hotelId: hotelObjectId,
            slot,
            token: tokenText,
            userId: userObjectId,
            expiresAt,
            updatedAt
          },
          $setOnInsert: {
            createdAt: updatedAt
          }
        },
        {
          upsert: true
        }
      );

      if (updateResult.matchedCount === 0 && updateResult.upsertedCount === 0) {
        continue;
      }

      const ownedSlot = await presenceCollection.findOne(
        {
          hotelId: hotelObjectId,
          slot,
          token: tokenText,
          expiresAt: { $gt: now }
        },
        {
          projection: { slot: 1 }
        }
      );

      if (ownedSlot) {
        return {
          granted: true,
          token: tokenText,
          slot,
          expiresAt
        };
      }
    } catch (error) {
      if (error && error.code === 11000) {
        continue;
      }
      throw error;
    }
  }

  const active = await presenceCollection.countDocuments({
    hotelId: hotelObjectId,
    expiresAt: { $gt: now }
  });

  return {
    granted: false,
    reason: 'capacity_reached',
    active,
    capacity: env.presenceCapacity
  };
};

const getPresenceStatus = async ({ hotelId, token = '', now = new Date() }) => {
  const hotelObjectId = normalizeHotelId(hotelId);
  const tokenText = normalizeToken(token);

  if (!hotelObjectId) {
    return {
      active: 0,
      capacity: env.presenceCapacity,
      canEnter: false
    };
  }

  const presenceCollection = getPresenceCollection();
  const active = await presenceCollection.countDocuments({
    hotelId: hotelObjectId,
    expiresAt: { $gt: now }
  });

  const hasOwnSlot = tokenText
    ? await presenceCollection.countDocuments({
      hotelId: hotelObjectId,
      token: tokenText,
      expiresAt: { $gt: now }
    }) > 0
    : false;

  return {
    active,
    capacity: env.presenceCapacity,
    canEnter: hasOwnSlot || active < env.presenceCapacity
  };
};

const heartbeatPresenceSlot = async ({ hotelId, token, now = new Date() }) => {
  const hotelObjectId = normalizeHotelId(hotelId);
  const tokenText = normalizeToken(token);

  if (!hotelObjectId || !tokenText) {
    return { ok: false, reason: 'no_slot' };
  }

  const expiresAt = buildExpiresAt(now);
  const result = await getPresenceCollection().updateOne(
    {
      hotelId: hotelObjectId,
      token: tokenText,
      expiresAt: { $gt: now }
    },
    {
      $set: {
        expiresAt,
        updatedAt: new Date()
      }
    }
  );

  if (!result.matchedCount) {
    return { ok: false, reason: 'no_slot' };
  }

  return {
    ok: true,
    expiresAt
  };
};

module.exports = {
  acquirePresenceSlot,
  getPresenceStatus,
  heartbeatPresenceSlot
};
