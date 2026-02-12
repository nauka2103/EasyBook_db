const parseCookieHeader = (cookieHeader = '') => {
  const pairs = String(cookieHeader || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean);

  const cookies = {};
  for (const pair of pairs) {
    const separatorIndex = pair.indexOf('=');
    if (separatorIndex < 0) {
      continue;
    }

    const key = pair.slice(0, separatorIndex).trim();
    const value = pair.slice(separatorIndex + 1).trim();
    if (!key) {
      continue;
    }

    try {
      cookies[key] = decodeURIComponent(value);
    } catch (_) {
      cookies[key] = value;
    }
  }

  return cookies;
};

const getCookieValue = (req, key) => {
  const cookieHeader = req?.headers?.cookie || '';
  const cookies = parseCookieHeader(cookieHeader);
  const value = cookies[key];
  return typeof value === 'string' ? value : '';
};

module.exports = {
  parseCookieHeader,
  getCookieValue
};
