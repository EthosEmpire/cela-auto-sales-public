/* ==========================================================================
   Cela Auto Sales LLC — vehicles.js
   The vehicle data layer. Everything that knows the *shape* of a vehicle or
   *where vehicles come from* lives here, so pages never touch raw data.

   Pages call:
     CelaVehicles.list()   -> Promise<Vehicle[]>   publicly listed vehicles
     CelaVehicles.get(id)  -> Promise<Vehicle|null> one vehicle (not archived)

   LIVE DATA:
     js/supabase-source.js calls CelaVehicles.setSource(...) with a source that
     reads the customer-safe Supabase views. If that file is not loaded, the
     built-in empty `localSource` below is used. Rows may use snake_case
     columns (stock_number, created_at, …) — normalizeVehicle() accepts both.
     Only the public "publishable" key is ever used in the browser, protected
     by Row Level Security. Never put service-role keys or passwords here.
   ========================================================================== */
(function () {
  'use strict';

  var Cela = window.Cela;

  /**
   * @typedef {'AVAILABLE'|'PENDING'|'SOLD'|'ARCHIVED'} VehicleStatus
   *
   * @typedef {Object} VehiclePhoto
   * @property {string} url    Public image URL (first photo = main photo)
   * @property {string} [alt]  Optional description; generated if missing
   *
   * @typedef {Object} Vehicle
   * @property {string}  id
   * @property {string}  stockNumber
   * @property {string}  vin
   * @property {number}  year
   * @property {string}  make
   * @property {string}  model
   * @property {string}  trim
   * @property {?number} price          asking price (sale price when one is set); null = "Call for Price"
   * @property {?number} originalPrice  retail price, only when a lower sale price is active
   * @property {?number} mileage
   * @property {string}  bodyStyle      Sedan, SUV, Truck, Coupe, Van, Wagon, Convertible, …
   * @property {string}  transmission   Automatic, Manual, …
   * @property {string}  drivetrain     FWD, RWD, AWD, 4WD
   * @property {string}  engine
   * @property {string}  fuelType       Gasoline, Diesel, Hybrid, Electric, …
   * @property {string}  exteriorColor
   * @property {string}  interiorColor
   * @property {string}  description
   * @property {string[]} features
   * @property {Array<string|VehiclePhoto>} photos
   * @property {VehicleStatus} status
   * @property {boolean} [featured]     Show on the home page when true
   * @property {string}  createdAt      ISO date
   * @property {string}  [updatedAt]    ISO date
   * @property {string}  [soldAt]       ISO date — set when status becomes SOLD
   */

  /* ------------------------------------------------------------------------
     Local inventory.
     Intentionally empty: no vehicles are listed online yet. Do not add
     sample or placeholder vehicles here — the public site shows exactly
     what this list (or the live database later) contains.
     ------------------------------------------------------------------------ */
  var vehicles = [];

  var STATUS = Object.freeze({
    AVAILABLE: 'AVAILABLE',
    PENDING: 'PENDING',
    SOLD: 'SOLD',
    ARCHIVED: 'ARCHIVED'
  });

  var STATUS_META = {
    AVAILABLE: { label: 'Available', tone: 'available' },
    PENDING: { label: 'Sale Pending', tone: 'pending' },
    SOLD: { label: 'Sold', tone: 'sold' },
    ARCHIVED: { label: 'Archived', tone: 'archived' }
  };

  /* ------------------------------------------------------------------------
     Display rules.
     soldVisibleHours: how long a SOLD vehicle stays in the public inventory
     (with a SOLD label) after its soldAt time. 0 hides sold vehicles at once.
     The database view `public_inventory` enforces the same 2-hour window, so
     both layers agree.
     ------------------------------------------------------------------------ */
  var DISPLAY_RULES = {
    soldVisibleHours: 2
  };

  var HOUR_MS = 60 * 60 * 1000;

  /* ------------------------------------------------------------------------
     Category matching for filters. Free-text values from the database are
     mapped onto the fixed filter options; anything unknown becomes "Other".
     ------------------------------------------------------------------------ */
  var CATEGORY_RULES = {
    bodyStyle: [
      ['Sedan', /sedan|saloon/i],
      ['SUV', /suv|crossover|sport utility/i],
      ['Truck', /truck|pickup|pick-up/i],
      ['Coupe', /coupe|coupé/i],
      ['Van', /van|minivan/i],
      ['Wagon', /wagon|estate/i],
      ['Convertible', /convertible|cabrio|roadster|spyder|spider/i]
    ],
    transmission: [
      ['Automatic', /auto|cvt|dct|dual.?clutch/i],
      ['Manual', /manual|stick|standard/i]
    ],
    drivetrain: [
      ['AWD', /awd|all.?wheel/i],
      ['4WD', /4wd|4x4|four.?wheel/i],
      ['FWD', /fwd|front.?wheel/i],
      ['RWD', /rwd|rear.?wheel/i]
    ],
    fuelType: [
      ['Hybrid', /hybrid|phev/i],
      ['Electric', /electric|\bev\b|battery/i],
      ['Diesel', /diesel/i],
      ['Gasoline', /gas|petrol|unleaded|flex/i]
    ]
  };

  function category(field, value) {
    if (!value) return '';
    var rules = CATEGORY_RULES[field] || [];
    for (var i = 0; i < rules.length; i++) {
      if (rules[i][1].test(value)) return rules[i][0];
    }
    return 'Other';
  }

  /* ------------------------------------------------------------------------
     Normalization — accepts camelCase or snake_case rows
     ------------------------------------------------------------------------ */
  function pick(raw, camel, snake) {
    return raw[camel] !== undefined ? raw[camel] : raw[snake];
  }

  function toText(value) {
    return value === null || value === undefined ? '' : String(value).trim();
  }

  function toNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    var n = typeof value === 'number' ? value : Number(String(value).replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(n) ? n : null;
  }

  function toList(value) {
    if (Array.isArray(value)) return value.map(toText).filter(Boolean);
    if (typeof value === 'string') return value.split(/\r?\n|;|,/).map(toText).filter(Boolean);
    return [];
  }

  function timeOf(value) {
    if (!value) return null;
    var t = new Date(value).getTime();
    return Number.isFinite(t) ? t : null;
  }

  function normalizeStatus(value) {
    var s = toText(value).toUpperCase();
    if (!s) return STATUS.AVAILABLE;
    return STATUS[s] || STATUS.ARCHIVED; // unknown statuses stay hidden
  }

  function vehicleTitle(v) {
    return [v.year, v.make, v.model].filter(Boolean).join(' ') || 'Vehicle';
  }

  function fullTitle(v) {
    return [vehicleTitle(v), v.trim].filter(Boolean).join(' ');
  }

  function normalizePhotos(list, v) {
    var photos = Array.isArray(list) ? list : [];
    var out = [];
    photos.forEach(function (p) {
      var url = typeof p === 'string' ? p : (p && (p.url || p.src || p.publicUrl || p.public_url));
      var safe = Cela.safeUrl(url);
      if (!safe) return;
      var alt = p && typeof p === 'object' && p.alt ? toText(p.alt) : '';
      var thumb = p && typeof p === 'object' ? Cela.safeUrl(p.thumb || p.thumbUrl || p.thumb_url) : '';
      out.push({ url: safe, thumb: thumb || safe, alt: alt || fullTitle(v) + ' — photo ' + (out.length + 1) });
    });
    return out;
  }

  /** Turn any raw row into a clean Vehicle object (or null if unusable). */
  function normalizeVehicle(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var id = toText(raw.id);
    if (!id) return null;

    var v = {
      id: id,
      stockNumber: toText(pick(raw, 'stockNumber', 'stock_number')),
      vin: toText(raw.vin).toUpperCase(),
      year: toNumber(raw.year),
      make: toText(raw.make),
      model: toText(raw.model),
      trim: toText(raw.trim),
      price: toNumber(raw.price),
      mileage: toNumber(raw.mileage),
      bodyStyle: toText(pick(raw, 'bodyStyle', 'body_style')),
      transmission: toText(raw.transmission),
      drivetrain: toText(raw.drivetrain),
      engine: toText(raw.engine),
      fuelType: toText(pick(raw, 'fuelType', 'fuel_type')),
      exteriorColor: toText(pick(raw, 'exteriorColor', 'exterior_color')),
      interiorColor: toText(pick(raw, 'interiorColor', 'interior_color')),
      doors: toNumber(raw.doors),
      seats: toNumber(raw.seats),
      description: toText(raw.description),
      features: toList(raw.features),
      status: normalizeStatus(raw.status),
      featured: Boolean(raw.featured),
      createdAt: toText(pick(raw, 'createdAt', 'created_at')),
      updatedAt: toText(pick(raw, 'updatedAt', 'updated_at')),
      soldAt: toText(pick(raw, 'soldAt', 'sold_at'))
    };
    if (v.price !== null && v.price <= 0) v.price = null;
    // Sale price: customers see (and filter/sort by) the sale price; the retail
    // price is kept only to show it crossed out.
    var salePrice = toNumber(pick(raw, 'salePrice', 'sale_price'));
    v.originalPrice = null;
    if (salePrice !== null && salePrice > 0 && v.price !== null && salePrice < v.price) {
      v.originalPrice = v.price;
      v.price = salePrice;
    }
    v.photos = normalizePhotos(raw.photos, v);
    v.categories = {
      bodyStyle: category('bodyStyle', v.bodyStyle),
      transmission: category('transmission', v.transmission),
      drivetrain: category('drivetrain', v.drivetrain),
      fuelType: category('fuelType', v.fuelType)
    };
    return v;
  }

  /** Should this vehicle appear in the public inventory right now? */
  function isListed(v, now) {
    if (!v) return false;
    if (v.status === STATUS.ARCHIVED) return false;
    if (v.status === STATUS.SOLD) {
      if (!(DISPLAY_RULES.soldVisibleHours > 0)) return false;
      var soldTime = timeOf(v.soldAt) || timeOf(v.updatedAt);
      if (soldTime === null) return false;
      return (now || Date.now()) - soldTime <= DISPLAY_RULES.soldVisibleHours * HOUR_MS;
    }
    return true;
  }

  /* ------------------------------------------------------------------------
     Data sources. Each source returns raw rows; normalization happens here.
     ------------------------------------------------------------------------ */
  var localSource = {
    list: function () {
      return Promise.resolve(vehicles);
    },
    get: function (id) {
      return Promise.resolve(vehicles.find(function (v) { return String(v.id) === String(id); }) || null);
    }
  };

  /*
   * Example — a future Supabase source (not active):
   *
   * var supabaseSource = {
   *   list: async function () {
   *     var res = await supabase.from('vehicles').select('*')
   *       .neq('status', 'ARCHIVED').order('created_at', { ascending: false });
   *     if (res.error) throw res.error;
   *     return res.data;
   *   },
   *   get: async function (id) {
   *     var res = await supabase.from('vehicles').select('*').eq('id', id).maybeSingle();
   *     if (res.error) throw res.error;
   *     return res.data;
   *   }
   * };
   * CelaVehicles.setSource(supabaseSource);
   */

  var source = localSource;

  function setSource(newSource) {
    if (!newSource || typeof newSource.list !== 'function' || typeof newSource.get !== 'function') {
      throw new Error('A vehicle source needs list() and get() functions.');
    }
    source = newSource;
  }

  function list() {
    return Promise.resolve(source.list()).then(function (rows) {
      var now = Date.now();
      return (Array.isArray(rows) ? rows : [])
        .map(normalizeVehicle)
        .filter(function (v) { return isListed(v, now); });
    });
  }

  /** A single vehicle for its detail page. Sold vehicles stay viewable (marked SOLD); archived ones do not. */
  function get(id) {
    if (!toText(id)) return Promise.resolve(null);
    return Promise.resolve(source.get(id)).then(function (raw) {
      var v = normalizeVehicle(raw);
      return v && v.status !== STATUS.ARCHIVED ? v : null;
    });
  }

  /* ------------------------------------------------------------------------
     Formatting
     ------------------------------------------------------------------------ */
  var priceFormat = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  var numberFormat = new Intl.NumberFormat('en-US');

  function formatPrice(price) {
    return price === null || price === undefined ? 'Call for Price' : priceFormat.format(price);
  }

  function formatMileage(mileage) {
    return mileage === null || mileage === undefined ? '' : numberFormat.format(mileage) + ' miles';
  }

  /** Price markup: the asking price, plus the crossed-out retail price during a sale. */
  function priceHtml(v) {
    var e = Cela.escapeHtml;
    return e(formatPrice(v.price)) + (v.originalPrice !== null && v.originalPrice !== undefined
      ? ' <s class="price-was"><span class="visually-hidden">was </span>' + e(formatPrice(v.originalPrice)) + '</s>'
      : '');
  }

  function formatDate(value) {
    var t = timeOf(value);
    if (t === null) return '';
    return new Date(t).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  function vehicleUrl(v) {
    return 'vehicle.html?id=' + encodeURIComponent(v.id);
  }

  function statusMeta(v) {
    return STATUS_META[v.status] || STATUS_META.AVAILABLE;
  }

  function statusBadge(v, extraClass) {
    var meta = statusMeta(v);
    return '<span class="status status--' + meta.tone + (extraClass ? ' ' + extraClass : '') + '">' + meta.label + '</span>';
  }

  function placeholderHtml(label) {
    return '<div class="media-placeholder">' +
      '<img src="images/logo/cela-logo.png" alt="" width="632" height="313" loading="lazy" decoding="async">' +
      '<span>' + Cela.escapeHtml(label || 'Photos coming soon') + '</span></div>';
  }

  /* ------------------------------------------------------------------------
     Vehicle card (inventory results + home featured)
     ------------------------------------------------------------------------ */
  function renderCard(v, options) {
    var e = Cela.escapeHtml;
    var headingLevel = (options && options.headingLevel) || 3;
    var meta = statusMeta(v);
    var photo = v.photos[0];
    var specs = [formatMileage(v.mileage), v.transmission, v.drivetrain].filter(Boolean);

    return '' +
      '<article class="vehicle-card vehicle-card--' + meta.tone + '">' +
        '<div class="vehicle-card__media">' +
          (photo
            ? '<img src="' + e(photo.thumb || photo.url) + '" alt="' + e(photo.alt) + '" width="800" height="600" loading="lazy" decoding="async">'
            : placeholderHtml()) +
          statusBadge(v, 'vehicle-card__status') +
          (v.photos.length > 1
            ? '<span class="vehicle-card__count">' + Cela.icon('camera') + v.photos.length + '<span class="visually-hidden"> photos</span></span>'
            : '') +
        '</div>' +
        '<div class="vehicle-card__body">' +
          '<h' + headingLevel + ' class="vehicle-card__title">' + e(vehicleTitle(v)) + '</h' + headingLevel + '>' +
          (v.trim ? '<p class="vehicle-card__trim">' + e(v.trim) + '</p>' : '') +
          '<p class="vehicle-card__price">' + priceHtml(v) + '</p>' +
          (specs.length ? '<ul class="vehicle-card__specs">' + specs.map(function (s) { return '<li>' + e(s) + '</li>'; }).join('') + '</ul>' : '') +
          '<div class="vehicle-card__footer">' +
            '<span class="vehicle-card__stock">' + (v.stockNumber ? 'Stock #' + e(v.stockNumber) : '') + '</span>' +
            '<a class="btn btn--primary btn--sm vehicle-card__link" href="' + e(vehicleUrl(v)) + '" aria-label="View details for ' + e(fullTitle(v)) + '">View Details</a>' +
          '</div>' +
        '</div>' +
      '</article>';
  }

  function renderSkeletons(count) {
    var html = '';
    for (var i = 0; i < (count || 3); i++) {
      html += '<div class="skeleton-card" aria-hidden="true"><div class="skeleton-card__media"></div>' +
        '<div class="skeleton-card__line"></div><div class="skeleton-card__line"></div></div>';
    }
    return html;
  }

  window.CelaVehicles = {
    STATUS: STATUS,
    STATUS_META: STATUS_META,
    DISPLAY_RULES: DISPLAY_RULES,
    list: list,
    get: get,
    setSource: setSource,
    normalizeVehicle: normalizeVehicle,
    isListed: isListed,
    timeOf: timeOf,
    title: vehicleTitle,
    fullTitle: fullTitle,
    url: vehicleUrl,
    formatPrice: formatPrice,
    priceHtml: priceHtml,
    formatMileage: formatMileage,
    formatDate: formatDate,
    statusMeta: statusMeta,
    statusBadge: statusBadge,
    placeholderHtml: placeholderHtml,
    renderCard: renderCard,
    renderSkeletons: renderSkeletons
  };
})();
