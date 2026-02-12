/* eslint-disable global-require */
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');

describe('Hotel Presence Capacity', () => {
  let mongoServer;
  let app;
  let getDb;
  let getClient;
  let ensureStartupMaintenance;
  let hotelId;
  let createApp;
  let connectToDb;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    process.env.NODE_ENV = 'test';
    process.env.MONGO_URI = mongoServer.getUri();
    process.env.DB_NAME = 'easybook_presence_test';
    process.env.SESSION_SECRET = 'presence_test_secret_123456';
    process.env.PRESENCE_ENABLED = 'true';
    process.env.PRESENCE_CAPACITY = '1';
    process.env.PRESENCE_TTL_SECONDS = '3';
    process.env.PRESENCE_HEARTBEAT_SECONDS = '1';

    ({ connectToDb, getDb, getClient } = require('../database/db'));
    ({ ensureStartupMaintenance } = require('../src/services/seedService'));
    ({ createApp } = require('../src/app'));

    await connectToDb();
    await ensureStartupMaintenance();
    app = createApp();
  });

  beforeEach(async () => {
    const db = getDb();
    await db.collection('users').deleteMany({});
    await db.collection('bookings').deleteMany({});
    await db.collection('hotel_presence').deleteMany({});
    await db.collection('hotels').deleteMany({});

    const now = Date.now();
    const userRes = await db.collection('users').insertOne({
      email: `presence-${now}@example.com`,
      passwordHash: 'x',
      role: 'user',
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const hotelRes = await db.collection('hotels').insertOne({
      title: `Presence Hotel ${now}`,
      description: 'Presence test hotel description',
      location: 'Presence City',
      address: 'Presence Street 1',
      price_per_night: 15000,
      rating: 4.5,
      ratingVotes: 1,
      ratingTotal: 4.5,
      available_rooms: 5,
      amenities: ['WiFi'],
      imageUrl: '',
      recentRatings: [],
      createdBy: userRes.insertedId,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    hotelId = hotelRes.insertedId.toString();
  });

  afterAll(async () => {
    try {
      await getClient().close();
    } catch (_) {
      // no-op
    }
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  test('PRESENCE_CAPACITY=1 allows only one active page holder at the same time', async () => {
    const agentA = request.agent(app);
    const agentB = request.agent(app);

    const [responseA, responseB] = await Promise.all([
      agentA.get(`/hotels/${hotelId}`),
      agentB.get(`/hotels/${hotelId}`)
    ]);

    const statuses = [responseA.status, responseB.status].sort();
    expect(statuses).toEqual([200, 302]);

    const blockedResponse = responseA.status === 302 ? responseA : responseB;
    expect(blockedResponse.headers.location).toContain(`/hotel-wait?hotelId=${hotelId}`);
  });

  test('second visitor can enter after TTL expiration', async () => {
    const agentA = request.agent(app);
    const agentB = request.agent(app);

    const first = await agentA.get(`/hotels/${hotelId}`);
    expect(first.status).toBe(200);

    const blocked = await agentB.get(`/hotels/${hotelId}`);
    expect(blocked.status).toBe(302);
    expect(blocked.headers.location).toContain('/hotel-wait');

    await new Promise((resolve) => setTimeout(resolve, 3600));

    const secondTry = await agentB.get(`/hotels/${hotelId}`);
    expect(secondTry.status).toBe(200);
  });

  test('heartbeat prolongs slot and prevents expiration while active', async () => {
    const agentA = request.agent(app);
    const agentB = request.agent(app);

    const first = await agentA.get(`/hotels/${hotelId}`);
    expect(first.status).toBe(200);

    await new Promise((resolve) => setTimeout(resolve, 1800));

    const heartbeat = await agentA
      .post(`/api/hotels/${hotelId}/presence/heartbeat`)
      .send({});

    expect(heartbeat.status).toBe(200);
    expect(heartbeat.body.ok).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 1700));

    const blocked = await agentB.get(`/hotels/${hotelId}`);
    expect(blocked.status).toBe(302);
    expect(blocked.headers.location).toContain('/hotel-wait');
  });

  test('presence status endpoint returns active/capacity/canEnter', async () => {
    const agent = request.agent(app);
    const open = await agent.get(`/hotels/${hotelId}`);
    expect(open.status).toBe(200);

    const status = await agent.get(`/api/hotels/${hotelId}/presence/status`);
    expect(status.status).toBe(200);
    expect(typeof status.body.active).toBe('number');
    expect(status.body.capacity).toBe(1);
    expect(typeof status.body.canEnter).toBe('boolean');
  });
});
