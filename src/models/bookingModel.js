const { ObjectId } = require('mongodb');
const { getDb, getClient } = require('../../database/db');

const BOOKING_COLLECTION = 'bookings';
const ALLOWED_BOOKING_STATUSES = ['confirmed', 'cancelled'];

const getBookingsCollection = () => getDb().collection(BOOKING_COLLECTION);
const getHotelsCollection = () => getDb().collection('hotels');

const TRANSACTION_OPTIONS = {
  readPreference: 'primary',
  readConcern: { level: 'snapshot' },
  writeConcern: { w: 'majority' }
};

const createModelError = (code, message) => {
  const error = new Error(message);
  error.code = code;
  return error;
};

const normalizeReason = (value, maxLength = 300) => String(value || '').trim().slice(0, maxLength);

const toObjectIdOrNull = (id) => (
  id && ObjectId.isValid(id) ? new ObjectId(id) : null
);

const buildStatusHistoryEntry = ({ status, reason = '', changedBy = null }) => ({
  _id: new ObjectId(),
  status: ALLOWED_BOOKING_STATUSES.includes(String(status)) ? String(status) : 'confirmed',
  reason: normalizeReason(reason, 220),
  changedAt: new Date(),
  changedBy: toObjectIdOrNull(changedBy)
});

const ensureHotelExists = async ({ session, hotelId }) => {
  const hotel = await getHotelsCollection().findOne(
    { _id: hotelId },
    { session, projection: { _id: 1 } }
  );

  if (!hotel) {
    throw createModelError('HOTEL_NOT_FOUND', 'Selected hotel does not exist');
  }
};

const reserveHotelRoom = async ({ session, hotelId }) => {
  const result = await getHotelsCollection().updateOne(
    {
      _id: hotelId,
      available_rooms: { $gt: 0 }
    },
    {
      $inc: { available_rooms: -1 },
      $set: { updatedAt: new Date() }
    },
    { session }
  );

  if (result.matchedCount === 0) {
    const hotel = await getHotelsCollection().findOne(
      { _id: hotelId },
      { session, projection: { _id: 1 } }
    );

    if (!hotel) {
      throw createModelError('HOTEL_NOT_FOUND', 'Selected hotel does not exist');
    }

    throw createModelError('NO_ROOMS', 'No available rooms for selected hotel');
  }
};

const releaseHotelRoom = async ({ session, hotelId }) => {
  await getHotelsCollection().updateOne(
    { _id: hotelId },
    {
      $inc: { available_rooms: 1 },
      $set: { updatedAt: new Date() }
    },
    { session }
  );
};

const buildBookingFilterFromQuery = ({ query = {}, currentUser = null, includeAll = false }) => {
  const filter = {};

  if (!includeAll && currentUser) {
    filter.userId = new ObjectId(currentUser.id);
  }

  const status = String(query.status || '').trim().toLowerCase();
  if (status && ['confirmed', 'cancelled'].includes(status)) {
    filter.status = status;
  }

  const hotelId = String(query.hotelId || '').trim();
  if (hotelId && ObjectId.isValid(hotelId)) {
    filter.hotelId = new ObjectId(hotelId);
  }

  return filter;
};

const listBookingsWithDetails = async ({ filter, skip, limit }) => {
  const pipeline = [
    { $match: filter },
    { $sort: { createdAt: -1 } },
    {
      $facet: {
        items: [
          { $skip: skip },
          { $limit: limit },
          {
            $lookup: {
              from: 'hotels',
              localField: 'hotelId',
              foreignField: '_id',
              as: 'hotel'
            }
          },
          {
            $lookup: {
              from: 'users',
              localField: 'userId',
              foreignField: '_id',
              as: 'user'
            }
          },
          { $unwind: { path: '$hotel', preserveNullAndEmptyArrays: true } },
          { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
          {
            $project: {
              hotelId: 1,
              userId: 1,
              checkIn: 1,
              checkOut: 1,
              guests: 1,
              status: 1,
              notes: 1,
              createdAt: 1,
              updatedAt: 1,
              hotelTitle: '$hotel.title',
              hotelLocation: '$hotel.location',
              userEmail: '$user.email'
            }
          }
        ],
        totalCount: [
          { $count: 'count' }
        ]
      }
    }
  ];

  const [result] = await getBookingsCollection().aggregate(pipeline).toArray();
  const items = result?.items || [];
  const total = result?.totalCount?.[0]?.count || 0;

  return { items, total };
};

const findBookingByIdWithDetails = async (id) => {
  if (!ObjectId.isValid(id)) return null;

  const [item] = await getBookingsCollection().aggregate([
    { $match: { _id: new ObjectId(id) } },
    {
      $lookup: {
        from: 'hotels',
        localField: 'hotelId',
        foreignField: '_id',
        as: 'hotel'
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: 'userId',
        foreignField: '_id',
        as: 'user'
      }
    },
    { $unwind: { path: '$hotel', preserveNullAndEmptyArrays: true } },
    { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        hotelId: 1,
        userId: 1,
        checkIn: 1,
        checkOut: 1,
        guests: 1,
        status: 1,
        notes: 1,
        statusHistory: 1,
        createdAt: 1,
        updatedAt: 1,
        hotelTitle: '$hotel.title',
        hotelLocation: '$hotel.location',
        userEmail: '$user.email'
      }
    }
  ]).toArray();

  return item || null;
};

const createBooking = async ({ booking, userId }) => {
  const now = new Date();
  const resolvedStatus = ALLOWED_BOOKING_STATUSES.includes(String(booking.status))
    ? String(booking.status)
    : 'confirmed';

  const statusHistory = [
    buildStatusHistoryEntry({
      status: resolvedStatus,
      reason: 'Booking created',
      changedBy: userId
    })
  ];

  const session = getClient().startSession();
  let insertedId = null;

  try {
    await session.withTransaction(async () => {
      await ensureHotelExists({
        session,
        hotelId: booking.hotelId
      });

      if (resolvedStatus === 'confirmed') {
        await reserveHotelRoom({
          session,
          hotelId: booking.hotelId
        });
      }

      const result = await getBookingsCollection().insertOne({
        ...booking,
        status: resolvedStatus,
        statusHistory,
        userId: new ObjectId(userId),
        createdAt: now,
        updatedAt: now
      }, { session });

      insertedId = result.insertedId;
    }, TRANSACTION_OPTIONS);
  } finally {
    await session.endSession();
  }

  return insertedId;
};

const updateBookingById = async (id, booking, { historyEntry = null } = {}) => {
  if (!ObjectId.isValid(id)) return { matchedCount: 0 };
  const bookingId = new ObjectId(id);
  const session = getClient().startSession();
  let matchedCount = 0;

  try {
    await session.withTransaction(async () => {
      const existing = await getBookingsCollection().findOne(
        { _id: bookingId },
        {
          session,
          projection: {
            hotelId: 1,
            status: 1
          }
        }
      );

      if (!existing) {
        matchedCount = 0;
        return;
      }

      matchedCount = 1;

      const nextHotelId = booking.hotelId || existing.hotelId;
      const nextStatus = ALLOWED_BOOKING_STATUSES.includes(String(booking.status))
        ? String(booking.status)
        : String(existing.status || 'confirmed');

      const currentHotelId = existing.hotelId;
      const currentStatus = String(existing.status || 'confirmed');
      const hotelChanged = String(currentHotelId) !== String(nextHotelId);
      const statusChanged = currentStatus !== nextStatus;

      if (hotelChanged) {
        await ensureHotelExists({ session, hotelId: nextHotelId });
      }

      if (hotelChanged || statusChanged) {
        if (currentStatus === 'confirmed') {
          await releaseHotelRoom({
            session,
            hotelId: currentHotelId
          });
        }

        if (nextStatus === 'confirmed') {
          await reserveHotelRoom({
            session,
            hotelId: nextHotelId
          });
        }
      }

      const update = {
        $set: {
          ...booking,
          status: nextStatus,
          updatedAt: new Date()
        }
      };

      if (historyEntry) {
        update.$push = { statusHistory: historyEntry };
      }

      await getBookingsCollection().updateOne(
        { _id: bookingId },
        update,
        { session }
      );
    }, TRANSACTION_OPTIONS);
  } finally {
    await session.endSession();
  }

  return { matchedCount };
};

const updateBookingStatusById = async (id, { status, reason = '', changedBy = null }) => {
  if (!ObjectId.isValid(id)) return { matchedCount: 0 };
  if (!ALLOWED_BOOKING_STATUSES.includes(String(status))) return { matchedCount: 0 };

  return updateBookingById(
    id,
    { status: String(status) },
    {
      historyEntry: buildStatusHistoryEntry({
        status,
        reason,
        changedBy
      })
    }
  );
};

const annotateBookingStatusHistoryById = async ({ id, entryId, comment, annotatedBy = null }) => {
  if (!ObjectId.isValid(id) || !ObjectId.isValid(entryId)) {
    return { matchedCount: 0 };
  }

  return getBookingsCollection().updateOne(
    {
      _id: new ObjectId(id),
      'statusHistory._id': new ObjectId(entryId)
    },
    {
      $set: {
        'statusHistory.$.comment': normalizeReason(comment, 300),
        'statusHistory.$.annotatedAt': new Date(),
        'statusHistory.$.annotatedBy': toObjectIdOrNull(annotatedBy),
        updatedAt: new Date()
      }
    }
  );
};

const removeBookingStatusHistoryById = async ({ id, entryId }) => {
  if (!ObjectId.isValid(id) || !ObjectId.isValid(entryId)) {
    return { matchedCount: 0 };
  }

  return getBookingsCollection().updateOne(
    {
      _id: new ObjectId(id),
      'statusHistory._id': new ObjectId(entryId)
    },
    {
      $pull: {
        statusHistory: { _id: new ObjectId(entryId) }
      },
      $set: {
        updatedAt: new Date()
      }
    }
  );
};

const deleteBookingById = async (id) => {
  if (!ObjectId.isValid(id)) return { deletedCount: 0 };
  const bookingId = new ObjectId(id);
  const session = getClient().startSession();
  let deletedCount = 0;

  try {
    await session.withTransaction(async () => {
      const existing = await getBookingsCollection().findOne(
        { _id: bookingId },
        {
          session,
          projection: {
            hotelId: 1,
            status: 1
          }
        }
      );

      if (!existing) {
        deletedCount = 0;
        return;
      }

      if (String(existing.status || 'confirmed') === 'confirmed') {
        await releaseHotelRoom({
          session,
          hotelId: existing.hotelId
        });
      }

      const result = await getBookingsCollection().deleteOne(
        { _id: bookingId },
        { session }
      );

      deletedCount = result.deletedCount;
    }, TRANSACTION_OPTIONS);
  } finally {
    await session.endSession();
  }

  return { deletedCount };
};

module.exports = {
  buildBookingFilterFromQuery,
  listBookingsWithDetails,
  findBookingByIdWithDetails,
  createBooking,
  updateBookingById,
  updateBookingStatusById,
  annotateBookingStatusHistoryById,
  removeBookingStatusHistoryById,
  deleteBookingById
};
