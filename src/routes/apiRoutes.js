const express = require('express');
const { getSessionStatusApi } = require('../controllers/authController');
const {
  getHotelsApi,
  getHotelByIdApi,
  createHotelApi,
  updateHotelApi,
  deleteHotelApi,
  rateHotelApi,
  patchHotelAmenitiesApi
} = require('../controllers/hotelController');
const {
  getBookingsApi,
  getBookingByIdApi,
  createBookingApi,
  updateBookingApi,
  deleteBookingApi,
  patchBookingStatusApi,
  patchBookingHistoryNoteApi,
  deleteBookingHistoryEntryApi
} = require('../controllers/bookingController');
const {
  getAnalyticsOverviewApi
} = require('../controllers/analyticsController');
const {
  getHotelPresenceStatusApi,
  postHotelPresenceHeartbeatApi
} = require('../controllers/presenceController');
const { asyncHandler } = require('../middlewares/asyncHandler');
const { requireAuth, requireRole } = require('../middlewares/auth');
const {
  presenceStatusRateLimiter,
  presenceHeartbeatRateLimiter
} = require('../middlewares/presence');

const apiRouter = express.Router();

apiRouter.get('/auth/session', getSessionStatusApi);

apiRouter.get('/hotels', asyncHandler(getHotelsApi));
apiRouter.get('/hotels/:id', asyncHandler(getHotelByIdApi));
apiRouter.post('/hotels', requireRole('admin'), asyncHandler(createHotelApi));
apiRouter.put('/hotels/:id', requireRole('admin'), asyncHandler(updateHotelApi));
apiRouter.delete('/hotels/:id', requireRole('admin'), asyncHandler(deleteHotelApi));
apiRouter.post('/hotels/:id/rate', requireAuth, asyncHandler(rateHotelApi));
apiRouter.patch('/hotels/:id/amenities', requireRole('admin'), asyncHandler(patchHotelAmenitiesApi));

apiRouter.get('/bookings', requireAuth, asyncHandler(getBookingsApi));
apiRouter.get('/bookings/:id', requireAuth, asyncHandler(getBookingByIdApi));
apiRouter.post('/bookings', requireAuth, asyncHandler(createBookingApi));
apiRouter.put('/bookings/:id', requireAuth, asyncHandler(updateBookingApi));
apiRouter.delete('/bookings/:id', requireAuth, asyncHandler(deleteBookingApi));
apiRouter.patch('/bookings/:id/status', requireAuth, asyncHandler(patchBookingStatusApi));
apiRouter.patch('/bookings/:id/status-history/:entryId', requireAuth, asyncHandler(patchBookingHistoryNoteApi));
apiRouter.delete('/bookings/:id/status-history/:entryId', requireAuth, asyncHandler(deleteBookingHistoryEntryApi));

apiRouter.get('/analytics/overview', requireRole('admin'), asyncHandler(getAnalyticsOverviewApi));

apiRouter.get('/hotels/:hotelId/presence/status', presenceStatusRateLimiter, asyncHandler(getHotelPresenceStatusApi));
apiRouter.post('/hotels/:hotelId/presence/heartbeat', presenceHeartbeatRateLimiter, asyncHandler(postHotelPresenceHeartbeatApi));

module.exports = {
  apiRouter
};
