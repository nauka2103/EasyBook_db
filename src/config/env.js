require('dotenv').config();

const parseNumber = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';
const port = parseNumber(process.env.PORT, 3000);

const mongoUri = process.env.MONGO_URI;
const sessionSecret = process.env.SESSION_SECRET;

const validationErrors = [];

if (!mongoUri) {
  validationErrors.push('MONGO_URI is required.');
}

if (!sessionSecret || sessionSecret.length < 12) {
  validationErrors.push('SESSION_SECRET is required and must be at least 12 characters.');
}

if (validationErrors.length > 0) {
  throw new Error(`Environment validation failed: ${validationErrors.join(' ')}`);
}

module.exports = {
  env: {
    nodeEnv,
    isProduction,
    port,
    mongoUri,
    sessionSecret,
    hotelsPageSize: parseNumber(process.env.HOTELS_PAGE_SIZE, 6),
    hotelsPageMaxSize: parseNumber(process.env.HOTELS_PAGE_MAX_SIZE, 20),
    bookingsPageSize: parseNumber(process.env.BOOKINGS_PAGE_SIZE, 8),
    bookingsPageMaxSize: parseNumber(process.env.BOOKINGS_PAGE_MAX_SIZE, 25)
  }
};
