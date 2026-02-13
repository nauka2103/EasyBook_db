# EasyBooking Report 

## 1. Project Overview

EasyBooking is a MongoDB-based web application for hotel discovery and reservation management.  
The system includes public hotel browsing, authenticated booking workflows, and admin analytics.

## 2. System Architecture

- Client: server-rendered HTML + browser JS (`fetch`)
- Backend: Node.js/Express with modular MVC-like structure
- Database: MongoDB (native driver)
- Auth: session-based (`express-session` + `connect-mongo`)

Request flow:
1. Request enters route (`web` or `api`).
2. Auth middleware attaches user session context.
3. Controller validates and applies business logic.
4. Model executes MongoDB query/update/aggregation.
5. Response returned as HTML or JSON.

## 3. Database Design

Collections:
- `users`
- `hotels`
- `bookings`
- `contact_requests`
- `hotel_presence` (queue slots per hotel page)

Referenced model:
- `bookings.userId -> users._id`
- `bookings.hotelId -> hotels._id`
- `hotels.createdBy -> users._id`

Embedded model:
- `bookings.statusHistory[]` (status audit entries)
- `hotels.recentRatings[]` (rating events)

Presence model:
- `hotel_presence.hotelId` references hotel
- `slot` is unique per hotel (`(hotelId, slot)` unique index)
- `token` is visitor UUID from HttpOnly cookie
- `expiresAt` controls automatic slot expiration (TTL index)

## 4. CRUD and Business Logic

Implemented full CRUD:
- Hotels (admin)
- Bookings (owner/admin)
- Contact requests (create)
- Users (register/auth)

Business rules:
- user can manage only own bookings
- admin can manage all bookings and hotels
- hotel rating updates counters and keeps recent embedded events
- booking status changes append audit history entries
- hotel page entry is capacity-limited and uses waiting room when all slots are busy

## 5. MongoDB Advanced Operations

Used operators:
- `$set` for standard updates
- `$inc` for rating counters
- `$push` for history/rating event appends
- `$pull` for removing embedded entries
- positional `$` for targeted embedded history note updates
- ACID transactions (`startSession` + `withTransaction`) for booking writes that also modify hotel room inventory
- TTL index and `expiresAt > now` checks for durable presence slot lifecycle

## 6. Aggregation Pipelines

### Booking list with details
- `$match` + `$sort` + `$lookup` + `$unwind` + `$facet` + `$project`
- supports pagination and joined display fields

### Analytics overview
- joins bookings with hotels
- computes nights, estimated revenue, monthly trends
- returns summary, top hotels, city stats

## 7. API Documentation

Main REST endpoints:
- `/api/auth/session`
- `/api/hotels/*`
- `/api/bookings/*`
- `/api/analytics/overview`
- `/api/hotels/:hotelId/presence/status`
- `/api/hotels/:hotelId/presence/heartbeat`
- `/api/v1/*` (versioning alias)

Detailed request/response examples are available in `openapi.yaml`.
Interactive docs are available via Swagger UI at `/api/docs`.

## 8. Indexing and Optimization

Indexes include:
- unique user email
- hotel filter/sort indexes
- booking ownership/status compound indexes
- createdAt indexes for list and analytics access
- presence indexes (`(hotelId,slot)` unique + TTL by `expiresAt`)

Goal: reduce scan volume for common queries and improve list/analytics latency.

## 9. Frontend Coverage

Frontend supports:
- hotel browse/view/create/edit/delete
- waiting room page (`/hotel-wait`) with auto-polling and auto-enter
- booking create/view/edit/delete
- auth flows (register/login/logout)
- admin analytics page using real API `fetch` integration

Minimum page requirement is exceeded.

## 10. Security Measures

- bcryptjs password hashing
- authenticated sessions in MongoDB store
- role-based route guards
- owner-level access control
- centralized error handling and safe redirects
- environment variables for runtime secrets
- presence token in HttpOnly cookie + rate-limited polling/heartbeat endpoints

## 11. Contribution

Single-student implementation:
- schema design and MongoDB integration
- backend and REST API
- frontend pages and API integration
- technical documentation and OpenAPI spec
