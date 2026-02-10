# EasyBooking Final Project (Week 10)

Production-ready web application built on the same Assignment 4 project.

## Tech Stack
- Node.js + Express
- MongoDB Native Driver
- express-session + connect-mongo
- bcrypt

## Final Project Requirements Coverage
- Modular backend structure:
  - `src/config`
  - `src/middlewares`
  - `src/models`
  - `src/controllers`
  - `src/routes`
  - `src/services`
- Two+ related collections:
  - `users`
  - `hotels`
  - `bookings` (references `userId` + `hotelId`)
  - `contact_requests`
- Authentication:
  - login / logout / register
  - sessions-based auth
  - bcrypt password hashing
- Authorization + roles:
  - roles: `user`, `admin`
  - admin can manage hotels and all bookings
  - user can manage only own bookings
- API security:
  - write endpoints protected
  - no public update/delete endpoints
  - validation + safe error handling
- Pagination:
  - hotels and bookings list endpoints support pagination metadata
- Environment-based secrets:
  - no hardcoded secrets required for startup

## Environment Variables (`.env`)
```env
PORT=3000
MONGO_URI=your_mongo_connection_string
DB_NAME=easybook_final
DNS_SERVERS=8.8.8.8,1.1.1.1
SESSION_SECRET=your_long_random_secret

# Optional seed users (email-based)
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=admin12345
DEMO_EMAIL=demo@example.com
DEMO_PASSWORD=demo12345
```

## Run
```bash
npm install
npm start
```

## Main Web Routes
- `GET /hotels` (public)
- `GET /hotels/:id` (public)
- `GET /bookings` (auth required)
- `GET /login`, `POST /login`
- `GET /register`, `POST /register`
- `GET /contact`, `POST /contact`
- `POST /logout`

## Main API Routes
- `GET /api/auth/session`
- `GET /api/hotels`
- `GET /api/hotels/:id`
- `POST /api/hotels` (admin)
- `PUT /api/hotels/:id` (admin)
- `DELETE /api/hotels/:id` (admin)
- `POST /api/hotels/:id/rate` (auth)
- `GET /api/bookings` (auth)
- `GET /api/bookings/:id` (owner or admin)
- `POST /api/bookings` (auth)
- `PUT /api/bookings/:id` (owner or admin)
- `DELETE /api/bookings/:id` (owner or admin)

- npm.cmd run role -- list
- npm.cmd run role -- show <username>
- npm.cmd run role -- grant <username>
- npm.cmd run role -- revoke <username>
