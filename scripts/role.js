require('dotenv').config();
const dns = require('dns');
const { MongoClient } = require('mongodb');

const uri = process.env.MONGO_URI;
const dbName = process.env.DB_NAME || 'easybook_final';
const dnsServers = (process.env.DNS_SERVERS || '8.8.8.8,1.1.1.1')
  .split(',')
  .map((server) => server.trim())
  .filter(Boolean);

const action = String(process.argv[2] || '').trim().toLowerCase();
const emailArg = String(process.argv[3] || '').trim().toLowerCase();

const printUsage = () => {
  console.log('Usage:');
  console.log('  npm run role -- grant <email>');
  console.log('  npm run role -- revoke <email>');
  console.log('  npm run role -- show <email>');
  console.log('  npm run role -- list');
};

const requireMongoConfig = () => {
  if (!uri) {
    throw new Error('MONGO_URI is required in .env');
  }
};

const run = async () => {
  if (!['grant', 'revoke', 'show', 'list'].includes(action)) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  if (['grant', 'revoke', 'show'].includes(action) && !emailArg) {
    console.error('Email is required for this action.');
    printUsage();
    process.exitCode = 1;
    return;
  }

  requireMongoConfig();

  if (uri.startsWith('mongodb+srv://') && dnsServers.length > 0) {
    dns.setServers(dnsServers);
  }

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 });

  try {
    await client.connect();
    const db = client.db(dbName);
    const users = db.collection('users');

    if (action === 'list') {
      const list = await users.find({}, { projection: { email: 1, role: 1 } })
        .sort({ email: 1 })
        .toArray();

      if (list.length === 0) {
        console.log('No users found.');
        return;
      }

      list.forEach((user) => {
        console.log(`${user.email || '-'} | role=${user.role || 'user'}`);
      });
      return;
    }

    const email = emailArg;
    const user = await users.findOne({ email }, { projection: { email: 1, role: 1 } });
    if (!user) {
      console.error(`User not found: ${email}`);
      process.exitCode = 1;
      return;
    }

    if (action === 'show') {
      console.log(`${user.email || '-'} | role=${user.role || 'user'}`);
      return;
    }

    const targetRole = action === 'grant' ? 'admin' : 'user';
    if ((user.role || 'user') === targetRole) {
      console.log(`No changes: ${email} already has role '${targetRole}'.`);
      return;
    }

    await users.updateOne(
      { email },
      {
        $set: {
          role: targetRole,
          updatedAt: new Date()
        }
      }
    );

    console.log(`Updated: ${email} -> role='${targetRole}'`);
  } finally {
    await client.close();
  }
};

run().catch((error) => {
  console.error('Role command failed:', error.message);
  process.exit(1);
});
