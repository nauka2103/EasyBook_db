const { MongoClient } = require('mongodb');
const dns = require('dns');

const uri = process.env.MONGO_URI;
const dbName = process.env.DB_NAME || 'easybook_final';
const dnsServers = (process.env.DNS_SERVERS || '8.8.8.8,1.1.1.1')
  .split(',')
  .map((server) => server.trim())
  .filter(Boolean);

let client;
let db;

async function connectToDb() {
  try {
    if (!uri) throw new Error('MONGO_URI is not set');
    if (uri.startsWith('mongodb+srv://') && dnsServers.length > 0) {
      dns.setServers(dnsServers);
    }

    client = new MongoClient(uri);
    await client.connect();

    console.log('Successfully connected to MongoDB');
    db = client.db(dbName);
    return db;
  } catch (err) {
    console.error('Failed to connect to MongoDB', err.message);
    process.exit(1);
  }
}

function getDb() {
  if (!db) {
    throw new Error('Database not initialized. Call connectToDb first.');
  }
  return db;
}

module.exports = { connectToDb, getDb };
