const path = require('path');

const notFoundHandler = (req, res) => {
  if (req.originalUrl.startsWith('/api')) {
    return res.status(404).json({ error: 'Not found' });
  }

  return res.status(404).sendFile(path.join(process.cwd(), 'views', '404.html'));
};

const errorHandler = (err, req, res, next) => {
  console.error('Unhandled error:', err);

  if (res.headersSent) {
    return next(err);
  }

  if (req.originalUrl.startsWith('/api')) {
    return res.status(500).json({ error: 'Internal server error' });
  }

  return res.status(500).send('Internal server error');
};

module.exports = {
  notFoundHandler,
  errorHandler
};
