/* ==========================================================================
   Cela Auto Sales LLC — inventory.js
   • Inventory page: search, filters, sorting, URL-synced state, results
   • Home page: "Featured Vehicles" strip
   Filtering and sorting are pure functions over normalized vehicles, so they
   keep working unchanged when the data source becomes a live database.
   ========================================================================== */
(function () {
  'use strict';

  var Cela = window.Cela;
  var V = window.CelaVehicles;
  if (!Cela || !V) return;

  var e = Cela.escapeHtml;
  var PAGE_SIZE = 24;
  var OLDEST_FILTER_YEAR = 1990;

  /* ------------------------------------------------------------------------
     Filter model
     ------------------------------------------------------------------------ */
  var DEFAULTS = {
    q: '',
    make: '',
    model: '',
    yearMin: '',
    yearMax: '',
    priceMin: '',
    priceMax: '',
    mileageMax: '',
    body: [],
    transmission: '',
    drivetrain: [],
    fuel: '',
    sort: 'newest'
  };

  var LIST_KEYS = ['body', 'drivetrain'];

  function num(value) {
    if (value === '' || value === null || value === undefined) return null;
    var n = Number(String(value).replace(/[^0-9.]/g, ''));
    return Number.isFinite(n) && String(value).trim() !== '' ? n : null;
  }

  function norm(value) {
    return String(value || '').trim().toLowerCase();
  }

  function haystack(v) {
    return [v.year, v.make, v.model, v.trim, v.bodyStyle, v.exteriorColor, v.engine,
      v.fuelType, v.drivetrain, v.transmission, v.stockNumber, v.vin]
      .concat(v.features).join(' ').toLowerCase();
  }

  /** Does vehicle `v` satisfy filters `f`? */
  function matches(v, f) {
    if (f.q) {
      var text = haystack(v);
      var tokens = norm(f.q).split(/\s+/).filter(Boolean);
      for (var i = 0; i < tokens.length; i++) {
        if (text.indexOf(tokens[i]) === -1) return false;
      }
    }
    if (f.make && norm(v.make) !== norm(f.make)) return false;
    if (f.model && norm(v.model) !== norm(f.model)) return false;

    var yearMin = num(f.yearMin);
    var yearMax = num(f.yearMax);
    if (yearMin !== null && (v.year === null || v.year < yearMin)) return false;
    if (yearMax !== null && (v.year === null || v.year > yearMax)) return false;

    var priceMin = num(f.priceMin);
    var priceMax = num(f.priceMax);
    if ((priceMin !== null || priceMax !== null) && v.price === null) return false;
    if (priceMin !== null && v.price < priceMin) return false;
    if (priceMax !== null && v.price > priceMax) return false;

    var mileageMax = num(f.mileageMax);
    if (mileageMax !== null && (v.mileage === null || v.mileage > mileageMax)) return false;

    if (f.body.length && f.body.indexOf(v.categories.bodyStyle) === -1) return false;
    if (f.transmission && v.categories.transmission !== f.transmission) return false;
    if (f.drivetrain.length && f.drivetrain.indexOf(v.categories.drivetrain) === -1) return false;
    if (f.fuel && v.categories.fuelType !== f.fuel) return false;
    return true;
  }

  function filterVehicles(list, filters) {
    return list.filter(function (v) { return matches(v, filters); });
  }

  function byNumber(key, direction) {
    return function (a, b) {
      var x = a[key];
      var y = b[key];
      if (x === null && y === null) return 0;
      if (x === null) return 1; // missing values always sort last
      if (y === null) return -1;
      return (x - y) * direction;
    };
  }

  function newestFirst(a, b) {
    return (V.timeOf(b.createdAt) || 0) - (V.timeOf(a.createdAt) || 0);
  }

  var SORTS = {
    newest: newestFirst,
    'price-asc': byNumber('price', 1),
    'price-desc': byNumber('price', -1),
    'mileage-asc': byNumber('mileage', 1),
    'year-desc': byNumber('year', -1),
    'year-asc': byNumber('year', 1)
  };

  /** Sort a copy; sold vehicles always follow the ones still for sale. */
  function sortVehicles(list, sortKey) {
    var compare = SORTS[sortKey] || SORTS.newest;
    var sorted = list.slice().sort(function (a, b) {
      return compare(a, b) || newestFirst(a, b);
    });
    return sorted.filter(function (v) { return v.status !== V.STATUS.SOLD; })
      .concat(sorted.filter(function (v) { return v.status === V.STATUS.SOLD; }));
  }

  /* ------------------------------------------------------------------------
     URL <-> filters (shareable links such as inventory.html?make=Ford)
     ------------------------------------------------------------------------ */
  function filtersFromQuery(search) {
    var params = new URLSearchParams(search);
    var f = cloneDefaults();
    Object.keys(DEFAULTS).forEach(function (key) {
      if (LIST_KEYS.indexOf(key) !== -1) {
        var raw = params.get(key);
        f[key] = raw ? raw.split(',').filter(Boolean) : [];
      } else if (params.has(key)) {
        f[key] = params.get(key) || '';
      }
    });
    if (!SORTS[f.sort]) f.sort = DEFAULTS.sort;
    return f;
  }

  function filtersToQuery(f) {
    var params = new URLSearchParams();
    Object.keys(DEFAULTS).forEach(function (key) {
      var value = f[key];
      if (LIST_KEYS.indexOf(key) !== -1) {
        if (value.length) params.set(key, value.join(','));
      } else if (value && value !== DEFAULTS[key]) {
        params.set(key, value);
      }
    });
    var query = params.toString();
    return query ? '?' + query : '';
  }

  function cloneDefaults() {
    var f = {};
    Object.keys(DEFAULTS).forEach(function (key) {
      f[key] = Array.isArray(DEFAULTS[key]) ? [] : DEFAULTS[key];
    });
    return f;
  }

  /* ------------------------------------------------------------------------
     Inventory page
     ------------------------------------------------------------------------ */
  function initInventoryPage(root) {
    var form = document.getElementById('inventory-filters');
    var results = root.querySelector('[data-results]');
    var countEl = root.querySelector('[data-results-count]');
    var chipsEl = root.querySelector('[data-active-filters]');
    var panel = document.getElementById('filter-panel');
    var backdrop = root.querySelector('[data-filters-backdrop]');
    var openButton = root.querySelector('[data-filters-open]');
    var badge = root.querySelector('[data-filter-count]');
    var applyButton = root.querySelector('[data-filters-apply]');
    if (!form || !results || !panel) return;

    var controls = {
      q: document.getElementById('filter-q'),
      make: document.getElementById('filter-make'),
      model: document.getElementById('filter-model'),
      yearMin: document.getElementById('filter-year-min'),
      yearMax: document.getElementById('filter-year-max'),
      priceMin: document.getElementById('filter-price-min'),
      priceMax: document.getElementById('filter-price-max'),
      mileageMax: document.getElementById('filter-mileage'),
      transmission: document.getElementById('filter-transmission'),
      fuel: document.getElementById('filter-fuel'),
      sort: document.getElementById('sort-by')
    };

    var all = [];
    var visibleCount = PAGE_SIZE;
    var loaded = false;

    /* ---------- read / write form ---------- */
    function checkedValues(name) {
      return Array.prototype.slice.call(form.querySelectorAll('input[name="' + name + '"]:checked'))
        .map(function (input) { return input.value; });
    }

    function readForm() {
      var f = cloneDefaults();
      Object.keys(controls).forEach(function (key) {
        if (controls[key]) f[key] = controls[key].value.trim();
      });
      f.priceMin = f.priceMin.replace(/[^0-9]/g, '');
      f.priceMax = f.priceMax.replace(/[^0-9]/g, '');
      f.body = checkedValues('body');
      f.drivetrain = checkedValues('drivetrain');
      return f;
    }

    function ensureOption(select, value, label) {
      if (!value) return;
      var exists = Array.prototype.some.call(select.options, function (o) { return o.value === value; });
      if (!exists) select.add(new Option(label || value, value));
    }

    function writeForm(f) {
      Object.keys(controls).forEach(function (key) {
        var control = controls[key];
        if (!control) return;
        if (control.tagName === 'SELECT') ensureOption(control, f[key]);
        control.value = f[key];
      });
      form.querySelectorAll('input[name="body"]').forEach(function (input) {
        input.checked = f.body.indexOf(input.value) !== -1;
      });
      form.querySelectorAll('input[name="drivetrain"]').forEach(function (input) {
        input.checked = f.drivetrain.indexOf(input.value) !== -1;
      });
    }

    /* ---------- dynamic options (makes, models, years) ---------- */
    function uniqueSorted(values) {
      var seen = {};
      return values.filter(function (value) {
        var key = norm(value);
        if (!value || seen[key]) return false;
        seen[key] = true;
        return true;
      }).sort(function (a, b) { return a.localeCompare(b); });
    }

    function fillSelect(select, placeholder, values, keepValue) {
      var current = keepValue !== undefined ? keepValue : select.value;
      select.innerHTML = '';
      select.add(new Option(placeholder, ''));
      values.forEach(function (value) { select.add(new Option(String(value), String(value))); });
      ensureOption(select, current);
      select.value = current;
    }

    function populateMakes() {
      fillSelect(controls.make, 'All Makes', uniqueSorted(all.map(function (v) { return v.make; })));
    }

    function populateModels(keepValue) {
      var make = controls.make.value;
      var models = make
        ? uniqueSorted(all.filter(function (v) { return norm(v.make) === norm(make); }).map(function (v) { return v.model; }))
        : [];
      fillSelect(controls.model, 'All Models', models, make ? keepValue : '');
      controls.model.disabled = !make;
    }

    function populateYears() {
      var years = all.map(function (v) { return v.year; }).filter(function (y) { return y !== null; });
      var newest = years.length ? Math.max.apply(null, years) : new Date().getFullYear() + 1;
      var oldest = years.length ? Math.min.apply(null, years) : OLDEST_FILTER_YEAR;
      var range = [];
      for (var y = newest; y >= oldest; y--) range.push(y);
      fillSelect(controls.yearMin, 'Any', range);
      fillSelect(controls.yearMax, 'Any', range);
    }

    /* ---------- rendering ---------- */
    function emptyInventoryHtml() {
      return '<div class="empty-state" role="status">' +
        '<div class="empty-state__icon">' + Cela.icon('car') + '</div>' +
        '<h2>No vehicles are currently listed online.</h2>' +
        '<p>Our inventory is being updated. Please contact Cela Auto Sales for current availability.</p>' +
        '<div class="btn-group">' + Cela.contactButtons() + '</div>' +
      '</div>';
    }

    function noMatchesHtml() {
      return '<div class="empty-state empty-state--compact" role="status">' +
        '<div class="empty-state__icon">' + Cela.icon('search') + '</div>' +
        '<h2>No vehicles match your search.</h2>' +
        '<p>Try removing a filter or two. Not seeing what you want? Call us — we’re happy to help you find it.</p>' +
        '<div class="btn-group">' +
          '<button type="button" class="btn btn--outline" data-clear-filters>Clear Filters</button>' +
          '<a class="btn btn--primary" href="' + Cela.DEALER.phoneHref + '">' + Cela.icon('phone') + 'Call ' + Cela.DEALER.phoneDisplay + '</a>' +
        '</div>' +
      '</div>';
    }

    function errorHtml() {
      return '<div class="empty-state" role="alert">' +
        '<div class="empty-state__icon">' + Cela.icon('alert') + '</div>' +
        '<h2>We couldn’t load our inventory right now.</h2>' +
        '<p>Please try again in a moment, or contact Cela Auto Sales for current availability.</p>' +
        '<div class="btn-group">' + Cela.contactButtons() + '</div>' +
      '</div>';
    }

    function describeActive(f) {
      var chips = [];
      function add(key, label, value) { chips.push({ key: key, label: label, value: value }); }
      if (f.q) add('q', 'Search: “' + f.q + '”');
      if (f.make) add('make', f.make);
      if (f.model) add('model', f.model);
      if (f.yearMin) add('yearMin', 'From ' + f.yearMin);
      if (f.yearMax) add('yearMax', 'Up to ' + f.yearMax);
      if (f.priceMin) add('priceMin', 'Min ' + V.formatPrice(Number(f.priceMin)));
      if (f.priceMax) add('priceMax', 'Max ' + V.formatPrice(Number(f.priceMax)));
      if (f.mileageMax) add('mileageMax', 'Under ' + Number(f.mileageMax).toLocaleString('en-US') + ' mi');
      f.body.forEach(function (b) { add('body', b, b); });
      if (f.transmission) add('transmission', f.transmission);
      f.drivetrain.forEach(function (d) { add('drivetrain', d, d); });
      if (f.fuel) add('fuel', f.fuel);
      return chips;
    }

    function renderChips(f) {
      if (!chipsEl) return;
      var chips = describeActive(f);
      if (!chips.length) {
        chipsEl.hidden = true;
        chipsEl.innerHTML = '';
        return;
      }
      chipsEl.hidden = false;
      chipsEl.innerHTML = chips.map(function (chip) {
        return '<li><button type="button" class="active-filter" data-remove-filter="' + e(chip.key) + '"' +
          (chip.value ? ' data-value="' + e(chip.value) + '"' : '') +
          ' aria-label="Remove filter: ' + e(chip.label) + '">' + e(chip.label) + Cela.icon('x') + '</button></li>';
      }).join('') + '<li><button type="button" class="clear-link" data-clear-filters>Clear all</button></li>';
    }

    function panelFilterCount(f) {
      return describeActive(f).filter(function (chip) { return chip.key !== 'q'; }).length;
    }

    function render(options) {
      var f = readForm();
      if (!(options && options.keepPage)) visibleCount = PAGE_SIZE;

      var matched = sortVehicles(filterVehicles(all, f), f.sort);
      var shown = matched.slice(0, visibleCount);

      if (all.length === 0) {
        results.innerHTML = emptyInventoryHtml();
      } else if (matched.length === 0) {
        results.innerHTML = noMatchesHtml();
      } else {
        results.innerHTML = shown.map(function (v) { return V.renderCard(v, { headingLevel: 2 }); }).join('') +
          (matched.length > shown.length
            ? '<div class="load-more" style="grid-column:1/-1"><button type="button" class="btn btn--outline" data-load-more>Show more vehicles</button></div>'
            : '');
      }

      var total = all.length;
      var word = function (n) { return n === 1 ? 'vehicle' : 'vehicles'; };
      if (countEl) {
        countEl.innerHTML = total === 0
          ? '<strong>0</strong> vehicles listed'
          : (matched.length === total
            ? '<strong>' + total + '</strong> ' + word(total)
            : 'Showing <strong>' + matched.length + '</strong> of ' + total + ' ' + word(total));
      }
      if (applyButton) {
        applyButton.textContent = total === 0 ? 'Show results' : 'Show ' + matched.length + ' ' + word(matched.length);
      }

      var activeCount = panelFilterCount(f);
      if (badge) {
        badge.textContent = String(activeCount);
        badge.hidden = activeCount === 0;
      }
      renderChips(f);

      var query = filtersToQuery(f);
      if (window.location.search !== query) {
        try {
          window.history.replaceState(null, '', window.location.pathname + query + window.location.hash);
        } catch (err) { /* file:// or sandboxed contexts can refuse this — harmless */ }
      }
    }

    function clearFilters() {
      var sort = controls.sort.value;
      writeForm(cloneDefaults());
      controls.sort.value = sort;
      populateModels('');
      render();
    }

    function removeFilter(key, value) {
      if (LIST_KEYS.indexOf(key) !== -1) {
        var input = form.querySelector('input[name="' + key + '"][value="' + (window.CSS && CSS.escape ? CSS.escape(value) : value) + '"]');
        if (input) input.checked = false;
      } else if (controls[key]) {
        controls[key].value = '';
        if (key === 'make') populateModels('');
      }
      render();
    }

    /* ---------- mobile filter drawer ---------- */
    var desktopQuery = window.matchMedia('(min-width: 960px)');
    var lastFocus = null;

    function drawerOpen() {
      return panel.classList.contains('is-open');
    }

    function openDrawer() {
      if (desktopQuery.matches) return;
      lastFocus = document.activeElement;
      panel.classList.add('is-open');
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-modal', 'true');
      if (backdrop) {
        backdrop.hidden = false;
        window.requestAnimationFrame(function () { backdrop.classList.add('is-visible'); });
      }
      document.body.classList.add('is-locked');
      if (openButton) openButton.setAttribute('aria-expanded', 'true');
      var closeButton = panel.querySelector('[data-filters-close]');
      window.setTimeout(function () { (closeButton || panel).focus(); }, 60);
    }

    function closeDrawer(restoreFocus) {
      if (!drawerOpen()) return;
      panel.classList.remove('is-open');
      panel.removeAttribute('role');
      panel.removeAttribute('aria-modal');
      if (backdrop) {
        backdrop.classList.remove('is-visible');
        window.setTimeout(function () { if (!drawerOpen()) backdrop.hidden = true; }, 300);
      }
      document.body.classList.remove('is-locked');
      if (openButton) openButton.setAttribute('aria-expanded', 'false');
      if (restoreFocus !== false && lastFocus && lastFocus.focus) lastFocus.focus();
    }

    function focusables() {
      return Array.prototype.slice.call(panel.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
      )).filter(function (el) { return el.offsetParent !== null; });
    }

    panel.addEventListener('keydown', function (event) {
      if (!drawerOpen()) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        closeDrawer();
      } else if (event.key === 'Tab') {
        var items = focusables();
        if (!items.length) return;
        var first = items[0];
        var last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    });

    if (openButton) openButton.addEventListener('click', openDrawer);
    if (backdrop) backdrop.addEventListener('click', function () { closeDrawer(); });
    root.querySelectorAll('[data-filters-close]').forEach(function (btn) {
      btn.addEventListener('click', function () { closeDrawer(); });
    });
    if (applyButton) {
      applyButton.addEventListener('click', function () {
        closeDrawer();
        var top = results.getBoundingClientRect().top + window.scrollY - 120;
        if (window.scrollY > top) window.scrollTo(0, Math.max(0, top));
      });
    }

    var onBreakpoint = function (event) { if (event.matches) closeDrawer(false); };
    if (desktopQuery.addEventListener) desktopQuery.addEventListener('change', onBreakpoint);
    else if (desktopQuery.addListener) desktopQuery.addListener(onBreakpoint);

    /* ---------- events ---------- */
    var typingTimer = null;

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      render();
    });

    // Search + sort live in the toolbar (form="inventory-filters"), outside the <form>
    // element, so their events don't bubble through it — listen on the section instead.
    root.addEventListener('input', function (event) {
      var target = event.target;
      if (target === controls.q || target === controls.priceMin || target === controls.priceMax) {
        window.clearTimeout(typingTimer);
        typingTimer = window.setTimeout(render, 250);
      }
    });

    root.addEventListener('change', function (event) {
      var target = event.target;
      if (target === controls.q || target === controls.priceMin || target === controls.priceMax) {
        window.clearTimeout(typingTimer);
      }
      if (target === controls.make) populateModels('');
      render();
    });

    form.addEventListener('reset', function (event) {
      event.preventDefault();
      clearFilters();
    });

    // Tidy price boxes into "15,000" once the visitor leaves the field
    [controls.priceMin, controls.priceMax].forEach(function (input) {
      if (!input) return;
      input.addEventListener('blur', function () {
        var digits = input.value.replace(/[^0-9]/g, '');
        input.value = digits ? Number(digits).toLocaleString('en-US') : '';
      });
    });

    root.addEventListener('click', function (event) {
      var target = event.target.closest('button');
      if (!target) return;
      // Buttons that re-render away get focus moved to the search box —
      // except inside the open mobile drawer, where focus must stay put.
      if (target.hasAttribute('data-clear-filters')) {
        clearFilters();
        if (!drawerOpen() && !document.body.contains(target) && controls.q) controls.q.focus();
      } else if (target.hasAttribute('data-remove-filter')) {
        removeFilter(target.getAttribute('data-remove-filter'), target.getAttribute('data-value'));
        if (controls.q) controls.q.focus();
      } else if (target.hasAttribute('data-load-more')) {
        visibleCount += PAGE_SIZE;
        render({ keepPage: true });
      }
    });

    /* ---------- load ---------- */
    var initial = filtersFromQuery(window.location.search);
    var slowTimer = window.setTimeout(function () {
      if (!loaded) {
        results.setAttribute('aria-busy', 'true');
        results.innerHTML = V.renderSkeletons(6);
      }
    }, 200);

    V.list().then(function (list) {
      all = list;
      loaded = true;
      window.clearTimeout(slowTimer);
      results.removeAttribute('aria-busy');
      populateMakes();
      populateYears();
      writeForm(initial);
      populateModels(initial.model);
      if (initial.priceMin) controls.priceMin.value = Number(initial.priceMin).toLocaleString('en-US');
      if (initial.priceMax) controls.priceMax.value = Number(initial.priceMax).toLocaleString('en-US');
      render();
    }).catch(function (err) {
      loaded = true;
      window.clearTimeout(slowTimer);
      results.removeAttribute('aria-busy');
      results.innerHTML = errorHtml();
      if (countEl) countEl.textContent = '';
      if (window.console) console.error('Inventory failed to load:', err);
    });
  }

  /* ------------------------------------------------------------------------
     Home page — featured vehicles
     ------------------------------------------------------------------------ */
  function initFeatured(el) {
    var limit = Number(el.getAttribute('data-limit')) || 3;

    function comingSoon() {
      el.innerHTML = '<div class="empty-state">' +
        '<div class="empty-state__icon">' + Cela.icon('car') + '</div>' +
        '<h3>Inventory Coming Soon</h3>' +
        '<p>Our inventory is currently being updated. Check back soon, or contact Cela Auto Sales for current vehicle availability.</p>' +
        '<div class="btn-group">' +
          '<a class="btn btn--primary" href="inventory.html">' + Cela.icon('car') + 'Browse Inventory</a>' +
          '<a class="btn btn--outline" href="' + Cela.DEALER.phoneHref + '">' + Cela.icon('phone') + 'Call ' + Cela.DEALER.phoneDisplay + '</a>' +
        '</div>' +
      '</div>';
    }

    V.list().then(function (list) {
      var forSale = list.filter(function (v) { return v.status !== V.STATUS.SOLD; });
      var featured = forSale.filter(function (v) { return v.featured; });
      var picks = sortVehicles(featured.length ? featured : forSale, 'newest').slice(0, limit);
      if (!picks.length) {
        comingSoon();
        return;
      }
      el.innerHTML = picks.map(function (v) { return V.renderCard(v, { headingLevel: 3 }); }).join('');
    }).catch(comingSoon);
  }

  var inventoryRoot = document.querySelector('[data-inventory]');
  if (inventoryRoot) initInventoryPage(inventoryRoot);

  document.querySelectorAll('[data-featured-vehicles]').forEach(initFeatured);

  window.CelaInventory = {
    DEFAULTS: DEFAULTS,
    filterVehicles: filterVehicles,
    sortVehicles: sortVehicles,
    filtersFromQuery: filtersFromQuery,
    filtersToQuery: filtersToQuery
  };
})();
