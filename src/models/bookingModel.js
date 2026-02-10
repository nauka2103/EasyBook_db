const { ObjectId } = require('mongodb');
const { getDb } = require('../../database/db');

const BOOKING_COLLECTION = 'bookings';

const getBookingsCollection = () => getDb().collection(BOOKING_COLLECTION);

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
  const result = await getBookingsCollection().insertOne({
    ...booking,
    userId: new ObjectId(userId),
    createdAt: now,
    updatedAt: now
  });

  return result.insertedId;
};

const updateBookingById = async (id, booking) => {
  if (!ObjectId.isValid(id)) return { matchedCount: 0 };

  return getBookingsCollection().updateOne(
    { _id: new ObjectId(id) },
    {
      $set: {
        ...booking,
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
  deleteBookingById
};
