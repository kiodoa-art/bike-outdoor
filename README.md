# Bike Outdoor

En statisk PWA til outdoor cykelture. Ingen backend, intet login, ingen Home Assistant.
Appen tracker, viser live data og GPS-rute, og eksporterer én JSON-fil pr. tur, som kan
importeres direkte i din eksisterende Training-app.

## Hvad appen gør

- Forbinder til en Stages powermeter og en pulsmåler via Web Bluetooth
- Bruger telefonens GPS til at spore rute, distance, hastighed og højdemeter
- Viser live data i to visninger: **Live** (store tal) og **Map** (rute på mørkt kort)
- Autogemmer turen løbende i IndexedDB, så en uafsluttet tur kan genoptages, eksporteres
  eller slettes, hvis appen lukkes undervejs
- Eksporterer en `ride-YYYY-MM-DD-HHMM-outdoor.json`-fil, som Training-appens eksisterende
  Bike JSON-import kan læse

Training-appen er stadig eneste sted for historik, analyse, rekorder og grafer. Bike Outdoor
gemmer og eksporterer — intet andet.

## Kør lokalt

Filerne er 100% statiske. Servér mappen med en simpel HTTP-server (fx `npx serve .` eller
`python3 -m http.server`) — service worker og Bluetooth/GPS kræver HTTPS eller `localhost`,
så åbn ikke `index.html` direkte som `file://`.

## GitHub Pages

Upload indholdet af denne mappe til roden af et repository og aktivér GitHub Pages fra
`main` / `(root)`. Alle stier i appen er relative, så den virker både på et projekt-subpath
(`brugernavn.github.io/repo/`) og på et eget domæne.

## Kompatibilitet med Training-appen

Den eksporterede JSON følger Training-appens eksisterende Bike ride-format
(`bike-json.js`): `version`, `source`, `rideId`, `startTime`, `endTime`, `summary` og
`samples` (med `t`, `timestamp`, `power`, `heartRate`, `cadence`, `speedKmh`, `distanceKm`).

Der er tilføjet et par ekstra felter, som Training-appens nuværende importer roligt
ignorerer, men som er der, hvis du senere vil bygge videre på dem: `sport`,
`movingTimeSec`, `elevationGainMeters`, `laps`, samt `lat`/`lon`/`altitude`/`gpsAccuracy`/
`isPaused` på hvert sample. `source` sættes til `"bike_outdoor"`, så Training-appen kan
skelne outdoor-ture fra indendørs Bike-ture og Garmin-importer.

**Én lille ændring i Training-appen er nødvendig** for at ture fra Bike Outdoor bliver
korrekt mærket som outdoor i stedet for indoor: `bike-json.js` sætter i dag `sport` til den
faste værdi `"indoor_cycling"` for alle Bike-importerede ture. Den vedlagte
`training-app-patch/bike-json.js` ændrer kun den ene linje, så et eventuelt `sport`-felt i
ride-JSON'en bruges, hvis det findes, og ellers falder tilbage til `"indoor_cycling"` som i
dag. Gamle Bike- og Garmin-filer har ikke et `sport`-felt og påvirkes derfor ikke — kun
Bike Outdoor's egne eksporter (der sætter `"sport": "outdoor_cycling"`) rammer den nye gren.
Kopiér filen ind i din Training-app-repo for at få den fulde effekt; uden patchen importeres
outdoor-ture stadig fint, blot mærket som `indoor_cycling`.

Ingen andre filer i Training-appen er rørt. Eksisterende Garmin- og indoor Bike-importer er
uændrede.

## Begrænsninger (vigtigt at kende)

- Web Bluetooth kræver en understøttet Android-browser (fx Chrome). Det virker ikke i alle
  browsere.
- GPS kræver lokationstilladelse fra brugeren.
- Tracking er bygget til at køre, mens appen er åben og synlig på skærmen. Browserens
  baggrunds-/låst skærm-begrænsninger gør, at tracking kan stoppe eller blive upræcis, hvis
  telefonen låses eller appen minimeres.
- En rigtig native Android-app ville kunne give pålidelig baggrundstracking — det kan en
  PWA i en browser ikke garantere.
- Kortfliser (Leaflet + CARTO dark tiles) kræver internet. Hvis der ikke er forbindelse,
  vises kortet ikke, men GPS-punkter bliver stadig registreret og gemt — kortet er kun
  visuel støtte, ikke en forudsætning for tracking.
- Appen bruger ikke og afhænger ikke af Home Assistant.

## Filstruktur

```
index.html              — app-skal, to tabs: Live og Map
styles.css               — mørkt, rundet, "premium cykelcomputer"-design
app.js                   — turens livscyklus og state
sensors.js               — Web Bluetooth: Cycling Power + Heart Rate
gps.js                   — watchPosition, distance/hastighed/højdemeter
storage.js               — IndexedDB autosave og krise-genoprettelse
map.js                   — Leaflet mørkt kort, rute, markør, recenter
export.js                — bygger Training-kompatibel JSON og trigger download
ui.js                    — tabs, rendering, dim-tilstand, wake lock, toasts
sw.js                    — service worker, cacher app-skallen
manifest.webmanifest     — PWA-manifest
icons/                   — app-ikoner (maskable-sikre)
training-app-patch/bike-json.js — patched fil til Training-appen (se ovenfor)
```


## Version 2 changes

- Map view now uses normal colored OpenStreetMap tiles instead of a dark tile set, because the dark map was too hard to read outdoors.
- Service worker cache was changed from cache-first to network-first for local app files.
- Cache name was bumped to `bike-outdoor-v2-color-map-force-update`.
- New service worker versions call `skipWaiting()`, `clients.claim()` and reload open app windows once, so GitHub Pages updates do not keep serving stale JavaScript/CSS for ages.

When changing the app again, bump `CACHE_NAME` in `sw.js` every time you upload a new release.
