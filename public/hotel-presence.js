(() => {
  const root = document.body;
  if (!root) {
    return;
  }

  const enabled = root.dataset.presenceEnabled === 'true';
  if (!enabled) {
    return;
  }

  const hotelId = String(root.dataset.hotelId || '').trim();
  if (!hotelId) {
    return;
  }

  const waitUrl = String(root.dataset.presenceWaitUrl || `/hotel-wait?hotelId=${encodeURIComponent(hotelId)}`);
  const intervalSecondsRaw = Number(root.dataset.presenceHeartbeatSeconds || '15');
  const intervalMs = Math.max(1000, Number.isFinite(intervalSecondsRaw) ? intervalSecondsRaw * 1000 : 15000);
  let consecutiveErrors = 0;

  const redirectToWait = () => {
    if (window.location.pathname === '/hotel-wait') {
      return;
    }
    window.location.href = waitUrl;
  };

  const sendHeartbeat = async () => {
    try {
      const response = await fetch(`/api/hotels/${encodeURIComponent(hotelId)}/presence/heartbeat`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.status === 429) {
        return;
      }

      if (!response.ok) {
        consecutiveErrors += 1;
        if (consecutiveErrors >= 2) {
          redirectToWait();
        }
        return;
      }

      const payload = await response.json().catch(() => ({ ok: false }));
      if (!payload.ok) {
        redirectToWait();
        return;
      }

      consecutiveErrors = 0;
    } catch (_) {
      consecutiveErrors += 1;
      if (consecutiveErrors >= 3) {
        redirectToWait();
      }
    }
  };

  sendHeartbeat();
  const timer = setInterval(sendHeartbeat, intervalMs);

  window.addEventListener('beforeunload', () => {
    clearInterval(timer);
  });
})();
