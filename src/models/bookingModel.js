const { ObjectId } = require('mongodb');
const { getDb } = require('../../database/db');

const BOOKING_COLLECTION = 'bookings';
const ALLOWED_BOOKING_STATUSES = ['confirmed', 'cancelled'];

const getBookingsCollection = () => getDb().collection(BOOKING_COLLECTION);

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

  const result = await getBookingsCollection().insertOne({
    ...booking,
    status: resolvedStatus,
    statusHistory,
    userId: new ObjectId(userId),
    createdAt: now,
    updatedAt: now
  });

  return result.insertedId;
};

const updateBookingById = async (id, booking, { historyEntry = null } = {}) => {
  if (!ObjectId.isValid(id)) return { matchedCount: 0 };

  const update = {
    $set: {
      ...booking,
      updatedAt: new Date()
    }
  };

  if (historyEntry) {
    update.$push = { statusHistory: historyEntry };
  }

  return getBookingsCollection().updateOne(
    { _id: new ObjectId(id) },
    update
  );
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
  return getBookingsCollection().deleteOne({ _id: new ObjectId(id) });
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
