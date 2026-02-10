const isApiRequest = (req) => req.originalUrl.startsWith('/api');

const getCurrentUser = (req) => {
  if (!req.session || !req.session.userId) {
    return null;
  }

  return {
    id: String(req.session.userId),
    email: req.session.email,
    role: req.session.role || 'user'
  };
};

const attachCurrentUser = (req, res, next) => {
  req.currentUser = getCurrentUser(req);
  next();
};

const isAuthenticated = (req) => Boolean(req.currentUser);
const isAdmin = (req) => req.currentUser?.role === 'admin';

const requireAuth = (req, res, next) => {
  if (isAuthenticated(req)) {
    return next();
  }

  if (isApiRequest(req)) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  return res.redirect(`/login?next=${encodeURIComponent(req.originalUrl || '/')}`);
};

const requireRole = (...roles) => (req, res, next) => {
  if (!isAuthenticated(req)) {
    return requireAuth(req, res, next);
  }

  if (roles.includes(req.currentUser.role)) {
    return next();
  }

  if (isApiRequest(req)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  return res.status(403).send('Forbidden');
};

const canAccessOwnerResource = (req, ownerId) => {
  if (!ownerId) return false;
  if (isAdmin(req)) return true;
  return String(ownerId) === String(req.currentUser?.id || '');
};

module.exports = {
  attachCurrentUser,
  requireAuth,
  requireRole,
  canAccessOwnerResource
};
