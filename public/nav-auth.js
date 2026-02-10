(() => {
  const navs = Array.from(document.querySelectorAll('.nav'));
  if (navs.length === 0) {
    return;
  }

  const nextPath = `${window.location.pathname}${window.location.search}`;

  const createLink = (href, label) => {
    const link = document.createElement('a');
    link.href = href;
    link.textContent = label;
    return link;
  };

  const createLogoutForm = () => {
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = '/logout';
    form.className = 'nav-logout-form';

    const hidden = document.createElement('input');
    hidden.type = 'hidden';
    hidden.name = 'next';
    hidden.value = nextPath;

    const button = document.createElement('button');
    button.type = 'submit';
    button.className = 'nav-logout-btn';
    button.textContent = 'Logout';

    form.appendChild(hidden);
    form.appendChild(button);
    return form;
  };

  fetch('/api/auth/session', { credentials: 'same-origin' })
    .then((response) => (response.ok ? response.json() : null))
    .then((data) => {
      const authenticated = Boolean(data && data.authenticated);

      navs.forEach((nav) => {
        const login = nav.querySelector('a[href="/login"]');
        const register = nav.querySelector('a[href="/register"]');
        const logoutForm = nav.querySelector('.nav-logout-form');

        if (authenticated) {
          if (login) login.remove();
          if (register) register.remove();
          if (!logoutForm) {
            nav.appendChild(createLogoutForm());
          }
          return;
        }

        if (logoutForm) logoutForm.remove();
        if (!login) nav.appendChild(createLink('/login', 'Login'));
        if (!register) nav.appendChild(createLink('/register', 'Register'));
      });
    })
    .catch(() => {
      // Ignore auth nav updates if session endpoint is temporarily unavailable.
    });
})();
