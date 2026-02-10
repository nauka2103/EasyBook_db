const { renderView, safeHtml } = require('../utils/view');
const { renderAuthControls } = require('./helpers');
const { getBookingAnalyticsOverview } = require('../models/analyticsModel');

const parseMonths = (value, fallback = 6) => {
  const numeric = Number(value);
  if (!Number.isInteger(numeric)) return fallback;
  return Math.min(Math.max(numeric, 1), 24);
};

const renderAnalyticsPage = (req, res) => res.send(renderView('analytics.html', {
  authControls: safeHtml(renderAuthControls(req, '/analytics')),
  initialMonths: String(parseMonths(req.query.months, 6))
}));

const getAnalyticsOverviewApi = async (req, res) => {
  const months = parseMonths(req.query.months, 6);
  const analytics = await getBookingAnalyticsOverview({ months });

  return res.status(200).json({
    monthsWindow: analytics.monthsWindow,
    fromDate: analytics.fromDate,
    summary: analytics.summary,
    byMonth: analytics.byMonth,
    topHotels: analytics.topHotels,
    byCity: analytics.byCity
  });
};

module.exports = {
  renderAnalyticsPage,
  getAnalyticsOverviewApi
};
