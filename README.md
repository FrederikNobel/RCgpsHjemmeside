# RC Track

En browserbaseret turviser til RC-GPS-ture. Importér en GPX-fil eller en CSV
med GPS-koordinater, tidspunkter og fart for at se et fartfarvet spor på kortet.
Importerede filer behandles lokalt i browseren. Kun ture modtaget fra den
indloggede ESP-upload bliver gemt i Supabase.

## Kør lokalt

```text
npm install
npm run dev
```

## Understøttede filer

- **GPX:** spor-punkter med breddegrad, længdegrad og tid. Hvis filen ikke har
  fartdata, beregnes farten ud fra afstanden mellem GPS-punkterne.
- **CSV:** headerfelter for breddegrad (`latitude` eller `lat`), længdegrad
  (`longitude`, `lon` eller `lng`), fart i km/t (`speed_kmh`) og tid
  (`timestamp` eller `utc_date` + `utc_time`).

## Supabase-backend (under opsætning)

Databaseskemaet for ture og GPS-målinger ligger i
[`supabase/migrations`](./supabase/migrations/). Se
[`supabase/README.md`](./supabase/README.md) for at oprette tabellerne i
Supabase. Hver tur og dens målinger er beskyttet af Row Level Security og
tilknyttet den bruger, der er logget ind.

Kopiér `.env.example` til `.env.local`, og udfyld Supabase Project URL og
publishable key. Opret brugeradgang i Supabase Auth; denne app tilbyder ikke
offentlig selvregistrering. Log ind på websiden for at se gemte ture. Import af
GPX/CSV på websiden gemmer ikke filen i databasen.

På Vercel skal `VITE_SUPABASE_URL` og `VITE_SUPABASE_PUBLISHABLE_KEY` sættes
under projektets Environment Variables for hvert miljø, hvorefter der skal
laves et nyt deploy. Publishable key er beregnet til klienten og begrænses af
RLS; læg aldrig en `service_role`- eller secret key i Vite-miljøvariablerne.

ESP-uploadens Vercel Function kræver også server-side variablerne
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ESP32_OWNER_USER_ID` og en
tilfældig `DEVICE_UPLOAD_TOKEN`. De må ikke have `VITE_`-præfiks eller ligge
i Git. Indtast `DEVICE_UPLOAD_TOKEN` på ESP'ens lokale opsætningsside.

Firmwaren inkluderer nu GPS-koordinater, hotspot-opsætning og uploadflow.
Uploaden er klar til hardwaretest, når servervariablerne er sat, firmwaren er
flashet, og ESP'en har fået hotspot og device token i sin lokale side.

Kortfliser fra OpenStreetMap kræver internetforbindelse. Kortudbyderen modtager
de kortfelter, browseren efterspørger, så den kan se hvilket område der vises.

## Udrulning til Vercel

Importér denne projektmappe som et Vercel-projekt. Vercel genkender Vite
automatisk. Build-kommandoen er `npm run build`, og outputmappen er `dist`.
