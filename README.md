# RC Track

En browserbaseret turviser til RC-GPS-ture. Importér en GPX-fil eller en CSV
med GPS-koordinater, tidspunkter og fart for at se et fartfarvet spor på kortet.
Importerede filer behandles lokalt i browseren og uploades ikke.

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

ESP32'ens nuværende CSV indeholder dato, tid og fart, men endnu ikke GPS-
koordinater. Websiden forklarer det, hvis filen vælges. Firmwarens eksport skal
udvides med bredde- og længdegrad, før den kan tegne ESP32-sporet.

Kortfliser fra OpenStreetMap kræver internetforbindelse. Selve turfilen bliver
lokalt i browseren og uploades ikke til en tjeneste. Kortudbyderen modtager
dog de kortfelter, browseren efterspørger, så den kan se hvilket område der
vises. Denne første version kræver hverken konto eller upload af turdata til
skyen.

## Udrulning til Vercel

Importér denne projektmappe som et Vercel-projekt. Vercel genkender Vite
automatisk. Build-kommandoen er `npm run build`, og outputmappen er `dist`.
