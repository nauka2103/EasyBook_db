const { ObjectId } = require('mongodb');

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

const toTrimmedString = (value) => String(value ?? '').trim();

const normalizeAmenities = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => toTrimmedString(item)).filter(Boolean);
  }

  if (typeof value === 'string') {
    return value.split(',').map((item) => toTrimmedString(item)).filter(Boolean);
  }

  return [];
};

const validateHotelPayload = (payload, { partial = false } = {}) => {
  const errors = [];
  const hotel = {};
  const shouldValidate = (field) => !partial || hasOwn(payload, field);

  if (shouldValidate('title')) {
    const title = toTrimmedString(payload.title);
    if (title.length < 3 || title.length > 120) errors.push('Invalid title');
    else hotel.title = title;
  } else if (!partial) errors.push('Missing title');

  if (shouldValidate('description')) {
    const description = toTrimmedString(payload.description);
    if (description.length < 10 || description.length > 1200) errors.push('Invalid description');
    else hotel.description = description;
  } else if (!partial) errors.push('Missing description');

  if (shouldValidate('location')) {
    const location = toTrimmedString(payload.location);
    if (location.length < 2 || location.length > 80) errors.push('Invalid location');
    else hotel.location = location;
  } else if (!partial) errors.push('Missing location');

  if (shouldValidate('address')) {
    const address = toTrimmedString(payload.address);
    if (address.length < 5 || address.length > 180) errors.push('Invalid address');
    else hotel.address = address;
  } else if (!partial) errors.push('Missing address');

  if (shouldValidate('price_per_night')) {
    const price = Number(payload.price_per_night);
    if (!Number.isFinite(price) || price <= 0 || price > 1000000) errors.push('Invalid price');
    else hotel.price_per_night = price;
  } else if (!partial) errors.push('Missing price');

  if (shouldValidate('rating')) {
    const rating = Number(payload.rating);
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) errors.push('Invalid rating');
    else hotel.rating = Number(rating.toFixed(1));
  } else if (!partial) errors.push('Missing rating');

  if (shouldValidate('available_rooms')) {
    const availableRooms = Number(payload.available_rooms);
    if (!Number.isInteger(availableRooms) || availableRooms < 0 || availableRooms > 1000) {
      errors.push('Invalid available rooms');
    } else {
      hotel.available_rooms = availableRooms;
    }
  } else if (!partial) errors.push('Missing available rooms');

  if (shouldValidate('amenities')) {
    const amenities = normalizeAmenities(payload.amenities);
    const tooLong = amenities.some((item) => item.length > 40);
    if (amenities.length < 1 || amenities.length > 10 || tooLong) errors.push('Invalid amenities');
    else hotel.amenities = amenities;
  } else if (!partial) errors.push('Missing amenities');

  if (shouldValidate('imageUrl')) {
    const imageUrl = toTrimmedString(payload.imageUrl);
    if (imageUrl && (!/^https?:\/\/\S+$/i.test(imageUrl) || imageUrl.length > 400)) {
      errors.push('Invalid image URL');
    } else {
      hotel.imageUrl = imageUrl;
    }
  }

  if (partial && Object.keys(hotel).length === 0) {
    errors.push('No valid fields provided');
  }

  return { errors, hotel };
};

const extractReferenceToken = (email) => {
  const emailText = toTrimmedString(email).toLowerCase();
  if (emailText) {
    return emailText.split('@')[0] || emailText;
  }
  return '';
};

const hasThreeCharOverlap = (password, reference) => {
  const ref = String(reference || '').toLowerCase();
  const pass = String(password || '').toLowerCase();

  if (ref.length < 3 || pass.length < 3) {
    return false;
  }

  for (let i = 0; i <= ref.length - 3; i += 1) {
    const fragment = ref.slice(i, i + 3);
    if (!/^[a-z0-9]{3}$/.test(fragment)) {
      continue;
    }
    if (pass.includes(fragment)) {
      return true;
    }
  }

  return false;
};

const evaluatePasswordRules = (password, { email = '' } = {}) => {
  const text = String(password || '');
  const specialMatches = text.match(/[^a-zA-Z0-9]/g) || [];
  const specialCount = specialMatches.length;
  const referenceToken = extractReferenceToken(email);

  return {
    lengthRule: text.length >= 8 && text.length <= 50,
    lowerRule: /[a-z]/.test(text),
    upperRule: /[A-Z]/.test(text),
    digitRule: /[0-9]/.test(text),
    specialRule: specialCount >= 1 && specialCount <= 10,
    overlapRule: !hasThreeCharOverlap(text, referenceToken)
  };
};

const validateRegisterPayload = (payload) => {
  const email = toTrimmedString(payload.email).toLowerCase();
  const password = String(payload.password || '');
  const confirmPassword = String(payload.confirmPassword || '');
  const termsAccepted = payload.terms === 'on' || payload.terms === true || payload.terms === 'true';

  const errors = [];

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push('Valid email is required.');
  }

  const rules = evaluatePasswordRules(password, { email });
  if (!rules.lengthRule || !rules.lowerRule || !rules.upperRule || !rules.digitRule || !rules.specialRule || !rules.overlapRule) {
    errors.push('Password does not meet security requirements.');
  }

  if (password !== confirmPassword) {
    errors.push('Password confirmation does not match.');
  }

  if (!termsAccepted) {
    errors.push('You must accept the terms to continue.');
  }

  return {
    errors,
    user: { email, password }
  };
};

const parseIsoDate = (value) => {
  const text = toTrimmedString(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  return { text, date };
};

const validateBookingPayload = (payload, { partial = false } = {}) => {
  const errors = [];
  const booking = {};
  const shouldValidate = (field) => !partial || hasOwn(payload, field);

  if (shouldValidate('hotelId')) {
    const hotelId = toTrimmedString(payload.hotelId);
    if (!ObjectId.isValid(hotelId)) errors.push('Invalid hotel ID');
    else booking.hotelId = new ObjectId(hotelId);
  } else if (!partial) errors.push('Missing hotel ID');

  const checkInObj = shouldValidate('checkIn') ? parseIsoDate(payload.checkIn) : null;
  const checkOutObj = shouldValidate('checkOut') ? parseIsoDate(payload.checkOut) : null;

  if (shouldValidate('checkIn')) {
    if (!checkInObj) errors.push('Invalid check-in date');
    else booking.checkIn = checkInObj.text;
  } else if (!partial) errors.push('Missing check-in date');

  if (shouldValidate('checkOut')) {
    if (!checkOutObj) errors.push('Invalid check-out date');
    else booking.checkOut = checkOutObj.text;
  } else if (!partial) errors.push('Missing check-out date');

  if (checkInObj && checkOutObj && checkOutObj.date <= checkInObj.date) {
    errors.push('Check-out must be after check-in');
  }

  if (shouldValidate('guests')) {
    const guests = Number(payload.guests);
    if (!Number.isInteger(guests) || guests < 1 || guests > 10) errors.push('Invalid guest count');
    else booking.guests = guests;
  } else if (!partial) errors.push('Missing guest count');

  if (shouldValidate('status')) {
    const status = toTrimmedString(payload.status || 'confirmed').toLowerCase();
    if (!['confirmed', 'cancelled'].includes(status)) errors.push('Invalid status');
    else booking.status = status;
  } else if (!partial) {
    booking.status = 'confirmed';
  }

  if (shouldValidate('notes')) {
    const notes = toTrimmedString(payload.notes);
    if (notes.length > 400) errors.push('Notes too long');
    else booking.notes = notes;
  }

  if (partial && Object.keys(booking).length === 0) {
    errors.push('No valid fields provided');
  }

  return { errors, booking };
};

module.exports = {
  toTrimmedString,
  validateHotelPayload,
  validateRegisterPayload,
  validateBookingPayload
};
