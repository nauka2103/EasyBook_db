const { ObjectId } = require('mongodb');
const { getDb } = require('../../database/db');

const HOTEL_COLLECTION = 'hotels';
const ALLOWED_HOTEL_FIELDS = [
  'title',
  'description',
  'location',
  'address',
  'price_per_night',
  'rating',
  'ratingVotes',
  'available_rooms',
  'amenities',
  'imageUrl',
  'ratingTotal',
  'recentRatings'
];

const getHotelsCollection = () => getDb().collection(HOTEL_COLLECTION);

const escapeRegex = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildFilterFromQuery = (query = {}) => {
  const { q = '', city = '', minPrice = '', maxPrice = '', minRating = '' } = query;
  const filter = {};

  if (city) {
    filter.location = city;
  }

  if (minPrice || maxPrice) {
    filter.price_per_night = {};

    if (minPrice !== '' && Number.isFinite(Number(minPrice))) {
      filter.price_per_night.$gte = Number(minPrice);
    }

    if (maxPrice !== '' && Number.isFinite(Number(maxPrice))) {
      filter.price_per_night.$lte = Number(maxPrice);
    }

    if (Object.keys(filter.price_per_night).length === 0) {
      delete filter.price_per_night;
    }
  }

  if (minRating !== '' && Number.isFinite(Number(minRating))) {
    const rating = Number(minRating);
    if (rating >= 1 && rating <= 5) {
      filter.rating = { $gte: rating };
    }
  }

  const queryText = String(q || '').trim();
  if (queryText) {
    const safePattern = escapeRegex(queryText);
    filter.$or = [
      { title: { $regex: safePattern, $options: 'i' } },
      { description: { $regex: safePattern, $options: 'i' } },
      { location: { $regex: safePattern, $options: 'i' } },
      { address: { $regex: safePattern, $options: 'i' } },
      { amenities: { $regex: safePattern, $options: 'i' } }
    ];
  }

  return filter;
};

const buildSortFromQuery = (sort = '') => {
  switch (sort) {
    case 'price_asc': return { price_per_night: 1, title: 1 };
    case 'price_desc': return { price_per_night: -1, title: 1 };
    case 'rating_desc': return { rating: -1, price_per_night: 1 };
    case 'title_asc': return { title: 1, price_per_night: 1 };
    case 'title_desc': return { title: -1, price_per_night: 1 };
    default: return { rating: -1, price_per_night: 1 };
  }
};

const buildProjectionFromQuery = (fields = '') => {
  if (!fields) return null;

  const projection = {};
  fields
    .split(',')
    .map((item) => item.trim())
    .filter((field) => ALLOWED_HOTEL_FIELDS.includes(field))
    .forEach((field) => {
      projection[field] = 1;
    });

  return Object.keys(projection).length > 0 ? projection : null;
};

const normalizeAmenitiesList = (value) => {
  const source = Array.isArray(value) ? value : [value];
  const unique = new Set();

  source
    .flatMap((item) => String(item || '').split(','))
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((item) => {
      if (item.length <= 40) {
        unique.add(item);
      }
    });

  return Array.from(unique);
};

const findHotels = async ({ filter = {}, sort = {}, projection = null, skip = 0, limit = 10 }) => {
  const options = projection ? { projection } : {};
  const collection = getHotelsCollection();

  const [items, total] = await Promise.all([
    collection
      .find(filter, options)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .toArray(),
    collection.countDocuments(filter)
  ]);

  return { items, total };
};

const findHotelById = async (id, projection = null) => {
  if (!ObjectId.isValid(id)) return null;
  const options = projection ? { projection } : {};
  return getHotelsCollection().findOne({ _id: new ObjectId(id) }, options);
};

const createHotel = async (hotel, userId) => {
  const now = new Date();
  const initialVotes = Number.isInteger(hotel.ratingVotes)
    ? Math.max(hotel.ratingVotes, 0)
    : 1;
  const initialTotal = Number.isFinite(Number(hotel.ratingTotal))
    ? Number(hotel.ratingTotal)
    : (Number(hotel.rating) || 0) * initialVotes;

  const result = await getHotelsCollection().insertOne({
    ...hotel,
    ratingVotes: initialVotes,
    ratingTotal: initialTotal,
    recentRatings: [],
    createdBy: userId ? new ObjectId(userId) : null,
    createdAt: now,
    updatedAt: now
  });
  return result.insertedId;
};

const updateHotelById = async (id, hotel) => {
  if (!ObjectId.isValid(id)) return { matchedCount: 0 };

  return getHotelsCollection().updateOne(
    { _id: new ObjectId(id) },
    {
      $set: {
        ...hotel,
        updatedAt: new Date()
      }
    }
  );
};

const deleteHotelById = async (id) => {
  if (!ObjectId.isValid(id)) return { deletedCount: 0 };
  return getHotelsCollection().deleteOne({ _id: new ObjectId(id) });
};

const distinctHotelCities = async () => getHotelsCollection().distinct('location');

const updateHotelAmenitiesById = async (id, { add = [], remove = [] }) => {
  if (!ObjectId.isValid(id)) {
    return { matchedCount: 0 };
  }

  const addList = normalizeAmenitiesList(add);
  const removeList = normalizeAmenitiesList(remove);

  if (addList.length === 0 && removeList.length === 0) {
    return { matchedCount: 0 };
  }

  const update = {
    $set: {
      updatedAt: new Date()
    }
  };

  if (addList.length > 0) {
    update.$addToSet = { amenities: { $each: addList } };
  }

  if (removeList.length > 0) {
    update.$pull = { amenities: { $in: removeList } };
  }

  return getHotelsCollection().updateOne(
    { _id: new ObjectId(id) },
    update
  );
};

const rateHotelById = async (id, score, userId = null) => {
  if (!ObjectId.isValid(id)) {
    return { matchedCount: 0 };
  }

  const numericScore = Number(score);
  if (!Number.isInteger(numericScore) || numericScore < 1 || numericScore > 5) {
    return { matchedCount: 0 };
  }

  const now = new Date();
  const collection = getHotelsCollection();

  await collection.updateOne(
    { _id: new ObjectId(id), ratingTotal: { $exists: false } },
    [
      {
        $set: {
          ratingTotal: {
            $multiply: [
              { $ifNull: ['$rating', 0] },
              { $ifNull: ['$ratingVotes', 0] }
            ]
          }
        }
      }
    ]
  );

  const result = await collection.updateOne(
    { _id: new ObjectId(id) },
    {
      $inc: {
        ratingVotes: 1,
        ratingTotal: numericScore
      },
      $push: {
        recentRatings: {
          $each: [{
            _id: new ObjectId(),
            score: numericScore,
            userId: userId && ObjectId.isValid(userId) ? new ObjectId(userId) : null,
            createdAt: now
          }],
          $slice: -50
        }
      },
      $set: {
        updatedAt: now
      }
    }
  );

  if (!result.matchedCount) {
    return { matchedCount: 0 };
  }

  await collection.updateOne(
    { _id: new ObjectId(id) },
    [
      {
        $set: {
          ratingVotes: { $ifNull: ['$ratingVotes', 0] },
          ratingTotal: { $ifNull: ['$ratingTotal', 0] }
        }
      },
      {
        $set: {
          rating: {
            $round: [
              {
                $divide: [
                  '$ratingTotal',
                  {
                    $cond: [
                      { $gt: ['$ratingVotes', 0] },
                      '$ratingVotes',
                      1
                    ]
                  }
                ]
              },
              1
            ]
          }
        }
      }
    ]
  );

  const ratedHotel = await collection.findOne(
    { _id: new ObjectId(id) },
    { projection: { rating: 1, ratingVotes: 1 } }
  );

  return {
    matchedCount: 1,
    rating: Number(ratedHotel?.rating || 0),
    ratingVotes: Number(ratedHotel?.ratingVotes || 0)
  };
};

module.exports = {
  buildFilterFromQuery,
  buildSortFromQuery,
  buildProjectionFromQuery,
  findHotels,
  findHotelById,
  createHotel,
  updateHotelById,
  deleteHotelById,
  distinctHotelCities,
  updateHotelAmenitiesById,
  rateHotelById
};
