const path = require('path');
const { renderView, safeHtml } = require('../utils/view');
const { toTrimmedString } = require('../utils/validation');
const { createContactRequest } = require('../models/contactModel');

const sendStaticPage = (res, fileName) => res.sendFile(path.join(process.cwd(), 'views', fileName));

const renderHomePage = (req, res) => {
  sendStaticPage(res, 'index.html');
};

const renderAboutPage = (req, res) => {
  sendStaticPage(res, 'about.html');
};

const renderContactTemplate = (res, {
  statusCode = 200,
  successMessage = '',
  errorMessage = '',
  values = {}
} = {}) => {
  const successHtml = successMessage
    ? `<div class="notice notice-success">${successMessage}</div>`
    : '';

  return res.status(statusCode).send(renderView('contact.html', {
    successMessage: safeHtml(successHtml),
    errorMessage,
    nameValue: values.name || '',
    phoneValue: values.phone || '',
    cityValue: values.city || '',
    emailValue: values.email || '',
    messageValue: values.message || ''
  }));
};

const renderContactPage = (req, res) => {
  const successMessage = req.query.sent === '1'
    ? 'Thanks for reaching out. Our team will contact you shortly.'
    : '';

  return renderContactTemplate(res, { successMessage });
};

const renderTermsPage = (req, res) => {
  sendStaticPage(res, 'terms.html');
};

const renderPrivacyPage = (req, res) => {
  sendStaticPage(res, 'privacy.html');
};

const validateContactPayload = ({ name, phone, city, email, message }) => {
  const errors = [];

  if (name.length < 2 || name.length > 80) {
    errors.push('Please provide a valid full name.');
  }

  if (!/^\+?[0-9\s()-]{8,20}$/.test(phone)) {
    errors.push('Please provide a valid phone number.');
  }

  if (city.length < 2 || city.length > 80) {
    errors.push('Please provide a valid city.');
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push('Please provide a valid email.');
  }

  if (message.length < 5 || message.length > 1000) {
    errors.push('Message should be between 5 and 1000 characters.');
  }

  return errors;
};

const handleContactForm = async (req, res) => {
  const payload = {
    name: toTrimmedString(req.body.name),
    phone: toTrimmedString(req.body.phone),
    city: toTrimmedString(req.body.city),
    email: toTrimmedString(req.body.email).toLowerCase(),
    message: toTrimmedString(req.body.message)
  };

  const errors = validateContactPayload(payload);
  if (errors.length > 0) {
    return renderContactTemplate(res, {
      statusCode: 400,
      errorMessage: errors[0],
      values: payload
    });
  }

  await createContactRequest(payload);
  return res.redirect('/contact?sent=1');
};

module.exports = {
  renderHomePage,
  renderAboutPage,
  renderContactPage,
  renderTermsPage,
  renderPrivacyPage,
  handleContactForm
};
