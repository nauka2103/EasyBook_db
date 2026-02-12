const express = require('express');
const {
  renderHomePage,
  renderAboutPage,
  renderContactPage,
  handleContactForm,
  renderTermsPage,
  renderPrivacyPage
} = require('../controllers/pageController');
const {
  renderLoginPage,
  login,
  renderRegisterPage,
  register,
  logout
} = require('../controllers/authController');
const {
  renderHotelsPage,
  renderNewHotelPage,
  createHotelFromPage,
  renderHotelDetailsPage,
  renderEditHotelPage,
  updateHotelFromPage,
  deleteHotelFromPage,
  rateHotelFromPage
} = require('../controllers/hotelController');
const {
  renderBookingsPage,
  renderNewBookingPage,
  createBookingFromPage,
  renderBookingDetailsPage,
  renderEditBookingPage,
  updateBookingFromPage,
  deleteBookingFromPage
} = require('../controllers/bookingController');
const {
  renderAnalyticsPage
} = require('../controllers/analyticsController');
const {
  renderHotelWaitPage
} = require('../controllers/presenceController');
const { asyncHandler } = require('../middlewares/asyncHandler');
const { requireAuth, requireRole } = require('../middlewares/auth');
const { queueGuardForHotelPage } = require('../middlewares/presence');

const webRouter = express.Router();

webRouter.get('/', renderHomePage);
webRouter.get('/about', renderAboutPage);
webRouter.get('/contact', renderContactPage);
webRouter.post('/contact', asyncHandler(handleContactForm));
webRouter.get('/terms', renderTermsPage);
webRouter.get('/privacy', renderPrivacyPage);

webRouter.get('/search', (req, res) => {
  const q = req.query.q || '';
  res.redirect(`/hotels?q=${encodeURIComponent(q)}`);
});

webRouter.get('/hotel-wait', asyncHandler(renderHotelWaitPage));

webRouter.get('/login', renderLoginPage);
webRouter.post('/login', asyncHandler(login));
webRouter.get('/register', renderRegisterPage);
webRouter.post('/register', asyncHandler(register));
webRouter.post('/logout', logout);

webRouter.get('/hotels', asyncHandler(renderHotelsPage));
webRouter.get('/hotels/new', requireRole('admin'), renderNewHotelPage);
webRouter.post('/hotels', requireRole('admin'), asyncHandler(createHotelFromPage));

webRouter.get('/hotels/:id', asyncHandler(queueGuardForHotelPage), asyncHandler(renderHotelDetailsPage));
webRouter.get('/hotels/:id/edit', requireRole('admin'), asyncHandler(renderEditHotelPage));
webRouter.post('/hotels/:id', requireRole('admin'), asyncHandler(updateHotelFromPage));
webRouter.post('/hotels/:id/delete', requireRole('admin'), asyncHandler(deleteHotelFromPage));
webRouter.post('/hotels/:id/rate', requireAuth, asyncHandler(rateHotelFromPage));

webRouter.get('/bookings', requireAuth, asyncHandler(renderBookingsPage));
webRouter.get('/bookings/new', requireAuth, asyncHandler(renderNewBookingPage));
webRouter.post('/bookings', requireAuth, asyncHandler(createBookingFromPage));
webRouter.get('/bookings/:id', requireAuth, asyncHandler(renderBookingDetailsPage));
webRouter.get('/bookings/:id/edit', requireAuth, asyncHandler(renderEditBookingPage));
webRouter.post('/bookings/:id', requireAuth, asyncHandler(updateBookingFromPage));
webRouter.post('/bookings/:id/delete', requireAuth, asyncHandler(deleteBookingFromPage));

webRouter.get('/analytics', requireRole('admin'), asyncHandler(renderAnalyticsPage));

module.exports = {
  webRouter
};
