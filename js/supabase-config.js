/* ==========================================================================
   Cela Auto Sales — Supabase connection for the PUBLIC website
   --------------------------------------------------------------------------
   BROWSER-SAFE VALUES ONLY. Everyone who visits the site can read this file.
   It may contain ONLY the project URL and the publishable ("anon") key.

   These are safe to publish only because Row Level Security protects the
   database: with this key a visitor can read published inventory and
   nothing else, and can change nothing.

   NEVER put a service_role/secret key, database password, access token,
   or any employee credential in this file or anywhere in this website.
   ========================================================================== */
window.CELA_SUPABASE = Object.freeze({
  url: 'https://oisayywxzpefivjvbcpy.supabase.co',
  publishableKey: 'sb_publishable_uUOHHoq5RKkUPax4WFQIdQ_x7cVdpW8',
  photoBucket: 'vehicle-photos',
  signedUrlSeconds: 3600
});
