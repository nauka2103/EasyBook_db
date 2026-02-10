const path = require('path');
const { ObjectId } = require('mongodb');
const {
  buildFilterFromQuery,
  buildSortFromQuery,
  buildProjectionFromQuery,
  findHotels,
  findHotelById,
  createHotel,
  updateHotelById,
  deleteHotelById,
  distinctHotelCities,
  updateHotelAmenitiesById,
  rateHotelById
} = require('../models/hotelModel');
const { validateHotelPayload } = require('../utils/validation');
const { getPagination, getPaginationMeta } = require('../utils/pagination');
const { renderView, safeHtml, escapeHtml } = require('../utils/view');
const { renderAuthControls, renderPaginationBar, getSafeRedirectPath } = require('./helpers');
const { env } = require('../config/env');

const isAdminUser = (req) => req.currentUser?.role === 'admin';
const notFoundPagePath = path.join(process.cwd(), 'views', '404.html');
const sendNotFoundPage = (res, statusCode = 404) => res.status(statusCode).sendFile(notFoundPagePath);

const buildHotelImageUrl = (hotel) => {
  const customImage = String(hotel.imageUrl || '').trim();
  if (/^https?:\/\/\S+$/i.test(customImage)) {
    return customImage;
  }

  const seed = encodeURIComponent(`${hotel.title || 'hotel'}-${hotel.location || 'city'}`);
  return `https://picsum.photos/seed/${seed}/1200/800`;
};

const buildRatingStarsHtml = (rating) => {
  const numericRating = Number(rating);
  const safeRating = Number.isFinite(numericRating) ? numericRating : 0;
  const activeCount = Math.max(0, Math.min(5, Math.round(safeRating)));

  return Array.from({ length: 5 }).map((_, index) => (
    `<span class="rating-star ${index < activeCount ? 'active' : ''}">&#9733;</span>`
  )).join('');
};

const buildRatingVotesText = (hotel) => {
  const votes = Number.isInteger(hotel.ratingVotes) ? hotel.ratingVotes : 0;
  if (votes <= 0) {
    return 'No votes yet';
  }
  return `${votes} vote${votes === 1 ? '' : 's'}`;
};

const buildGuestBookButton = (hotelId) => {
  const nextPath = `/bookings/new?hotelId=${hotelId}`;
  const loginUrl = `/login?next=${encodeURIComponent(nextPath)}`;

  return `
    <a
      class="btn btn-outline guest-book-btn"
      data-login-url="${escapeHtml(loginUrl)}"
      href="${escapeHtml(loginUrl)}"
    >Book</a>
  `;
};

const buildGuestRateButton = (hotelId) => {
  const nextPath = `/hotels/${hotelId}`;
  const loginUrl = `/login?next=${encodeURIComponent(nextPath)}`;

  return `
    <a
      class="btn btn-outline guest-rate-btn"
      data-login-url="${escapeHtml(loginUrl)}"
      href="${escapeHtml(loginUrl)}"
    >Rate</a>
  `;
};

const buildHotelCardHtml = (req, hotel) => {
  const amenities = Array.isArray(hotel.amenities) ? hotel.amenities : [];
  const amenitiesHtml = amenities.map((item) => `<span class="chip">${escapeHtml(item)}</span>`).join('');
  const imageUrl = buildHotelImageUrl(hotel);
  const ratingStars = buildRatingStarsHtml(hotel.rating);
  const ratingVotesText = buildRatingVotesText(hotel);

  const actions = [
    `<a class="btn" href="/hotels/${hotel._id}">View</a>`
  ];

  if (req.currentUser) {
    actions.push(`<a class="btn btn-outline" href="/bookings/new?hotelId=${hotel._id}">Book</a>`);
  } else {
    actions.push(buildGuestBookButton(hotel._id));
  }

  if (isAdminUser(req)) {
    actions.push(`<a class="btn btn-outline" href="/hotels/${hotel._id}/edit">Edit</a>`);
    actions.push(`
      <form method="POST" action="/hotels/${hotel._id}/delete" style="display:inline;">
        <button class="btn btn-outline" type="submit" onclick="return confirm('Delete this hotel?')">Delete</button>
      </form>
    `);
  }

  return `
    <article class="feature-card hotel-card">
      <img class="hotel-cover" src="${escapeHtml(imageUrl)}" alt="${escapeHtml(hotel.title || 'Hotel image')}" loading="lazy" />

      <div class="hotel-card-body">
        <h3>${escapeHtml(hotel.title || '')}</h3>
        <p>${escapeHtml(hotel.description || '')}</p>

        <p>
          <strong>City:</strong> ${escapeHtml(hotel.location || '')}<br/>
          <strong>Address:</strong> ${escapeHtml(hotel.address || '')}<br/>
          <strong>Price:</strong> ${escapeHtml(String(hotel.price_per_night ?? ''))} KZT<br/>
          <strong>Available rooms:</strong> ${escapeHtml(String(hotel.available_rooms ?? '-'))}
        </p>

        <div class="rating-row" aria-label="Rating ${escapeHtml(String(hotel.rating ?? '-'))} out of 5">
          <div class="rating-stars">${ratingStars}</div>
          <span class="rating-value">${escapeHtml(String(hotel.rating ?? '-'))}/5</span>
          <span class="rating-count">${escapeHtml(ratingVotesText)}</span>
        </div>

        <div class="chip-row">${amenitiesHtml}</div>

        <div class="hotel-card-actions">
          ${actions.join('')}
        </div>
      </div>
    </article>
  `;
};

const renderHotelsPage = async (req, res) => {
  const {
    q = '',
    city = '',
    minPrice = '',
    maxPrice = '',
    minRating = '',
    sort = '',
    fields = ''
  } = req.query;

  const pagination = getPagination({
    page: req.query.page,
    limit: req.query.limit,
    defaultLimit: env.hotelsPageSize,
    maxLimit: env.hotelsPageMaxSize
  });

  const filter = buildFilterFromQuery(req.query);
  const sortObject = buildSortFromQuery(sort);
  const projection = buildProjectionFromQuery(fields);

  const { items: hotels, total } = await findHotels({
    filter,
    sort: sortObject,
    projection,
    skip: pagination.skip,
    limit: pagination.limit
  });

  const cities = await distinctHotelCities();
  const meta = getPaginationMeta({ total, page: pagination.page, limit: pagination.limit });

  const results = hotels.length === 0
    ? '<div class="feature-card"><h3>No hotels found</h3></div>'
    : hotels.map((hotel) => buildHotelCardHtml(req, hotel)).join('');

  const cityOptions = ['<option value="">All</option>']
    .concat(cities.map((item) =>
      `<option value="${escapeHtml(item)}" ${item === city ? 'selected' : ''}>${escapeHtml(item)}</option>`
    )).join('');

  const sortOptions = [
    { value: '', label: 'Default (rating)' },
    { value: 'price_asc', label: 'Price ascending' },
    { value: 'price_desc', label: 'Price descending' },
    { value: 'rating_desc', label: 'Rating high to low' },
    { value: 'title_asc', label: 'Title A-Z' },
    { value: 'title_desc', label: 'Title Z-A' }
  ].map((item) =>
    `<option value="${escapeHtml(item.value)}" ${item.value === sort ? 'selected' : ''}>${escapeHtml(item.label)}</option>`
  ).join('');

  const paginationBar = renderPaginationBar({
    meta,
    basePath: '/hotels',
    query: {
      q,
      city,
      minPrice,
      maxPrice,
      minRating,
      sort,
      fields,
      limit: String(pagination.limit)
    }
  });

  const ratingOptions = [
    { value: '', label: 'Any rating' },
    { value: '4.5', label: '4.5 and higher' },
    { value: '4', label: '4.0 and higher' },
    { value: '3.5', label: '3.5 and higher' },
    { value: '3', label: '3.0 and higher' }
  ].map((item) =>
    `<option value="${escapeHtml(item.value)}" ${item.value === minRating ? 'selected' : ''}>${escapeHtml(item.label)}</option>`
  ).join('');

  const manageAction = isAdminUser(req)
    ? '<a class="btn" href="/hotels/new">Add hotel</a><a class="btn btn-outline" href="/analytics">Analytics</a>'
    : '';

  const bookingNotice = req.query.loginRequired === '1'
    ? '<div class="notice notice-warning">You need an account to book. Redirecting to login...</div>'
    : '';

  return res.send(renderView('hotels.html', {
    q,
    cityOptions: safeHtml(cityOptions),
    minPrice,
    maxPrice,
    minRating,
    ratingOptions: safeHtml(ratingOptions),
    sortOptions: safeHtml(sortOptions),
    manageAction: safeHtml(manageAction),
    authControls: safeHtml(renderAuthControls(req, '/hotels')),
    paginationBar: safeHtml(paginationBar),
    bookingNotice: safeHtml(bookingNotice),
    results: safeHtml(results)
  }));
};

const renderNewHotelPage = (req, res) => {
  res.send(renderView('hotels-new.html', {
    authControls: safeHtml(renderAuthControls(req, '/hotels/new')),
    errorMessage: '',
    title: '',
    description: '',
    location: '',
    address: '',
    price_per_night: '',
    rating: '',
    available_rooms: '',
    amenities: '',
    imageUrl: ''
  }));
};

const createHotelFromPage = async (req, res) => {
  const { errors, hotel } = validateHotelPayload(req.body);

  if (errors.length > 0) {
    return res.status(400).send(renderView('hotels-new.html', {
      authControls: safeHtml(renderAuthControls(req, '/hotels/new')),
      errorMessage: errors[0],
      title: req.body.title || '',
      description: req.body.description || '',
      location: req.body.location || '',
      address: req.body.address || '',
      price_per_night: req.body.price_per_night || '',
      rating: req.body.rating || '',
      available_rooms: req.body.available_rooms || '',
      amenities: req.body.amenities || '',
      imageUrl: req.body.imageUrl || ''
    }));
  }

  const insertedId = await createHotel(hotel, req.currentUser.id);
  return res.redirect(`/hotels/${insertedId}`);
};

const renderHotelDetailsPage = async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) {
    return sendNotFoundPage(res, 400);
  }

  const hotel = await findHotelById(req.params.id);
  if (!hotel) {
    return sendNotFoundPage(res, 404);
  }

  const amenitiesText = Array.isArray(hotel.amenities) ? hotel.amenities.join(', ') : '';
  const imageUrl = buildHotelImageUrl(hotel);
  const ratingStars = buildRatingStarsHtml(hotel.rating);
  const ratingVotesText = buildRatingVotesText(hotel);

  let manageButtons = '';
  if (isAdminUser(req)) {
    manageButtons = `
      <a href="/hotels/${hotel._id}/edit" class="btn btn-outline">Edit</a>
      <form method="POST" action="/hotels/${hotel._id}/delete" style="display:inline;">
        <button type="submit" class="btn btn-outline" onclick="return confirm('Delete this hotel?')">Delete</button>
      </form>
    `;
  }

  const bookButton = req.currentUser
    ? `<a href="/bookings/new?hotelId=${hotel._id}" class="btn">Book Now</a>`
    : buildGuestBookButton(hotel._id);

  const ratingActions = req.currentUser
    ? `
      <form method="POST" action="/hotels/${hotel._id}/rate" class="rating-form">
        <input type="hidden" name="next" value="/hotels/${hotel._id}" />
        <label for="score">Rate this hotel</label>
        <div class="rating-form-row">
          <select id="score" name="score" required>
            <option value="5">5 - Excellent</option>
            <option value="4">4 - Very good</option>
            <option value="3">3 - Good</option>
            <option value="2">2 - Fair</option>
            <option value="1">1 - Poor</option>
          </select>
          <button class="btn btn-outline" type="submit">Submit rating</button>
        </div>
      </form>
    `
    : buildGuestRateButton(hotel._id);

  const ratingNotice = req.query.rated === '1'
    ? '<div class="notice notice-success">Thanks! Your rating was saved.</div>'
    : (req.query.ratingError === '1'
      ? '<div class="notice notice-warning">Please choose a valid rating from 1 to 5.</div>'
      : '');

  return res.send(renderView('hotels-item.html', {
    id: hotel._id.toString(),
    title: hotel.title,
    description: hotel.description,
    location: hotel.location,
    address: hotel.address,
    imageUrl,
    price: `${hotel.price_per_night} KZT / night`,
    rating: String(hotel.rating),
    ratingStars: safeHtml(ratingStars),
    ratingVotes: ratingVotesText,
    available_rooms: String(hotel.available_rooms),
    amenities: amenitiesText,
    authControls: safeHtml(renderAuthControls(req, `/hotels/${hotel._id}`)),
    ratingNotice: safeHtml(ratingNotice),
    ratingActions: safeHtml(ratingActions),
    bookButton: safeHtml(bookButton),
    manageButtons: safeHtml(manageButtons)
  }));
};

const renderEditHotelPage = async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) {
    return sendNotFoundPage(res, 400);
  }

  const hotel = await findHotelById(req.params.id);
  if (!hotel) {
    return sendNotFoundPage(res, 404);
  }

  return res.send(renderView('hotels-edit.html', {
    id: hotel._id.toString(),
    title: hotel.title || '',
    description: hotel.description || '',
    location: hotel.location || '',
    address: hotel.address || '',
    price_per_night: String(hotel.price_per_night || ''),
    rating: String(hotel.rating || ''),
    available_rooms: String(hotel.available_rooms || ''),
    amenities: Array.isArray(hotel.amenities) ? hotel.amenities.join(', ') : '',
    imageUrl: hotel.imageUrl || '',
    authControls: safeHtml(renderAuthControls(req, `/hotels/${hotel._id}/edit`)),
    errorMessage: ''
  }));
};

const updateHotelFromPage = async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) {
    return sendNotFoundPage(res, 400);
  }

  const { errors, hotel } = validateHotelPayload(req.body);

  if (errors.length > 0) {
    return res.status(400).send(renderView('hotels-edit.html', {
      id: req.params.id,
      title: req.body.title || '',
      description: req.body.description || '',
      location: req.body.location || '',
      address: req.body.address || '',
      price_per_night: req.body.price_per_night || '',
      rating: req.body.rating || '',
      available_rooms: req.body.available_rooms || '',
      amenities: req.body.amenities || '',
      imageUrl: req.body.imageUrl || '',
      authControls: safeHtml(renderAuthControls(req, `/hotels/${req.params.id}/edit`)),
      errorMessage: errors[0]
    }));
  }

  const result = await updateHotelById(req.params.id, hotel);
  if (!result.matchedCount) {
    return sendNotFoundPage(res, 404);
  }

  return res.redirect(`/hotels/${req.params.id}`);
};

const deleteHotelFromPage = async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) {
    return sendNotFoundPage(res, 400);
  }

  const result = await deleteHotelById(req.params.id);
  if (!result.deletedCount) {
    return sendNotFoundPage(res, 404);
  }
  return res.redirect('/hotels');
};

const rateHotelFromPage = async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) {
    return sendNotFoundPage(res, 400);
  }

  const score = Number(req.body.score);
  const nextPath = getSafeRedirectPath(req.body.next, `/hotels/${req.params.id}`);

  if (!Number.isInteger(score) || score < 1 || score > 5) {
    return res.redirect(`${nextPath}${nextPath.includes('?') ? '&' : '?'}ratingError=1`);
  }

  const result = await rateHotelById(req.params.id, score, req.currentUser?.id || null);
  if (!result.matchedCount) {
    return sendNotFoundPage(res, 404);
  }

  return res.redirect(`${nextPath}${nextPath.includes('?') ? '&' : '?'}rated=1`);
};

const getHotelsApi = async (req, res) => {
  const pagination = getPagination({
    page: req.query.page,
    limit: req.query.limit,
    defaultLimit: env.hotelsPageSize,
    maxLimit: env.hotelsPageMaxSize
  });

  const filter = buildFilterFromQuery(req.query);
  const sortObject = buildSortFromQuery(req.query.sort || '');
  const projection = buildProjectionFromQuery(req.query.fields || '');

  const { items, total } = await findHotels({
    filter,
    sort: sortObject,
    projection,
    skip: pagination.skip,
    limit: pagination.limit
  });

  const meta = getPaginationMeta({ total, page: pagination.page, limit: pagination.limit });
  return res.status(200).json({ items, meta });
};

const getHotelByIdApi = async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: 'Invalid ID' });
  }

  const projection = buildProjectionFromQuery(req.query.fields || '');
  const hotel = await findHotelById(req.params.id, projection);

  if (!hotel) {
    return res.status(404).json({ error: 'Not found' });
  }

  return res.status(200).json(hotel);
};

const createHotelApi = async (req, res) => {
  const { errors, hotel } = validateHotelPayload(req.body);
  if (errors.length > 0) {
    return res.status(400).json({ error: 'Invalid hotel data' });
  }

  const insertedId = await createHotel(hotel, req.currentUser.id);
  return res.status(201).json({ _id: insertedId });
};

const updateHotelApi = async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: 'Invalid ID' });
  }

  const { errors, hotel } = validateHotelPayload(req.body, { partial: true });
  if (errors.length > 0) {
    return res.status(400).json({ error: 'Invalid hotel data' });
  }

  const result = await updateHotelById(req.params.id, hotel);
  if (!result.matchedCount) {
    return res.status(404).json({ error: 'Not found' });
  }

  return res.status(200).json({ message: 'Updated' });
};

const deleteHotelApi = async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: 'Invalid ID' });
  }

  const result = await deleteHotelById(req.params.id);
  if (!result.deletedCount) {
    return res.status(404).json({ error: 'Not found' });
  }

  return res.status(200).json({ message: 'Deleted' });
};

const rateHotelApi = async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: 'Invalid ID' });
  }

  const score = Number(req.body.score);
  if (!Number.isInteger(score) || score < 1 || score > 5) {
    return res.status(400).json({ error: 'Invalid rating score' });
  }

  const result = await rateHotelById(req.params.id, score, req.currentUser?.id || null);
  if (!result.matchedCount) {
    return res.status(404).json({ error: 'Not found' });
  }

  return res.status(200).json({
    message: 'Rating saved',
    rating: result.rating,
    ratingVotes: result.ratingVotes
  });
};

const patchHotelAmenitiesApi = async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: 'Invalid ID' });
  }

  const normalizeList = (value) => {
    const source = Array.isArray(value) ? value : [value];
    return Array.from(new Set(
      source
        .flatMap((item) => String(item || '').split(','))
        .map((item) => item.trim())
        .filter(Boolean)
        .filter((item) => item.length <= 40)
    ));
  };

  const add = normalizeList(req.body.add || []);
  const remove = normalizeList(req.body.remove || []);

  if (add.length === 0 && remove.length === 0) {
    return res.status(400).json({ error: 'Provide at least one amenity to add/remove' });
  }

  const result = await updateHotelAmenitiesById(req.params.id, { add, remove });
  if (!result.matchedCount) {
    return res.status(404).json({ error: 'Not found' });
  }

  const hotel = await findHotelById(req.params.id, { amenities: 1, updatedAt: 1 });
  return res.status(200).json({
    message: 'Amenities updated',
    amenities: Array.isArray(hotel?.amenities) ? hotel.amenities : [],
    updatedAt: hotel?.updatedAt || null
  });
};

module.exports = {
  renderHotelsPage,
  renderNewHotelPage,
  createHotelFromPage,
  renderHotelDetailsPage,
  renderEditHotelPage,
  updateHotelFromPage,
  deleteHotelFromPage,
  rateHotelFromPage,
  getHotelsApi,
  getHotelByIdApi,
  createHotelApi,
  updateHotelApi,
  deleteHotelApi,
  rateHotelApi,
  patchHotelAmenitiesApi
};

