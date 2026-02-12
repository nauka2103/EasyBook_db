const bcrypt = require('bcryptjs');
const { getDb } = require('../../database/db');

const USER_COLLECTION = 'users';

const getUsersCollection = () => getDb().collection(USER_COLLECTION);

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const findUserByEmail = async (email) => {
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail) return null;
  return getUsersCollection().findOne({ email: cleanEmail });
};

const createUser = async ({ email, password, role = 'user' }) => {
  const passwordHash = await bcrypt.hash(password, 12);
  const cleanEmail = normalizeEmail(email);

  if (!cleanEmail) {
    throw new Error('Email is required');
  }

  const result = await getUsersCollection().insertOne({
    email: cleanEmail,
    passwordHash,
    role,
    createdAt: new Date(),
    updatedAt: new Date()
  });

  return result.insertedId;
};

module.exports = {
  findUserByEmail,
  createUser
};
