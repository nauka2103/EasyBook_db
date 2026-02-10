const fs = require('fs');
const path = require('path');

const escapeHtml = (value = '') => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const safeHtml = (html = '') => ({ __safeHtml: true, html });

const renderView = (fileName, replacements = {}) => {
  let html = fs.readFileSync(path.join(process.cwd(), 'views', fileName), 'utf8');

  for (const [key, rawValue] of Object.entries(replacements)) {
    const value = rawValue && rawValue.__safeHtml ? rawValue.html : escapeHtml(rawValue);
    html = html.split(`{{${key}}}`).join(value);
  }

  return html;
};

module.exports = {
  escapeHtml,
  safeHtml,
  renderView
};
