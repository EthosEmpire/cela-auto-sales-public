/* ==========================================================================
   Cela Auto Sales LLC — app.js
   Site-wide behavior for every page:
     • dealership info + shared helpers (window.Cela)
     • mobile navigation + sticky header state
     • subtle reveal-on-scroll
     • contact form (mailto hand-off until a real backend exists)
   No secrets or credentials belong in this file — it is public.
   ========================================================================== */
(function () {
  'use strict';

  /* ------------------------------------------------------------------------
     Dealership information (single source for JavaScript-rendered content)
     ------------------------------------------------------------------------ */
  var DEALER = Object.freeze({
    name: 'Cela Auto Sales LLC',
    shortName: 'Cela Auto Sales',
    phoneDisplay: '(208) 713-1487',
    phoneHref: 'tel:+12087131487',
    email: 'bcela@netzero.net',
    emailHref: 'mailto:bcela@netzero.net',
    street: '423 N Franklin Blvd',
    city: 'Nampa',
    region: 'Idaho',
    facebook: 'https://www.facebook.com/people/Cela-Auto-Sales-LLC/61590670534084/',
    directions: 'https://www.google.com/maps/dir/?api=1&destination=423+N+Franklin+Blvd%2C+Nampa%2C+ID'
  });

  /* ------------------------------------------------------------------------
     Contact form endpoint.
     Leave empty until a real backend exists (e.g. a Supabase Edge Function).
     While empty, the form opens the visitor's email app with the message
     ready to send — it never pretends a message was delivered.
     ------------------------------------------------------------------------ */
  var CONTACT_FORM_ENDPOINT = '';

  /* ------------------------------------------------------------------------
     Helpers
     ------------------------------------------------------------------------ */
  function escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** Allow only http(s) and relative URLs (blocks javascript:, data:, etc.). */
  function safeUrl(url) {
    if (typeof url !== 'string') return '';
    var trimmed = url.trim();
    if (!trimmed) return '';
    if (/^(https?:)?\/\//i.test(trimmed)) return trimmed;
    if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return '';
    return trimmed;
  }

  var ICONS = {
    phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.58 2.81.7A2 2 0 0 1 22 16.92z"/>',
    mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 6-10 7L2 6"/>',
    pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
    facebook: '<path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>',
    directions: '<polygon points="3 11 22 2 13 21 11 13 3 11"/>',
    arrow: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    car: '<path d="M5 17H3v-5l2.2-5.2A2 2 0 0 1 7.04 5.6h9.92a2 2 0 0 1 1.84 1.2L21 12v5h-2"/><path d="M3 12h18"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/><path d="M9 17h6"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    alert: '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    tag: '<path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><path d="M7 7h.01"/>'
  };

  function icon(name, extraClass) {
    return '<svg class="icon' + (extraClass ? ' ' + extraClass : '') + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
      (ICONS[name] || '') + '</svg>';
  }

  /** Call-to-action buttons used by empty/not-found states across pages. */
  function contactButtons(options) {
    var opts = options || {};
    var html = '<a class="btn btn--primary" href="' + DEALER.phoneHref + '">' + icon('phone') + 'Call ' + DEALER.phoneDisplay + '</a>';
    if (opts.inventory) {
      html += '<a class="btn btn--outline" href="inventory.html">' + icon('car') + 'Browse Inventory</a>';
    }
    if (opts.facebook !== false) {
      html += '<a class="btn btn--dark" href="' + DEALER.facebook + '" target="_blank" rel="noopener noreferrer">' + icon('facebook') + 'Facebook</a>';
    }
    if (opts.contact !== false) {
      html += '<a class="btn btn--dark" href="contact.html">' + icon('mail') + 'Contact Us</a>';
    }
    return html;
  }

  window.Cela = {
    DEALER: DEALER,
    escapeHtml: escapeHtml,
    safeUrl: safeUrl,
    icon: icon,
    contactButtons: contactButtons
  };

  /* ------------------------------------------------------------------------
     Mobile navigation
     ------------------------------------------------------------------------ */
  function initNav() {
    var toggle = document.querySelector('[data-nav-toggle]');
    var menu = document.getElementById('mobile-menu');
    var header = document.querySelector('[data-site-header]');
    if (!toggle || !menu) return;

    function isOpen() {
      return toggle.getAttribute('aria-expanded') === 'true';
    }

    function open() {
      menu.hidden = false;
      toggle.setAttribute('aria-expanded', 'true');
      toggle.setAttribute('aria-label', 'Close menu');
    }

    function close(returnFocus) {
      if (!isOpen()) return;
      menu.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Open menu');
      if (returnFocus) toggle.focus();
    }

    toggle.addEventListener('click', function () {
      if (isOpen()) close(false); else open();
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && isOpen()) close(true);
    });

    document.addEventListener('click', function (event) {
      if (isOpen() && header && !header.contains(event.target)) close(false);
    });

    menu.addEventListener('click', function (event) {
      if (event.target.closest('a')) close(false);
    });

    var desktop = window.matchMedia('(min-width: 960px)');
    var onChange = function (event) { if (event.matches) close(false); };
    if (desktop.addEventListener) desktop.addEventListener('change', onChange);
    else if (desktop.addListener) desktop.addListener(onChange);
  }

  /* ------------------------------------------------------------------------
     Sticky header shadow once the page scrolls
     ------------------------------------------------------------------------ */
  function initHeader() {
    var header = document.querySelector('[data-site-header]');
    if (!header) return;
    var ticking = false;
    function update() {
      header.classList.toggle('is-scrolled', window.scrollY > 8);
      ticking = false;
    }
    window.addEventListener('scroll', function () {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(update);
      }
    }, { passive: true });
    update();
  }

  /* ------------------------------------------------------------------------
     Reveal-on-scroll. Elements already on screen are marked visible before
     the effect is switched on, so nothing flickers; if this script fails to
     load, nothing is ever hidden.
     ------------------------------------------------------------------------ */
  function initReveal() {
    var items = Array.prototype.slice.call(document.querySelectorAll('[data-reveal]'));
    if (!items.length) return;
    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion || !('IntersectionObserver' in window)) return;

    var viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    items.forEach(function (el) {
      if (el.getBoundingClientRect().top < viewportHeight * 0.95) el.classList.add('is-visible');
    });
    document.documentElement.classList.add('reveal-ready');

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

    items.forEach(function (el) {
      if (!el.classList.contains('is-visible')) observer.observe(el);
    });
  }

  /* ------------------------------------------------------------------------
     Contact form
     ------------------------------------------------------------------------ */
  function initContactForm() {
    var form = document.querySelector('[data-contact-form]');
    if (!form) return;

    var status = form.querySelector('[data-form-status]');
    var fields = {
      name: form.elements.namedItem('name'),
      phone: form.elements.namedItem('phone'),
      email: form.elements.namedItem('email'),
      message: form.elements.namedItem('message')
    };

    // Pre-fill a vehicle inquiry when arriving from a vehicle page (contact.html?vehicle=ID)
    var vehicleId = new URLSearchParams(window.location.search).get('vehicle');
    if (vehicleId && window.CelaVehicles) {
      window.CelaVehicles.get(vehicleId).then(function (vehicle) {
        if (!vehicle || fields.message.value) return;
        var ref = window.CelaVehicles.fullTitle(vehicle) + (vehicle.stockNumber ? ' (Stock #' + vehicle.stockNumber + ')' : '');
        fields.message.value = 'Hi, I’m interested in the ' + ref + '. Is it still available?';
      }).catch(function () { /* leave the message blank */ });
    }

    function setError(field, message) {
      var errorEl = document.getElementById(field.id + '-error');
      if (message) {
        field.setAttribute('aria-invalid', 'true');
        if (errorEl) { errorEl.textContent = message; errorEl.hidden = false; }
      } else {
        field.removeAttribute('aria-invalid');
        if (errorEl) { errorEl.textContent = ''; errorEl.hidden = true; }
      }
    }

    function showStatus(kind, html) {
      if (!status) return;
      status.className = 'form-status form-status--' + kind;
      status.innerHTML = html;
    }

    function validate() {
      var name = fields.name.value.trim();
      var phone = fields.phone.value.trim();
      var email = fields.email.value.trim();
      var message = fields.message.value.trim();
      var firstInvalid = null;

      setError(fields.name, name ? '' : 'Please enter your name.');
      if (!name) firstInvalid = firstInvalid || fields.name;

      var phoneDigits = phone.replace(/\D/g, '');
      var phoneProblem = phone && phoneDigits.length < 10 ? 'Please enter a full phone number, including area code.' : '';
      var emailProblem = email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? 'Please enter a valid email address.' : '';
      var needOne = !phone && !email ? 'Please add a phone number or email so we can reply.' : '';

      // "Phone or email" is shown once (under Phone) but both fields are flagged.
      setError(fields.phone, phoneProblem || needOne);
      setError(fields.email, emailProblem);
      if (needOne) fields.email.setAttribute('aria-invalid', 'true');
      if (phoneProblem || needOne) firstInvalid = firstInvalid || fields.phone;
      if (emailProblem) firstInvalid = firstInvalid || fields.email;

      setError(fields.message, message ? '' : 'Please enter a message.');
      if (!message) firstInvalid = firstInvalid || fields.message;

      return { ok: !firstInvalid, firstInvalid: firstInvalid, data: { name: name, phone: phone, email: email, message: message } };
    }

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var result = validate();
      if (!result.ok) {
        showStatus('error', 'Please fix the highlighted fields and try again.');
        result.firstInvalid.focus();
        return;
      }

      var data = result.data;

      if (CONTACT_FORM_ENDPOINT) {
        var submitButton = form.querySelector('[type="submit"]');
        if (submitButton) submitButton.disabled = true;
        fetch(CONTACT_FORM_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        }).then(function (response) {
          if (!response.ok) throw new Error('Request failed');
          form.reset();
          showStatus('info', 'Thank you — your message was sent. We’ll get back to you as soon as we can.');
        }).catch(function () {
          showStatus('error', 'Sorry, your message could not be sent. Please call ' +
            '<a href="' + DEALER.phoneHref + '">' + DEALER.phoneDisplay + '</a> or email ' +
            '<a href="' + DEALER.emailHref + '">' + DEALER.email + '</a>.');
        }).then(function () {
          if (submitButton) submitButton.disabled = false;
        });
        return;
      }

      // No backend yet: hand the message to the visitor's email app.
      var lines = [
        data.message,
        '',
        '— ' + data.name,
        data.phone ? 'Phone: ' + data.phone : '',
        data.email ? 'Email: ' + data.email : ''
      ].filter(function (line, index) { return index < 3 || line; });

      var mailto = 'mailto:' + DEALER.email +
        '?subject=' + encodeURIComponent('Website inquiry from ' + data.name) +
        '&body=' + encodeURIComponent(lines.join('\n'));

      showStatus('info', 'Your email app should now open with your message ready to send. ' +
        'Nothing is sent until you press Send there. If nothing opened, email us at ' +
        '<a href="' + DEALER.emailHref + '">' + DEALER.email + '</a> or call ' +
        '<a href="' + DEALER.phoneHref + '">' + DEALER.phoneDisplay + '</a>.');

      window.location.href = mailto;
    });

    // Clear a field's error as soon as the visitor fixes it
    form.addEventListener('input', function (event) {
      var field = event.target;
      if (field.getAttribute && field.getAttribute('aria-invalid') === 'true' && field.value.trim()) {
        setError(field, '');
        if (field === fields.phone || field === fields.email) {
          setError(fields.phone, '');
          setError(fields.email, '');
        }
      }
    });
  }

  initNav();
  initHeader();
  initReveal();
  // app.js is loaded with `defer`, so DOMContentLoaded is still ahead of us and
  // fires only after every deferred script (including vehicles.js) has run.
  document.addEventListener('DOMContentLoaded', initContactForm);
})();
