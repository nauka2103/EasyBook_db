(() => {
  const root = document.body;
  if (!root) {
    return;
  }

  const hotelId = String(root.dataset.hotelId || '').trim();
  if (!hotelId) {
    return;
  }

  const pollSecondsRaw = Number(root.dataset.pollSeconds || '4');
  const pollMs = Math.max(3000, Number.isFinite(pollSecondsRaw) ? pollSecondsRaw * 1000 : 4000);
  const statusLabel = document.getElementById('presenceStatusText');
  const targetUrl = `/hotels/${encodeURIComponent(hotelId)}`;

  const updateStatusText = (text) => {
    if (statusLabel) {
      statusLabel.textContent = text;
    }
  };

  const poll = async () => {
    try {
      const response = await fetch(`/api/hotels/${encodeURIComponent(hotelId)}/presence/status`, {
        method: 'GET',
        credentials: 'same-origin'
      });

      if (!response.ok) {
        updateStatusText('Availability service is temporarily unavailable. Retrying...');
        return;
      }

      const payload = await response.json();
      updateStatusText(`Current occupancy: ${payload.active}/${payload.capacity}`);

      if (payload.canEnter) {
        window.location.href = targetUrl;
      }
    } catch (_) {
      updateStatusText('Network issue while checking availability. Retrying...');
    }
  };

  poll();
  setInterval(poll, pollMs);
})();
