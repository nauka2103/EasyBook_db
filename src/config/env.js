require('dotenv').config();

const parseNumber = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const parsePositiveInt = (value, fallback) => {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    return fallback;
  }
  return number;
};

const parseBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
};

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';
const isTest = nodeEnv === 'test';
const port = parseNumber(process.env.PORT, 3000);

const mongoUri = process.env.MONGO_URI;
const sessionSecret = process.env.SESSION_SECRET;
const presenceEnabled = parseBoolean(process.env.PRESENCE_ENABLED, false);
const presenceCapacity = parsePositiveInt(process.env.PRESENCE_CAPACITY, 1);
const presenceTtlSeconds = parsePositiveInt(process.env.PRESENCE_TTL_SECONDS, 60);
const presenceHeartbeatSecondsRaw = parsePositiveInt(process.env.PRESENCE_HEARTBEAT_SECONDS, 15);
const presenceHeartbeatSeconds = Math.min(presenceHeartbeatSecondsRaw, presenceTtlSeconds);

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
    isTest,
    port,
    mongoUri,
    sessionSecret,
    hotelsPageSize: parseNumber(process.env.HOTELS_PAGE_SIZE, 6),
    hotelsPageMaxSize: parseNumber(process.env.HOTELS_PAGE_MAX_SIZE, 20),
    bookingsPageSize: parseNumber(process.env.BOOKINGS_PAGE_SIZE, 8),
    bookingsPageMaxSize: parseNumber(process.env.BOOKINGS_PAGE_MAX_SIZE, 25),
    presenceEnabled,
    presenceCapacity,
    presenceTtlSeconds,
    presenceHeartbeatSeconds
  }
};
