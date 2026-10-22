# Supabase database

`migrations/20261021203000_create_private_tracks.sql` creates the first
private schema for trips and GPS samples. Both tables use row-level security.
Only authenticated users can access rows belonging to their own trips;
anonymous API access is revoked.

## Apply the initial migration

In the Supabase project, open **SQL Editor**, create a new query, paste the
migration SQL, and run it. Do not paste any database password or secret key
into the repository or chat.

The browser app uses Supabase Auth and the public publishable key. Configure
`VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` locally in `.env.local`
and in Vercel's project environment variables. Never use a `service_role` key
in the browser.

For a private, single-owner start, turn off public sign-ups in Supabase Auth
and create the owner account in the Supabase dashboard. The app has a sign-in
form but no public sign-up form. Signed-in owners can view saved trips through
the RLS-protected API. The browser does not create or upload trips; the ESP32
uploads through the same-origin `/api/esp-upload` Vercel Function. Set these
server-only Vercel environment variables: `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `ESP32_OWNER_USER_ID`, and a random
`DEVICE_UPLOAD_TOKEN`. Never prefix server secrets with `VITE_`.
