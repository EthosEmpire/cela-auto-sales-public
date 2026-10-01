/* ==========================================================================
   Cela Auto Sales LLC — vehicle-detail.js
   Renders vehicle.html?id=<vehicle id> from the vehicle data layer.
   With no id, or an id that isn't listed, the page shows a clear
   "Vehicle not found or no longer available." message.
   ========================================================================== */
(function () {
  'use strict';

  var Cela = window.Cela;
  var V = window.CelaVehicles;
  var page = document.querySelector('[data-vehicle-page]');
  if (!page || !Cela || !V) return;

  var e = Cela.escapeHtml;

  function $(selector) {
    return page.querySelector(selector);
  }

  function slot(name) {
    return page.querySelector('[data-slot="' + name + '"]');
  }

  function setMeta(selector, value) {
    var el = document.head.querySelector(selector);
    if (el) el.setAttribute('content', value);
  }

  function setState(state) {
    page.setAttribute('data-state', state);
  }

  function showNotFound() {
    setState('not-found');
    document.title = 'Vehicle Not Found | Cela Auto Sales LLC';
    var robots = document.createElement('meta');
    robots.name = 'robots';
    robots.content = 'noindex';
    document.head.appendChild(robots);
  }

  /* ------------------------------------------------------------------------
     Gallery + full-screen viewer
     ------------------------------------------------------------------------ */
  function initGallery(photos) {
    var gallery = $('[data-gallery]');
    var stage = $('[data-gallery-stage]');
    var main = $('[data-gallery-main]');
    var placeholder = $('[data-gallery-placeholder]');
    var thumbs = $('[data-gallery-thumbs]');
    var counter = $('[data-gallery-counter]');
    var prev = $('[data-gallery-prev]');
    var next = $('[data-gallery-next]');
    var expand = $('[data-gallery-expand]');
    var lightbox = document.querySelector('[data-lightbox]');
    var count = photos.length;
    var index = 0;

    if (!count) {
      main.hidden = true;
      placeholder.hidden = false;
      placeholder.innerHTML = V.placeholderHtml('Photos coming soon');
      [prev, next, counter, expand, thumbs].forEach(function (el) { if (el) el.hidden = true; });
      return;
    }

    main.hidden = false;
    placeholder.hidden = true;

    var multiple = count > 1;
    [prev, next, thumbs].forEach(function (el) { if (el) el.hidden = !multiple; });

    if (multiple) {
      thumbs.innerHTML = photos.map(function (photo, i) {
        return '<li><button type="button" class="gallery__thumb" data-index="' + i + '" aria-label="Show photo ' + (i + 1) + ' of ' + count + '">' +
          '<img src="' + e(photo.thumb || photo.url) + '" alt="" width="160" height="120" loading="lazy" decoding="async"></button></li>';
      }).join('');
    }

    var lightboxImg = lightbox && lightbox.querySelector('[data-lightbox-img]');
    var lightboxCounter = lightbox && lightbox.querySelector('[data-lightbox-counter]');

    function preload(i) {
      var img = new Image();
      img.src = photos[(i + count) % count].url;
    }

    function show(i) {
      index = (i + count) % count;
      var photo = photos[index];
      main.src = photo.url;
      main.alt = photo.alt;
      counter.textContent = (index + 1) + ' / ' + count;
      if (lightboxImg && lightbox.open) {
        lightboxImg.src = photo.url;
        lightboxImg.alt = photo.alt;
        lightboxCounter.textContent = 'Photo ' + (index + 1) + ' of ' + count;
      }
      if (multiple) {
        var buttons = thumbs.querySelectorAll('.gallery__thumb');
        buttons.forEach(function (btn, n) {
          if (n === index) btn.setAttribute('aria-current', 'true');
          else btn.removeAttribute('aria-current');
        });
        var active = buttons[index];
        if (active) {
          var left = active.offsetLeft - (thumbs.clientWidth - active.offsetWidth) / 2;
          thumbs.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
        }
        preload(index + 1);
      }
    }

    if (prev) prev.addEventListener('click', function () { show(index - 1); });
    if (next) next.addEventListener('click', function () { show(index + 1); });

    if (multiple) {
      thumbs.addEventListener('click', function (event) {
        var btn = event.target.closest('.gallery__thumb');
        if (btn) show(Number(btn.getAttribute('data-index')));
      });
    }

    gallery.addEventListener('keydown', function (event) {
      if (!multiple) return;
      if (event.key === 'ArrowLeft') { event.preventDefault(); show(index - 1); }
      if (event.key === 'ArrowRight') { event.preventDefault(); show(index + 1); }
    });

    // Swipe on touch screens
    var startX = null;
    var startY = null;
    stage.addEventListener('touchstart', function (event) {
      startX = event.touches[0].clientX;
      startY = event.touches[0].clientY;
    }, { passive: true });
    stage.addEventListener('touchend', function (event) {
      if (startX === null || !multiple) return;
      var dx = event.changedTouches[0].clientX - startX;
      var dy = event.changedTouches[0].clientY - startY;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) show(index + (dx < 0 ? 1 : -1));
      startX = null;
    }, { passive: true });

    // Full-screen viewer (native <dialog>: focus handling + Escape built in)
    if (lightbox && typeof lightbox.showModal === 'function' && expand) {
      var lbPrev = lightbox.querySelector('[data-lightbox-prev]');
      var lbNext = lightbox.querySelector('[data-lightbox-next]');
      [lbPrev, lbNext].forEach(function (el) { if (el) el.hidden = !multiple; });

      expand.addEventListener('click', function () {
        lightbox.showModal();
        document.body.classList.add('is-locked');
        show(index);
      });
      main.addEventListener('click', function () { expand.click(); });
      main.style.cursor = 'zoom-in';

      lightbox.querySelector('[data-lightbox-close]').addEventListener('click', function () { lightbox.close(); });
      if (lbPrev) lbPrev.addEventListener('click', function () { show(index - 1); });
      if (lbNext) lbNext.addEventListener('click', function () { show(index + 1); });
      lightbox.addEventListener('keydown', function (event) {
        if (!multiple) return;
        if (event.key === 'ArrowLeft') show(index - 1);
        if (event.key === 'ArrowRight') show(index + 1);
      });
      lightbox.addEventListener('click', function (event) {
        if (event.target === lightbox || event.target.classList.contains('lightbox__inner')) lightbox.close();
      });
      lightbox.addEventListener('close', function () {
        document.body.classList.remove('is-locked');
      });
    } else if (expand) {
      expand.hidden = true;
    }

    main.setAttribute('fetchpriority', 'high');
    show(0);
  }

  /* ------------------------------------------------------------------------
     Page content
     ------------------------------------------------------------------------ */
  /** rows: [label, value, wide?] — empty values are skipped */
  function specRows(rows) {
    return rows.filter(function (row) { return row[1] !== '' && row[1] !== null && row[1] !== undefined; })
      .map(function (row) {
        return '<div' + (row[2] ? ' class="spec-table__wide"' : '') + '><dt>' + e(row[0]) + '</dt><dd>' + e(row[1]) + '</dd></div>';
      }).join('');
  }

  function renderStructuredData(v) {
    var offerAvailability = {
      AVAILABLE: 'https://schema.org/InStock',
      PENDING: 'https://schema.org/LimitedAvailability',
      SOLD: 'https://schema.org/SoldOut'
    }[v.status];

    var data = {
      '@context': 'https://schema.org',
      '@type': 'Car',
      name: V.fullTitle(v),
      itemCondition: 'https://schema.org/UsedCondition',
      url: window.location.href
    };
    if (v.make) data.brand = { '@type': 'Brand', name: v.make };
    if (v.model) data.model = v.model;
    if (v.year) data.vehicleModelDate = String(v.year);
    if (v.vin) data.vehicleIdentificationNumber = v.vin;
    if (v.bodyStyle) data.bodyType = v.bodyStyle;
    if (v.exteriorColor) data.color = v.exteriorColor;
    if (v.interiorColor) data.vehicleInteriorColor = v.interiorColor;
    if (v.transmission) data.vehicleTransmission = v.transmission;
    if (v.drivetrain) data.driveWheelConfiguration = v.drivetrain;
    if (v.fuelType) data.fuelType = v.fuelType;
    if (v.engine) data.vehicleEngine = { '@type': 'EngineSpecification', name: v.engine };
    if (v.mileage !== null) data.mileageFromOdometer = { '@type': 'QuantitativeValue', value: v.mileage, unitCode: 'SMI' };
    if (v.description) data.description = v.description;
    if (v.photos.length) {
      data.image = v.photos.map(function (p) { return new URL(p.url, window.location.href).href; });
    }
    if (v.price !== null) {
      data.offers = {
        '@type': 'Offer',
        price: v.price,
        priceCurrency: 'USD',
        availability: offerAvailability,
        seller: { '@type': 'AutoDealer', name: Cela.DEALER.name, telephone: '+1-208-713-1487' }
      };
    }

    var script = document.createElement('script');
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify(data);
    document.head.appendChild(script);
  }

  function render(v) {
    var title = V.title(v);
    var full = V.fullTitle(v);
    var meta = V.statusMeta(v);

    page.setAttribute('data-status', v.status);
    slot('crumb').textContent = full;
    slot('title').textContent = title;
    var trim = slot('trim');
    trim.textContent = v.trim;
    trim.hidden = !v.trim;
    slot('price').innerHTML = V.priceHtml(v); // values are escaped inside priceHtml()
    slot('status-badge').innerHTML = V.statusBadge(v);

    // Pending / sold notices
    var notice = slot('status-notice');
    if (v.status === V.STATUS.PENDING) {
      notice.className = 'status-notice status-notice--pending';
      notice.innerHTML = Cela.icon('info') + '<span>Sale pending. This vehicle has a sale in progress — call us to check its status or ask about similar vehicles.</span>';
      notice.hidden = false;
    } else if (v.status === V.STATUS.SOLD) {
      notice.className = 'status-notice status-notice--sold';
      notice.innerHTML = Cela.icon('info') + '<span>This vehicle has been sold. Browse our current inventory or call us — we may be able to help you find something similar.</span>';
      notice.hidden = false;
    }

    // Key specs
    var keySpecs = specRows([
      ['Mileage', V.formatMileage(v.mileage)],
      ['Transmission', v.transmission],
      ['Drivetrain', v.drivetrain],
      ['Fuel Type', v.fuelType]
    ]);
    var keyEl = slot('key-specs');
    keyEl.innerHTML = keySpecs;
    keyEl.hidden = !keySpecs;

    // Full specifications
    slot('specs').innerHTML = specRows([
      ['Year', v.year ? String(v.year) : ''],
      ['Make', v.make],
      ['Model', v.model],
      ['Trim', v.trim],
      ['Body Style', v.bodyStyle],
      ['Mileage', V.formatMileage(v.mileage)],
      ['Exterior Color', v.exteriorColor],
      ['Interior Color', v.interiorColor],
      ['Engine', v.engine],
      ['Transmission', v.transmission],
      ['Drivetrain', v.drivetrain],
      ['Fuel Type', v.fuelType],
      ['Doors', v.doors !== null && v.doors !== undefined ? String(v.doors) : ''],
      ['Seats', v.seats !== null && v.seats !== undefined ? String(v.seats) : ''],
      ['Stock Number', v.stockNumber],
      ['Availability', meta.label],
      ['Date Added', V.formatDate(v.createdAt)],
      ['VIN', v.vin, true]
    ]);

    var description = slot('description');
    description.textContent = v.description;
    $('[data-block="description"]').hidden = !v.description;

    var features = slot('features');
    features.innerHTML = v.features.map(function (f) {
      return '<li>' + Cela.icon('check') + '<span>' + e(f) + '</span></li>';
    }).join('');
    $('[data-block="features"]').hidden = !v.features.length;

    var contactHref = 'contact.html?vehicle=' + encodeURIComponent(v.id);
    page.querySelectorAll('[data-contact-link]').forEach(function (a) { a.href = contactHref; });

    initGallery(v.photos);
    initShare(full);

    // Sticky call bar on phones
    var mobileCta = document.querySelector('[data-mobile-cta]');
    if (mobileCta) {
      mobileCta.hidden = false;
      document.body.classList.add('has-mobile-cta');
    }

    // Page metadata
    var summary = [V.formatPrice(v.price), V.formatMileage(v.mileage)].filter(Boolean).join(', ');
    var pageTitle = full + ' | Cela Auto Sales LLC';
    var description160 = full + ' at Cela Auto Sales LLC in Nampa, Idaho' + (summary ? ' — ' + summary : '') + '. Call (208) 713-1487.';
    document.title = pageTitle;
    setMeta('meta[name="description"]', description160);
    setMeta('meta[property="og:title"]', pageTitle);
    setMeta('meta[property="og:description"]', description160);
    if (v.photos.length) setMeta('meta[property="og:image"]', new URL(v.photos[0].url, window.location.href).href);
    renderStructuredData(v);

    setState('found');
  }

  function initShare(full) {
    var button = $('[data-share]');
    var feedback = $('[data-share-feedback]');
    if (!button) return;

    function say(message) {
      if (!feedback) return;
      feedback.textContent = message;
      window.setTimeout(function () { feedback.textContent = ''; }, 4000);
    }

    button.addEventListener('click', function () {
      var url = window.location.href;
      if (navigator.share) {
        navigator.share({ title: full + ' | Cela Auto Sales', url: url }).catch(function () { /* cancelled */ });
        return;
      }
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(url).then(function () {
          say('Link copied — paste it anywhere to share this vehicle.');
        }, function () {
          window.prompt('Copy this link to share:', url);
        });
        return;
      }
      window.prompt('Copy this link to share:', url);
    });
  }

  /* ------------------------------------------------------------------------
     Load
     ------------------------------------------------------------------------ */
  var id = new URLSearchParams(window.location.search).get('id');
  if (!id) {
    showNotFound();
    return;
  }

  V.get(id).then(function (vehicle) {
    if (vehicle) render(vehicle);
    else showNotFound();
  }).catch(function (err) {
    showNotFound();
    if (window.console) console.error('Vehicle failed to load:', err);
  });
})();
