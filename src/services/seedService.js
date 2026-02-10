const { getDb } = require('../../database/db');

const dropLegacyUsernameIndexes = async () => {
  const db = getDb();
  const usersCollection = db.collection('users');
  const userIndexes = await usersCollection.indexes();

  const legacyIndexNames = userIndexes
    .filter((index) =>
      index
      && index.name !== '_id_'
      && index.key
      && Object.prototype.hasOwnProperty.call(index.key, 'username')
    )
    .map((index) => index.name);

  for (const indexName of legacyIndexNames) {
    await usersCollection.dropIndex(indexName);
  }
};

const ensureIndexes = async () => {
  const db = getDb();
  const usersCollection = db.collection('users');

  // Legacy projects could have one or more indexes that include username.
  // Username is no longer used and these indexes break email-only registration.
  await dropLegacyUsernameIndexes();

  await Promise.all([
    usersCollection.createIndex({ email: 1 }, { unique: true, sparse: true }),
    db.collection('hotels').createIndex({ location: 1 }),
    db.collection('hotels').createIndex({ price_per_night: 1 }),
    db.collection('hotels').createIndex({ location: 1, price_per_night: 1, rating: -1 }),
    db.collection('hotels').createIndex({ createdAt: -1 }),
    db.collection('contact_requests').createIndex({ createdAt: -1 }),
    db.collection('bookings').createIndex({ userId: 1, createdAt: -1 }),
    db.collection('bookings').createIndex({ userId: 1, status: 1, createdAt: -1 }),
    db.collection('bookings').createIndex({ hotelId: 1, createdAt: -1 }),
    db.collection('bookings').createIndex({ hotelId: 1, status: 1, createdAt: -1 }),
    db.collection('bookings').createIndex({ createdAt: -1, status: 1 })
  ]);
};

const ensureStartupMaintenance = async () => {
  await ensureIndexes();
};

module.exports = {
  ensureStartupMaintenance
};
