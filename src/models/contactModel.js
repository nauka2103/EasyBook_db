const { getDb } = require('../../database/db');

const CONTACT_COLLECTION = 'contact_requests';

const getContactsCollection = () => getDb().collection(CONTACT_COLLECTION);

const createContactRequest = async ({ name, phone, city, email, message }) => {
  const now = new Date();

  const result = await getContactsCollection().insertOne({
    name,
    phone,
    city,
    email,
    message,
    status: 'new',
    createdAt: now,
    updatedAt: now
  });

  return result.insertedId;
};

module.exports = {
  createContactRequest
};
