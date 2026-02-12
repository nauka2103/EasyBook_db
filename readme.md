# EasyBooking Endterm Project

Web application for hotel discovery and booking management built for **Advanced Databases (NoSQL)**.

## 1. Project Overview

EasyBooking provides:
- hotel catalog with filtering/sorting/pagination
- user registration/login with session-based authentication
- role-based authorization (`user`, `admin`)
- booking CRUD with ownership rules
- booking analytics for admins
- REST API + server-rendered frontend

This project uses MongoDB as the primary database and demonstrates CRUD, advanced updates/deletes, aggregation pipelines, indexing, and secure backend logic.

## 2. System Architecture

### Stack
- Node.js + Express
- MongoDB Native Driver
- `express-session` + `connect-mongo`
- `bcryptjs` for password hashing
- `swagger-ui-express` + OpenAPI (API docs UI)

### Layered structure
- `src/config` - environment/session config
- `src/models` - MongoDB data access and aggregation
- `src/controllers` - request handling and business logic
- `src/routes` - web and REST routing
- `src/middlewares` - auth, async, error handling
- `src/services` - startup maintenance (indexes)
- `views` - HTML pages
- `public` - static JS/CSS

### Data flow
1. Client sends request to web route (`/`) or API route (`/api/*`).
2. Middleware attaches current user from session.
3. Controller validates payload, applies business rules.
4. Model executes MongoDB operations.
5. Controller returns HTML or JSON.

## 3. Database Schema

### `users`
- `_id: ObjectId`
- `email: string` (unique)
- `passwordHash: string`
- `role: "user" | "admin"`
- `createdAt: Date`
- `updatedAt: Date`

### `hotels`
- `_id: ObjectId`
- `title, description, location, address: string`
- `price_per_night: number`
- `available_rooms: number`
- `amenities: string[]`
- `imageUrl: string`
- `rating: number`
- `ratingVotes: number`
- `ratingTotal: number`
- `recentRatings: [embedded documents]`
  - `_id: ObjectId`
  - `score: number`
  - `userId: ObjectId | null` (reference to `users`)
  - `createdAt: Date`
- `createdBy: ObjectId | null` (reference to `users`)
- `createdAt, updatedAt: Date`

### `bookings`
- `_id: ObjectId`
- `hotelId: ObjectId` (reference to `hotels`)
- `userId: ObjectId` (reference to `users`)
- `checkIn, checkOut: "YYYY-MM-DD"`
- `guests: number`
- `status: "confirmed" | "cancelled"`
- `notes: string`
- `statusHistory: [embedded documents]`
  - `_id: ObjectId`
  - `status: string`
  - `reason: string`
  - `changedAt: Date`
  - `changedBy: ObjectId | null` (reference to `users`)
  - `comment: string` (optional)
  - `annotatedAt: Date` (optional)
  - `annotatedBy: ObjectId | null` (optional)
- `createdAt, updatedAt: Date`

### `contact_requests`
- `_id: ObjectId`
- `name, phone, city, email, message: string`
- `status: "new"`
- `createdAt, updatedAt: Date`

### `hotel_presence`
- `_id: ObjectId`
- `hotelId: ObjectId` (reference to `hotels`)
- `slot: number` (range `1..PRESENCE_CAPACITY`)
- `token: string` (UUID from HttpOnly cookie)
- `userId: ObjectId | null`
- `expiresAt: Date` (presence TTL)
- `createdAt, updatedAt: Date`

## 4. MongoDB Queries and Operators

The project uses required operators and patterns:

- `$set`: standard update fields in hotel/booking/user updates.
- `$inc`: hotel rating counters (`ratingVotes`, `ratingTotal`).
- `$push`: append booking status history and recent rating events.
- `$pull`: remove booking status history entries and remove amenities.
- positional `$`: update one embedded history entry (`statusHistory.$.comment`).
- `$lookup`, `$unwind`, `$facet`, `$group`, `$addFields`, `$project`: aggregation endpoints.
- MongoDB ACID transactions (`startSession` + `withTransaction`) for booking consistency and room inventory updates.

## 5. REST API Documentation

### Auth
- `GET /api/auth/session` - current session status.

### Hotels
- `GET /api/hotels`
- `GET /api/hotels/:id`
- `POST /api/hotels` (admin)
- `PUT /api/hotels/:id` (admin)
- `DELETE /api/hotels/:id` (admin)
- `POST /api/hotels/:id/rate` (auth)
- `PATCH /api/hotels/:id/amenities` (admin, advanced update/delete)

### Bookings
- `GET /api/bookings` (auth)
- `GET /api/bookings/:id` (auth, owner/admin)
- `POST /api/bookings` (auth)
- `PUT /api/bookings/:id` (auth, owner/admin)
- `DELETE /api/bookings/:id` (auth, owner/admin)
- `PATCH /api/bookings/:id/status` (auth, owner/admin)
- `PATCH /api/bookings/:id/status-history/:entryId` (auth, owner/admin, positional update)
- `DELETE /api/bookings/:id/status-history/:entryId` (admin, `$pull`)

### Analytics
- `GET /api/analytics/overview` (admin)

### Presence / Queue
- `GET /api/hotels/:hotelId/presence/status`
- `POST /api/hotels/:hotelId/presence/heartbeat`

### API versioning
- Alias enabled at `/api/v1/*` for all routes.

### Swagger UI
- Interactive API docs: `GET /api/docs`
- Raw OpenAPI spec: `GET /api/docs/openapi.yaml`

## 6. Aggregation Endpoint (Business Meaning)

`GET /api/analytics/overview?months=6` computes:
- total / confirmed / cancelled bookings
- estimated revenue from confirmed bookings
- monthly booking and revenue trend
- top hotels by confirmed bookings and revenue
- city-level booking and revenue summary

The pipeline joins bookings with hotels and estimates booking amount using:
- nights between check-in/check-out
- hotel `price_per_night`
- booking status

## 7. Indexing and Optimization Strategy

Indexes are created at startup (`src/services/seedService.js`):

- `users`: `{ email: 1 }` unique
- `hotels`: `{ location: 1 }`
- `hotels`: `{ price_per_night: 1 }`
- `hotels`: `{ location: 1, price_per_night: 1, rating: -1 }` (compound)
- `hotels`: `{ createdAt: -1 }`
- `bookings`: `{ userId: 1, createdAt: -1 }`
- `bookings`: `{ userId: 1, status: 1, createdAt: -1 }` (compound)
- `bookings`: `{ hotelId: 1, createdAt: -1 }`
- `bookings`: `{ hotelId: 1, status: 1, createdAt: -1 }` (compound)
- `bookings`: `{ createdAt: -1, status: 1 }` (compound)
- `contact_requests`: `{ createdAt: -1 }`
- `hotel_presence`: `{ hotelId: 1, slot: 1 }` unique
- `hotel_presence`: `{ expiresAt: 1 }` TTL
- `hotel_presence`: `{ hotelId: 1, token: 1 }`
- `hotel_presence`: `{ hotelId: 1, expiresAt: 1 }`

These indexes target:
- frequent filters (`location`, `status`, ownership)
- sorted listings (`createdAt`)
- analytics and dashboard scans within recent months

## 8. Frontend Pages

Main pages include:
- `/` home
- `/hotels` hotels list
- `/hotels/:id` hotel details
- `/hotel-wait` waiting page for presence queue
- `/bookings` bookings list
- `/bookings/new` create booking
- `/bookings/:id` booking details
- `/analytics` admin analytics page (fetches real API data)
- `/login`, `/register`, `/about`, `/contact`, `/terms`, `/privacy`

This exceeds the minimum page requirement for a single student project.

## 9. Security and Authorization

- Password hashing with bcryptjs.
- Session storage in MongoDB (`connect-mongo`).
- Auth middleware for protected routes.
- Role-based authorization (`admin` routes and analytics).
- Owner-or-admin checks for booking access.
- Input validation and safe redirect handling.
- Centralized error and 404 handlers.
- Environment-based configuration (`.env`).
- Rate limiting for presence polling/heartbeat endpoints.

## 10. Run Instructions

```bash
npm install
npm start
```

Required `.env` variables:

```env
PORT=3000
MONGO_URI=...
DB_NAME=easybook_final
SESSION_SECRET=very_long_random_secret
DNS_SERVERS=8.8.8.8,1.1.1.1
PRESENCE_ENABLED=true
PRESENCE_CAPACITY=1
PRESENCE_TTL_SECONDS=60
PRESENCE_HEARTBEAT_SECONDS=15
```

## 11. Additional Engineering Artifacts

- `REPORT.md` - structured project report for defense.
- `openapi.yaml` - OpenAPI 3.0 specification (core API paths), rendered via Swagger UI.
- API pagination/filter/sort support on listing endpoints.
- ACID transactions for booking create/update/delete operations with inventory safety.
- Hotel page presence queue with DB-backed TTL slots and waiting page auto-admission.

## 12. Contribution

Single-student implementation:
- backend architecture and MongoDB modeling
- REST API design and security
- frontend pages and API integration
- documentation, OpenAPI, and deployment-ready config
