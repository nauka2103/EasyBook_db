const path = require('path');
const { ObjectId } = require('mongodb');
const {
  buildBookingFilterFromQuery,
  listBookingsWithDetails,
  findBookingByIdWithDetails,
  createBooking,
  updateBookingById,
  updateBookingStatusById,
  annotateBookingStatusHistoryById,
  removeBookingStatusHistoryById,
  deleteBookingById
} = require('../models/bookingModel');
const { findHotelById, findHotels } = require('../models/hotelModel');
const { validateBookingPayload } = require('../utils/validation');
const { getPagination, getPaginationMeta } = require('../utils/pagination');
const { renderView, safeHtml, escapeHtml } = require('../utils/view');
const { renderAuthControls, renderPaginationBar } = require('./helpers');
const { env } = require('../config/env');
const { canAccessOwnerResource } = require('../middlewares/auth');

const isAdmin = (req) => req.currentUser?.role === 'admin';
const notFoundPagePath = path.join(process.cwd(), 'views', '404.html');
const sendNotFoundPage = (res, statusCode = 404) => res.status(statusCode).sendFile(notFoundPagePath);

const canManageBooking = (req, booking) => canAccessOwnerResource(req, booking?.userId);

const toSafeHistoryReason = (value, fallback = '') => {
  const text = String(value || '').trim().slice(0, 220);
  return text || fallback;
};

const buildStatusHistoryEntry = (status, reason, changedBy) => ({
  _id: new ObjectId(),
  status,
  reason: toSafeHistoryReason(reason),
  changedAt: new Date(),
  changedBy: ObjectId.isValid(changedBy) ? new ObjectId(changedBy) : null
});

const formatDateTime = (value) => {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const getHotelOptionsHtml = async (selectedHotelId = '') => {
  const { items: hotels } = await findHotels({
    filter: {},
    sort: { title: 1 },
    skip: 0,
    limit: 300
  });

  return hotels.map((hotel) => `
    <option value="${hotel._id}" ${String(hotel._id) === String(selectedHotelId) ? 'selected' : ''}>
      ${escapeHtml(hotel.title)} (${escapeHtml(hotel.location)})
    </option>
  `).join('');
};

const renderBookingsPage = async (req, res) => {
  const scope = req.query.scope === 'all' ? 'all' : 'mine';
  const includeAll = isAdmin(req) && scope === 'all';

  const pagination = getPagination({
    page: req.query.page,
    limit: req.query.limit,
    defaultLimit: env.bookingsPageSize,
    maxLimit: env.bookingsPageMaxSize
  });

  const filter = buildBookingFilterFromQuery({
    query: req.query,
    currentUser: req.currentUser,
    includeAll
  });

  const { items, total } = await listBookingsWithDetails({
    filter,
    skip: pagination.skip,
    limit: pagination.limit
  });

  const meta = getPaginationMeta({ total, page: pagination.page, limit: pagination.limit });

  const bookingsHtml = items.length === 0
    ? '<div class="feature-card"><h3>No bookings found</h3></div>'
    : items.map((booking) => {
      const canManage = canManageBooking(req, booking);
      const actions = [`<a class="btn" href="/bookings/${booking._id}">View</a>`];

      if (canManage) {
        actions.push(`<a class="btn btn-outline" href="/bookings/${booking._id}/edit">Edit</a>`);
        actions.push(`
          <form method="POST" action="/bookings/${booking._id}/delete" style="display:inline;">
            <button class="btn btn-outline" type="submit" onclick="return confirm('Delete this booking?')">Delete</button>
          </form>
        `);
      }

      return `
        <div class="feature-card" style="text-align:left;">
          <h3>${escapeHtml(booking.hotelTitle || 'Unknown hotel')}</h3>
          <p>
            <strong>Location:</strong> ${escapeHtml(booking.hotelLocation || '-')}<br/>
            <strong>User:</strong> ${escapeHtml(booking.userEmail || '-') }<br/>
            <strong>Dates:</strong> ${escapeHtml(booking.checkIn)} to ${escapeHtml(booking.checkOut)}<br/>
            <strong>Guests:</strong> ${escapeHtml(String(booking.guests))}<br/>
            <strong>Status:</strong> <span class="chip">${escapeHtml(booking.status)}</span>
          </p>
          <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top: 12px;">
            ${actions.join('')}
          </div>
        </div>
      `;
    }).join('');

  const paginationBar = renderPaginationBar({
    meta,
    basePath: '/bookings',
    query: {
      status: req.query.status || '',
      scope,
      limit: String(pagination.limit)
    }
  });

  const scopeOptions = isAdmin(req)
    ? `
      <option value="mine" ${scope === 'mine' ? 'selected' : ''}>My bookings</option>
      <option value="all" ${scope === 'all' ? 'selected' : ''}>All users bookings</option>
    `
    : '<option value="mine" selected>My bookings</option>';

  const roleNote = isAdmin(req)
    ? '<span class="chip">Extended access is enabled for this account.</span>'
    : '<span class="chip">Manage your reservations in one place.</span>';
  const adminActions = isAdmin(req)
    ? '<a class="btn btn-outline" href="/analytics">Analytics</a>'
    : '';

  return res.send(renderView('bookings.html', {
    authControls: safeHtml(renderAuthControls(req, '/bookings')),
    roleNote: safeHtml(roleNote),
    adminActions: safeHtml(adminActions),
    statusAllSelected: !req.query.status ? 'selected' : '',
    statusConfirmedSelected: req.query.status === 'confirmed' ? 'selected' : '',
    statusCancelledSelected: req.query.status === 'cancelled' ? 'selected' : '',
    scopeOptions: safeHtml(scopeOptions),
    bookings: safeHtml(bookingsHtml),
    paginationBar: safeHtml(paginationBar)
  }));
};

const renderNewBookingPage = async (req, res) => {
  const hotelId = req.query.hotelId || '';
  const hotelOptions = await getHotelOptionsHtml(hotelId);

  return res.send(renderView('bookings-new.html', {
    authControls: safeHtml(renderAuthControls(req, '/bookings/new')),
    errorMessage: '',
    hotelOptions: safeHtml(hotelOptions),
    checkIn: '',
    checkOut: '',
    guests: '1',
    statusConfirmedSelected: 'selected',
    statusCancelledSelected: '',
    notes: ''
  }));
};

const createBookingFromPage = async (req, res) => {
  const { errors, booking } = validateBookingPayload(req.body);
  const hotelOptions = await getHotelOptionsHtml(req.body.hotelId || '');

  if (errors.length > 0) {
    return res.status(400).send(renderView('bookings-new.html', {
      authControls: safeHtml(renderAuthControls(req, '/bookings/new')),
      errorMessage: errors[0],
      hotelOptions: safeHtml(hotelOptions),
      checkIn: req.body.checkIn || '',
      checkOut: req.body.checkOut || '',
      guests: req.body.guests || '1',
      statusConfirmedSelected: String(req.body.status || 'confirmed') === 'confirmed' ? 'selected' : '',
      statusCancelledSelected: String(req.body.status || '') === 'cancelled' ? 'selected' : '',
      notes: req.body.notes || ''
    }));
  }

  const hotel = await findHotelById(booking.hotelId.toString());
  if (!hotel) {
    return res.status(400).send(renderView('bookings-new.html', {
      authControls: safeHtml(renderAuthControls(req, '/bookings/new')),
      errorMessage: 'Selected hotel does not exist',
      hotelOptions: safeHtml(hotelOptions),
      checkIn: req.body.checkIn || '',
      checkOut: req.body.checkOut || '',
      guests: req.body.guests || '1',
      statusConfirmedSelected: String(req.body.status || 'confirmed') === 'confirmed' ? 'selected' : '',
      statusCancelledSelected: String(req.body.status || '') === 'cancelled' ? 'selected' : '',
      notes: req.body.notes || ''
    }));
  }

  const insertedId = await createBooking({
    booking,
    userId: req.currentUser.id
  });

  return res.redirect(`/bookings/${insertedId}`);
};

const renderBookingDetailsPage = async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) {
    return sendNotFoundPage(res, 400);
  }

  const booking = await findBookingByIdWithDetails(req.params.id);
  if (!booking) {
    return sendNotFoundPage(res, 404);
  }

  if (!canManageBooking(req, booking)) {
    return res.status(403).send('Forbidden');
  }

  const actionButtons = `
    <a class="btn btn-outline" href="/bookings/${booking._id}/edit">Edit</a>
    <form method="POST" action="/bookings/${booking._id}/delete" style="display:inline;">
      <button class="btn btn-outline" type="submit" onclick="return confirm('Delete this booking?')">Delete</button>
    </form>
  `;

  const statusHistory = Array.isArray(booking.statusHistory) ? booking.statusHistory : [];
  const historyHtml = statusHistory.length === 0
    ? '<li>No status updates yet.</li>'
    : statusHistory
      .slice()
      .reverse()
      .map((entry) => {
        const reason = String(entry.reason || '').trim();
        const comment = String(entry.comment || '').trim();
        return `
          <li>
            <strong>${escapeHtml(String(entry.status || '-'))}</strong>
            <span class="chip">${escapeHtml(formatDateTime(entry.changedAt))}</span>
            ${reason ? `<div>${escapeHtml(reason)}</div>` : ''}
            ${comment ? `<div><em>Note:</em> ${escapeHtml(comment)}</div>` : ''}
          </li>
        `;
      })
      .join('');

  return res.send(renderView('bookings-item.html', {
    authControls: safeHtml(renderAuthControls(req, `/bookings/${booking._id}`)),
    id: booking._id.toString(),
    hotelTitle: booking.hotelTitle || 'Unknown hotel',
    hotelLocation: booking.hotelLocation || '-',
    userEmail: booking.userEmail || '-',
    checkIn: booking.checkIn,
    checkOut: booking.checkOut,
    guests: String(booking.guests),
    status: booking.status,
    notes: booking.notes || '-',
    statusHistory: safeHtml(historyHtml),
    actionButtons: safeHtml(actionButtons)
  }));
};

const renderEditBookingPage = async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) {
    return sendNotFoundPage(res, 400);
  }

  const booking = await findBookingByIdWithDetails(req.params.id);
  if (!booking) {
    return sendNotFoundPage(res, 404);
  }

  if (!canManageBooking(req, booking)) {
    return res.status(403).send('Forbidden');
  }

  const hotelOptions = await getHotelOptionsHtml(booking.hotelId);

  return res.send(renderView('bookings-edit.html', {
    authControls: safeHtml(renderAuthControls(req, `/bookings/${booking._id}/edit`)),
    id: booking._id.toString(),
    errorMessage: '',
    hotelOptions: safeHtml(hotelOptions),
    checkIn: booking.checkIn,
    checkOut: booking.checkOut,
    guests: String(booking.guests),
    statusConfirmedSelected: booking.status === 'confirmed' ? 'selected' : '',
    statusCancelledSelected: booking.status === 'cancelled' ? 'selected' : '',
    notes: booking.notes || ''
  }));
};

const updateBookingFromPage = async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) {
    return sendNotFoundPage(res, 400);
  }

  const existing = await findBookingByIdWithDetails(req.params.id);
  if (!existing) {
    return sendNotFoundPage(res, 404);
  }

  if (!canManageBooking(req, existing)) {
    return res.status(403).send('Forbidden');
  }

  const { errors, booking } = validateBookingPayload(req.body);
  const hotelOptions = await getHotelOptionsHtml(req.body.hotelId || existing.hotelId);

  if (errors.length > 0) {
    return res.status(400).send(renderView('bookings-edit.html', {
      authControls: safeHtml(renderAuthControls(req, `/bookings/${req.params.id}/edit`)),
      id: req.params.id,
      errorMessage: errors[0],
      hotelOptions: safeHtml(hotelOptions),
      checkIn: req.body.checkIn || '',
      checkOut: req.body.checkOut || '',
      guests: req.body.guests || '1',
      statusConfirmedSelected: String(req.body.status || 'confirmed') === 'confirmed' ? 'selected' : '',
      statusCancelledSelected: String(req.body.status || '') === 'cancelled' ? 'selected' : '',
      notes: req.body.notes || ''
    }));
  }

  const hotel = await findHotelById(booking.hotelId.toString());
  if (!hotel) {
    return res.status(400).send(renderView('bookings-edit.html', {
      authControls: safeHtml(renderAuthControls(req, `/bookings/${req.params.id}/edit`)),
      id: req.params.id,
      errorMessage: 'Selected hotel does not exist',
      hotelOptions: safeHtml(hotelOptions),
      checkIn: req.body.checkIn || '',
      checkOut: req.body.checkOut || '',
      guests: req.body.guests || '1',
      statusConfirmedSelected: String(req.body.status || 'confirmed') === 'confirmed' ? 'selected' : '',
      statusCancelledSelected: String(req.body.status || '') === 'cancelled' ? 'selected' : '',
      notes: req.body.notes || ''
    }));
  }

  const statusChanged = Boolean(booking.status) && booking.status !== existing.status;
  await updateBookingById(
    req.params.id,
    booking,
    {
      historyEntry: statusChanged
        ? buildStatusHistoryEntry(
          booking.status,
          `Status updated by ${req.currentUser.email || 'user'} from booking edit page`,
          req.currentUser.id
        )
        : null
    }
  );
  return res.redirect(`/bookings/${req.params.id}`);
};

const deleteBookingFromPage = async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) {
    return sendNotFoundPage(res, 400);
  }

  const existing = await findBookingByIdWithDetails(req.params.id);
  if (!existing) {
    return sendNotFoundPage(res, 404);
  }

  if (!canManageBooking(req, existing)) {
    return res.status(403).send('Forbidden');
  }

  await deleteBookingById(req.params.id);
  return res.redirect('/bookings');
};

const getBookingsApi = async (req, res) => {
  const scope = req.query.scope === 'all' ? 'all' : 'mine';
  const includeAll = isAdmin(req) && scope === 'all';

  const pagination = getPagination({
    page: req.query.page,
    limit: req.query.limit,
    defaultLimit: env.bookingsPageSize,
    maxLimit: env.bookingsPageMaxSize
  });

  const filter = buildBookingFilterFromQuery({
    query: req.query,
    currentUser: req.currentUser,
    includeAll
  });

  const { items, total } = await listBookingsWithDetails({
    filter,
    skip: pagination.skip,
    limit: pagination.limit
  });

  const meta = getPaginationMeta({ total, page: pagination.page, limit: pagination.limit });
  return res.status(200).json({ items, meta });
};

const getBookingByIdApi = async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: 'Invalid ID' });
  }

  const booking = await findBookingByIdWithDetails(req.params.id);
  if (!booking) {
    return res.status(404).json({ error: 'Not found' });
  }

  if (!canManageBooking(req, booking)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  return res.status(200).json(booking);
};

const createBookingApi = async (req, res) => {
  const { errors, booking } = validateBookingPayload(req.body);
  if (errors.length > 0) {
    return res.status(400).json({ error: errors[0] });
  }

  const hotel = await findHotelById(booking.hotelId.toString());
  if (!hotel) {
    return res.status(400).json({ error: 'Selected hotel does not exist' });
  }

  const insertedId = await createBooking({ booking, userId: req.currentUser.id });
  return res.status(201).json({ _id: insertedId });
};

const updateBookingApi = async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: 'Invalid ID' });
  }

  const existing = await findBookingByIdWithDetails(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Not found' });
  }

  if (!canManageBooking(req, existing)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { errors, booking } = validateBookingPayload(req.body, { partial: true });
  if (errors.length > 0) {
    return res.status(400).json({ error: errors[0] });
  }

  if (booking.hotelId) {
    const hotel = await findHotelById(booking.hotelId.toString());
    if (!hotel) {
      return res.status(400).json({ error: 'Selected hotel does not exist' });
    }
  }

  const statusChanged = Boolean(booking.status) && booking.status !== existing.status;
  await updateBookingById(
    req.params.id,
    booking,
    {
      historyEntry: statusChanged
        ? buildStatusHistoryEntry(
          booking.status,
          `Status updated by ${req.currentUser.email || 'user'} via API`,
          req.currentUser.id
        )
        : null
    }
  );
  return res.status(200).json({ message: 'Updated' });
};

const deleteBookingApi = async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: 'Invalid ID' });
  }

  const existing = await findBookingByIdWithDetails(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Not found' });
  }

  if (!canManageBooking(req, existing)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  await deleteBookingById(req.params.id);
  return res.status(200).json({ message: 'Deleted' });
};

const patchBookingStatusApi = async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: 'Invalid ID' });
  }

  const nextStatus = String(req.body.status || '').trim().toLowerCase();
  if (!['confirmed', 'cancelled'].includes(nextStatus)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  const booking = await findBookingByIdWithDetails(req.params.id);
  if (!booking) {
    return res.status(404).json({ error: 'Not found' });
  }

  if (!canManageBooking(req, booking)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  if (booking.status === nextStatus) {
    return res.status(200).json({ message: 'Status unchanged', status: booking.status });
  }

  const reason = toSafeHistoryReason(
    req.body.reason,
    `Status updated by ${req.currentUser.email || 'user'}`
  );

  const result = await updateBookingStatusById(req.params.id, {
    status: nextStatus,
    reason,
    changedBy: req.currentUser.id
  });

  if (!result.matchedCount) {
    return res.status(404).json({ error: 'Not found' });
  }

  const updated = await findBookingByIdWithDetails(req.params.id);
  return res.status(200).json({
    message: 'Status updated',
    status: updated?.status || nextStatus,
    statusHistory: updated?.statusHistory || []
  });
};

const patchBookingHistoryNoteApi = async (req, res) => {
  if (!ObjectId.isValid(req.params.id) || !ObjectId.isValid(req.params.entryId)) {
    return res.status(400).json({ error: 'Invalid ID' });
  }

  const comment = String(req.body.comment || '').trim();
  if (!comment || comment.length > 300) {
    return res.status(400).json({ error: 'Comment is required and must be up to 300 characters' });
  }

  const booking = await findBookingByIdWithDetails(req.params.id);
  if (!booking) {
    return res.status(404).json({ error: 'Not found' });
  }

  if (!canManageBooking(req, booking)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const result = await annotateBookingStatusHistoryById({
    id: req.params.id,
    entryId: req.params.entryId,
    comment,
    annotatedBy: req.currentUser.id
  });

  if (!result.matchedCount) {
    return res.status(404).json({ error: 'History entry not found' });
  }

  return res.status(200).json({ message: 'History note updated' });
};

const deleteBookingHistoryEntryApi = async (req, res) => {
  if (!ObjectId.isValid(req.params.id) || !ObjectId.isValid(req.params.entryId)) {
    return res.status(400).json({ error: 'Invalid ID' });
  }

  if (!isAdmin(req)) {
    return res.status(403).json({ error: 'Only admin can remove history entries' });
  }

  const booking = await findBookingByIdWithDetails(req.params.id);
  if (!booking) {
    return res.status(404).json({ error: 'Not found' });
  }

  const historySize = Array.isArray(booking.statusHistory) ? booking.statusHistory.length : 0;
  if (historySize <= 1) {
    return res.status(400).json({ error: 'At least one history entry must remain' });
  }

  const result = await removeBookingStatusHistoryById({
    id: req.params.id,
    entryId: req.params.entryId
  });

  if (!result.matchedCount) {
    return res.status(404).json({ error: 'History entry not found' });
  }

  return res.status(200).json({ message: 'History entry removed' });
};

module.exports = {
  renderBookingsPage,
  renderNewBookingPage,
  createBookingFromPage,
  renderBookingDetailsPage,
  renderEditBookingPage,
  updateBookingFromPage,
  deleteBookingFromPage,
  getBookingsApi,
  getBookingByIdApi,
  createBookingApi,
  updateBookingApi,
  deleteBookingApi,
  patchBookingStatusApi,
  patchBookingHistoryNoteApi,
  deleteBookingHistoryEntryApi
};

