const bcrypt = require('bcrypt');
const { findUserByEmail, createUser } = require('../models/userModel');
const { renderView } = require('../utils/view');
const { toTrimmedString, validateRegisterPayload } = require('../utils/validation');
const { getSafeRedirectPath } = require('./helpers');

const renderLoginPage = (req, res) => {
  const nextPath = getSafeRedirectPath(req.query.next, '/hotels');
  if (req.currentUser) {
    return res.redirect(nextPath);
  }

  return res.send(renderView('login.html', {
    next: nextPath,
    errorMessage: '',
    emailValue: ''
  }));
};

const login = async (req, res) => {
  const email = toTrimmedString(req.body.email).toLowerCase();
  const password = String(req.body.password || '');
  const nextPath = getSafeRedirectPath(req.body.next, '/hotels');

  const sendInvalidCredentials = () => res.status(401).send(renderView('login.html', {
    next: nextPath,
    errorMessage: 'Invalid credentials',
    emailValue: email
  }));

  if (!email || !password) {
    return sendInvalidCredentials();
  }

  const user = await findUserByEmail(email);
  if (!user || !user.passwordHash) {
    return sendInvalidCredentials();
  }

  const validPassword = await bcrypt.compare(password, user.passwordHash);
  if (!validPassword) {
    return sendInvalidCredentials();
  }

  req.session.userId = user._id.toString();
  req.session.email = user.email;
  req.session.role = user.role || 'user';

  return res.redirect(nextPath);
};

const renderRegisterPage = (req, res) => {
  const nextPath = getSafeRedirectPath(req.query.next, '/bookings');
  if (req.currentUser) {
    return res.redirect(nextPath);
  }

  return res.send(renderView('register.html', {
    next: nextPath,
    errorMessage: '',
    emailValue: ''
  }));
};

const register = async (req, res) => {
  const nextPath = getSafeRedirectPath(req.body.next, '/bookings');
  const { errors, user } = validateRegisterPayload(req.body);
  const emailValue = toTrimmedString(req.body.email).toLowerCase();

  if (errors.length > 0) {
    return res.status(400).send(renderView('register.html', {
      next: nextPath,
      errorMessage: errors[0],
      emailValue
    }));
  }

  const existingEmail = await findUserByEmail(user.email);
  if (existingEmail) {
    return res.status(409).send(renderView('register.html', {
      next: nextPath,
      errorMessage: 'Email is already used',
      emailValue
    }));
  }

  let insertedId;
  try {
    insertedId = await createUser({
      email: user.email,
      password: user.password,
      role: 'user'
    });
  } catch (error) {
    const duplicateEmail = Boolean(
      error
      && error.code === 11000
      && (
        (error.keyPattern && error.keyPattern.email === 1)
        || (error.keyValue && typeof error.keyValue.email === 'string')
        || /email_1/i.test(String(error.message || ''))
      )
    );

    if (duplicateEmail) {
      return res.status(409).send(renderView('register.html', {
        next: nextPath,
        errorMessage: 'Email is already used',
        emailValue
      }));
    }

    return res.status(500).send(renderView('register.html', {
      next: nextPath,
      errorMessage: 'Registration is temporarily unavailable. Please try again.',
      emailValue
    }));
  }

  req.session.userId = insertedId.toString();
  req.session.email = user.email;
  req.session.role = 'user';

  return res.redirect(nextPath);
};

const logout = (req, res, next) => {
  const nextPath = getSafeRedirectPath(req.body.next, '/hotels');

  if (!req.session) {
    return res.redirect(nextPath);
  }

  req.session.destroy((error) => {
    if (error) {
      return next(error);
    }

    res.clearCookie('easybook.sid');
    return res.redirect(nextPath);
  });
};

const getSessionStatusApi = (req, res) => {
  if (!req.currentUser) {
    return res.status(401).json({ authenticated: false });
  }

  return res.status(200).json({
    authenticated: true,
    user: {
      id: req.currentUser.id,
      email: req.currentUser.email,
      role: req.currentUser.role
    }
  });
};

module.exports = {
  renderLoginPage,
  login,
  renderRegisterPage,
  register,
  logout,
  getSessionStatusApi
};
