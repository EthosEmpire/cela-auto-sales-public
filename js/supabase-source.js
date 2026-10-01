/* ==========================================================================
   Cela Auto Sales — live inventory source (Supabase)
   --------------------------------------------------------------------------
   Plugs into the existing data layer:  CelaVehicles.setSource({ list, get })

   Reads ONLY the customer-safe database views:
     public_inventory        published vehicles (Available, Sale Pending, and
                             Sold for ~2 hours) with allowlisted columns
     public_vehicle_photos   photo paths for those vehicles
   Photos come from a private bucket through short-lived signed links, and
   only the display/thumbnail copies of visible vehicles can be signed.

   Uses the public (publishable) key only. No employee sign-in, no private
   tables, no writes. If this file or the config is missing, the site falls
   back to its built-in empty inventory.
   ========================================================================== */
(function () {
  'use strict';

  var cfg = window.CELA_SUPABASE;
  var V = window.CelaVehicles;
  if (!V || !cfg || !cfg.url || !cfg.publishableKey) return;

  /* Explicit column allowlist — never "select=*". */
  var COLUMNS = [
    'id', 'stock_number', 'vin', 'year', 'make', 'model', 'trim', 'price', 'sale_price', 'mileage',
    'body_style', 'transmission', 'drivetrain', 'engine', 'fuel_type', 'exterior_color', 'interior_color',
    'doors', 'seats', 'description', 'features', 'status', 'featured', 'created_at', 'updated_at', 'sold_at'
  ].join(',');
  var PHOTO_COLUMNS = 'vehicle_id,display_path,thumb_path,sort_order,is_cover';
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  var headers = { apikey: cfg.publishableKey, Authorization: 'Bearer ' + cfg.publishableKey };

  function rest(path) {
    return fetch(cfg.url + '/rest/v1/' + path, { headers: headers }).then(function (response) {
      if (!response.ok) throw new Error('Inventory request failed (' + response.status + ')');
      return response.json();
    });
  }

  /** Signed links for many storage paths in one request. Returns { path: url }. */
  function sign(paths) {
    if (!paths.length) return Promise.resolve({});
    return fetch(cfg.url + '/storage/v1/object/sign/' + encodeURIComponent(cfg.photoBucket), {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
      body: JSON.stringify({ expiresIn: cfg.signedUrlSeconds || 3600, paths: paths })
    }).then(function (response) {
      if (!response.ok) return [];
      return response.json();
    }).then(function (entries) {
      var urls = {};
      (Array.isArray(entries) ? entries : []).forEach(function (entry) {
        if (entry && entry.signedURL && !entry.error) urls[entry.path] = cfg.url + '/storage/v1' + entry.signedURL;
      });
      return urls;
    }).catch(function () { return {}; }); // photos are optional; listings still show
  }

  /** Cover photo first, then the dealership's chosen order. */
  function orderPhotos(rows) {
    return rows.slice().sort(function (a, b) {
      if (a.is_cover !== b.is_cover) return a.is_cover ? -1 : 1;
      return a.sort_order - b.sort_order;
    });
  }

  /**
   * Attach photos to vehicle rows.
   * full = true  → vehicle page: large images + thumbnails
   * full = false → lists: thumbnails only (fast)
   */
  function withPhotos(rows, full) {
    if (!rows.length) return Promise.resolve(rows);
    var ids = rows.map(function (row) { return row.id; }).join(',');
    return rest('public_vehicle_photos?select=' + PHOTO_COLUMNS + '&vehicle_id=in.(' + ids + ')').then(function (photos) {
      var paths = [];
      photos.forEach(function (p) {
        paths.push(p.thumb_path);
        if (full) paths.push(p.display_path);
      });
      return sign(paths).then(function (urls) {
        return rows.map(function (row) {
          var mine = orderPhotos(photos.filter(function (p) { return p.vehicle_id === row.id; }));
          row.photos = mine.map(function (p) {
            var thumb = urls[p.thumb_path] || '';
            var large = full ? (urls[p.display_path] || thumb) : thumb;
            return large ? { url: large, thumb: thumb || large } : null;
          }).filter(Boolean);
          return row;
        });
      });
    });
  }

  V.setSource({
    list: function () {
      return rest('public_inventory?select=' + COLUMNS + '&order=created_at.desc').then(function (rows) {
        return withPhotos(rows, false);
      });
    },
    get: function (id) {
      if (!UUID.test(String(id || ''))) return Promise.resolve(null);
      return rest('public_inventory?select=' + COLUMNS + '&id=eq.' + encodeURIComponent(id) + '&limit=1').then(function (rows) {
        if (!rows.length) return null;
        return withPhotos(rows, true).then(function (list) { return list[0]; });
      });
    }
  });
})();
