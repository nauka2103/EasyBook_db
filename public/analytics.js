(() => {
  const form = document.getElementById('analyticsForm');
  if (!form) return;

  const monthsInput = document.getElementById('months');
  const summaryTotal = document.getElementById('summaryTotal');
  const summaryConfirmed = document.getElementById('summaryConfirmed');
  const summaryCancelled = document.getElementById('summaryCancelled');
  const summaryRevenue = document.getElementById('summaryRevenue');
  const topHotelsBody = document.getElementById('topHotelsBody');
  const monthRows = document.getElementById('monthRows');
  const errorBox = document.getElementById('analyticsError');

  const number = new Intl.NumberFormat('en-US');
  const currency = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'KZT',
    maximumFractionDigits: 0
  });

  const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const clampMonths = (value) => {
    const n = Number(value);
    if (!Number.isInteger(n)) return 6;
    return Math.min(Math.max(n, 1), 24);
  };

  const setError = (message) => {
    if (!message) {
      errorBox.style.display = 'none';
      errorBox.textContent = '';
      return;
    }

    errorBox.style.display = 'block';
    errorBox.textContent = message;
  };

  const renderTopHotels = (rows) => {
    if (!Array.isArray(rows) || rows.length === 0) {
      topHotelsBody.innerHTML = `
        <tr>
          <td colspan="5" style="padding: 10px;">No data for this period.</td>
        </tr>
      `;
      return;
    }

    topHotelsBody.innerHTML = rows.map((row) => `
      <tr>
        <td style="padding:8px;">${escapeHtml(row.hotelTitle || 'Unknown hotel')}</td>
        <td style="padding:8px;">${escapeHtml(row.hotelLocation || '-')}</td>
        <td style="padding:8px; text-align:right;">${number.format(row.bookings || 0)}</td>
        <td style="padding:8px; text-align:right;">${number.format(row.confirmedBookings || 0)}</td>
        <td style="padding:8px; text-align:right;">${currency.format(row.estimatedRevenue || 0)}</td>
      </tr>
    `).join('');
  };

  const renderMonthRows = (rows) => {
    if (!Array.isArray(rows) || rows.length === 0) {
      monthRows.innerHTML = '<span class="chip">No monthly data for this period.</span>';
      return;
    }

    monthRows.innerHTML = rows.map((row) => (
      `<span class="chip">${escapeHtml(row._id || '-')}: ${number.format(row.bookings || 0)} bookings, ${currency.format(row.estimatedRevenue || 0)}</span>`
    )).join('');
  };

  const renderSummary = (summary) => {
    summaryTotal.textContent = number.format(summary.totalBookings || 0);
    summaryConfirmed.textContent = number.format(summary.confirmedBookings || 0);
    summaryCancelled.textContent = number.format(summary.cancelledBookings || 0);
    summaryRevenue.textContent = currency.format(summary.estimatedRevenue || 0);
  };

  const loadAnalytics = async (months) => {
    setError('');
    const response = await fetch(`/api/analytics/overview?months=${encodeURIComponent(months)}`, {
      credentials: 'same-origin'
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      const message = payload.error || `Analytics request failed (${response.status})`;
      throw new Error(message);
    }

    const data = await response.json();
    renderSummary(data.summary || {});
    renderTopHotels(data.topHotels || []);
    renderMonthRows(data.byMonth || []);
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const months = clampMonths(monthsInput.value);
    monthsInput.value = String(months);

    try {
      await loadAnalytics(months);
    } catch (error) {
      setError(error.message || 'Unable to load analytics now.');
    }
  });

  form.dispatchEvent(new Event('submit'));
})();
