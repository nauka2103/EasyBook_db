const { escapeHtml } = require('../utils/view');

const getSafeRedirectPath = (value, fallback = '/hotels') => {
  const pathValue = typeof value === 'string' ? value : '';
  if (!pathValue.startsWith('/') || pathValue.startsWith('//')) {
    return fallback;
  }
  return pathValue;
};

const renderAuthControls = (req, nextPath = '/hotels') => {
  if (req.currentUser) {
    return `
      <div class="auth-row">
        <span>
          Signed in as <strong>${escapeHtml(req.currentUser.email || 'user')}</strong>
        </span>
        <form method="POST" action="/logout" style="display:inline;">
          <input type="hidden" name="next" value="${escapeHtml(nextPath)}" />
          <button type="submit" class="btn btn-outline btn-small">Logout</button>
        </form>
      </div>
    `;
  }

  return `
    <div class="auth-row">
      <span>You are browsing as a guest.</span>
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        <a class="btn btn-outline btn-small" href="/login?next=${encodeURIComponent(nextPath)}">Login</a>
        <a class="btn btn-outline btn-small" href="/register?next=${encodeURIComponent(nextPath)}">Register</a>
      </div>
    </div>
  `;
};

const renderPaginationBar = ({ meta, basePath, query }) => {
  if (!meta || meta.totalPages <= 1) {
    return '';
  }

  const buildUrl = (page) => {
    const params = new URLSearchParams({ ...query, page: String(page) });
    return `${basePath}?${params.toString()}`;
  };

  return `
    <div class="pagination-bar">
      ${meta.hasPrev ? `<a class="btn btn-outline btn-small" href="${buildUrl(meta.prevPage)}">Previous</a>` : '<span class="pagination-empty"></span>'}
      <span>Page ${meta.page} of ${meta.totalPages} (${meta.total} records)</span>
      ${meta.hasNext ? `<a class="btn btn-outline btn-small" href="${buildUrl(meta.nextPage)}">Next</a>` : '<span class="pagination-empty"></span>'}
    </div>
  `;
};

module.exports = {
  getSafeRedirectPath,
  renderAuthControls,
  renderPaginationBar
};
