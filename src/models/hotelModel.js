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
  'imageUrl'
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
  const result = await getHotelsCollection().insertOne({
    ...hotel,
    ratingVotes: Number.isInteger(hotel.ratingVotes) ? hotel.ratingVotes : 0,
    ratingTotal: Number.isFinite(Number(hotel.ratingTotal)) ? Number(hotel.ratingTotal) : 0,
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

const rateHotelById = async (id, score) => {
  if (!ObjectId.isValid(id)) {
    return { matchedCount: 0 };
  }

  const numericScore = Number(score);
  if (!Number.isInteger(numericScore) || numericScore < 1 || numericScore > 5) {
    return { matchedCount: 0 };
  }

  const collection = getHotelsCollection();
  const hotel = await collection.findOne(
    { _id: new ObjectId(id) },
    { projection: { rating: 1, ratingTotal: 1, ratingVotes: 1 } }
  );

  if (!hotel) {
    return { matchedCount: 0 };
  }

  const fallbackRating = Number.isFinite(Number(hotel.rating)) ? Number(hotel.rating) : 0;
  const currentVotes = Number.isInteger(hotel.ratingVotes) && hotel.ratingVotes > 0 ? hotel.ratingVotes : 1;
  const currentTotal = Number.isFinite(Number(hotel.ratingTotal)) && Number(hotel.ratingTotal) > 0
    ? Number(hotel.ratingTotal)
    : fallbackRating;
  const nextVotes = currentVotes + 1;
  const nextTotal = currentTotal + numericScore;
  const nextRating = Number((nextTotal / nextVotes).toFixed(1));

  const result = await collection.updateOne(
    { _id: new ObjectId(id) },
    {
      $set: {
        rating: nextRating,
        ratingVotes: nextVotes,
        ratingTotal: nextTotal,
        updatedAt: new Date()
      }
    }
  );

  return {
    matchedCount: result.matchedCount,
    rating: nextRating,
    ratingVotes: nextVotes
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
  rateHotelById
};
