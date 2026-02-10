const express = require('express');
const { getSessionStatusApi } = require('../controllers/authController');
const {
  getHotelsApi,
  getHotelByIdApi,
  createHotelApi,
  updateHotelApi,
  deleteHotelApi,
  rateHotelApi
} = require('../controllers/hotelController');
const {
  getBookingsApi,
  getBookingByIdApi,
  createBookingApi,
  updateBookingApi,
  deleteBookingApi
} = require('../controllers/bookingController');
const { asyncHandler } = require('../middlewares/asyncHandler');
const { requireAuth, requireRole } = require('../middlewares/auth');

const apiRouter = express.Router();

apiRouter.get('/auth/session', getSessionStatusApi);

apiRouter.get('/hotels', asyncHandler(getHotelsApi));
apiRouter.get('/hotels/:id', asyncHandler(getHotelByIdApi));
apiRouter.post('/hotels', requireRole('admin'), asyncHandler(createHotelApi));
apiRouter.put('/hotels/:id', requireRole('admin'), asyncHandler(updateHotelApi));
apiRouter.delete('/hotels/:id', requireRole('admin'), asyncHandler(deleteHotelApi));
apiRouter.post('/hotels/:id/rate', requireAuth, asyncHandler(rateHotelApi));

apiRouter.get('/bookings', requireAuth, asyncHandler(getBookingsApi));
apiRouter.get('/bookings/:id', requireAuth, asyncHandler(getBookingByIdApi));
apiRouter.post('/bookings', requireAuth, asyncHandler(createBookingApi));
apiRouter.put('/bookings/:id', requireAuth, asyncHandler(updateBookingApi));
apiRouter.delete('/bookings/:id', requireAuth, asyncHandler(deleteBookingApi));

module.exports = {
  apiRouter
};
