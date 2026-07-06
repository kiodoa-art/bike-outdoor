# Bike Outdoor

En statisk PWA til outdoor cykelture. Ingen backend, intet login, ingen Home Assistant.
Appen tracker, viser live data, kan følge en importeret GPX-rute på farvet kort og eksporterer én JSON-fil pr. tur, som kan importeres direkte i din eksisterende Training-app.

## Hvad appen gør

- Forbinder til en Stages powermeter og en pulsmåler via Web Bluetooth
- Bruger telefonens GPS til at spore kørt rute, distance, hastighed og højdemeter
- Viser live data i to visninger: **Live** og **Map**
- Kan importere en **GPX-rute**, så du kan følge en planlagt rute på kortet
- Viser planlagt rute og faktisk kørt spor som to forskellige linjer
- Viser om du er på ruten, cirka afstand fra ruten og cirka distance til slut
- Autogemmer turen løbende i IndexedDB, så en uafsluttet tur kan genoptages, eksporteres eller slettes
- Eksporterer en `ride-YYYY-MM-DD-HHMM-outdoor.json`-fil, som Training-appens eksisterende Bike JSON-import kan læse

Training-appen er stadig eneste sted for historik, analyse, rekorder og grafer. Bike Outdoor gemmer og eksporterer — intet andet.

## GPX-ruter

Lav ruten i fx Komoot, Strava, Garmin Connect, Ride with GPS eller en anden ruteplanlægger, og eksportér den som `.gpx`.

I appen:

1. Åbn menuen/indstillinger
2. Tryk **Indlæs** ved GPX-rute
3. Vælg GPX-filen
4. Gå til **Map**-fanen

Kortet viser nu:

- planlagt GPX-rute som lilla linje
- dit faktiske kørte spor som blå linje
- din aktuelle GPS-position som blå markør
- start og mål-markør
- cirka distance til slut
- cirka afstand fra ruten

Der er ikke fuld turn-by-turn navigation endnu. Første version er bevidst holdt enkel: tydelig rute, tydelig position, live tracking og JSON-eksport.

## Kør lokalt

Filerne er 100% statiske. Servér mappen med en simpel HTTP-server, fx:

```bash
python3 -m http.server
```

Åbn ikke `index.html` direkte som `file://`. Service worker, GPS og Bluetooth kræver HTTPS eller `localhost`.

## GitHub Pages

Upload indholdet af denne mappe til roden af et repository og aktivér GitHub Pages fra `main` / `(root)`. Alle stier er relative, så appen virker både på `brugernavn.github.io/repo/` og eget domæne.

## Kompatibilitet med Training-appen

Den eksporterede JSON følger Training-appens eksisterende Bike ride-format (`bike-json.js`): `version`, `source`, `rideId`, `startTime`, `endTime`, `summary` og `samples`.

Der er tilføjet outdoor-felter som `sport`, `movingTimeSec`, `elevationGainMeters`, `plannedRoute`, `laps`, samt `lat`/`lon`/`altitude`/`gpsAccuracy`/`isPaused` på hvert sample. `source` sættes til `"bike_outdoor"`, så Training-appen kan skelne outdoor-ture fra indendørs Bike-ture og Garmin-importer.

**Én lille ændring i Training-appen kan være nødvendig** for at ture fra Bike Outdoor bliver mærket som outdoor i stedet for indoor. Den vedlagte `training-app-patch/bike-json.js` ændrer kun den del, så et eventuelt `sport`-felt i ride-JSON'en bruges, hvis det findes, og ellers falder tilbage til `"indoor_cycling"` som før.

Gamle Bike- og Garmin-filer bør ikke påvirkes.

## Begrænsninger

- Web Bluetooth kræver en understøttet Android-browser, typisk Chrome på Android.
- GPS kræver lokationstilladelse.
- Tracking er lavet til at køre, mens appen er åben og synlig på skærmen.
- Låst skærm / baggrundstracking kan være upålidelig i en browser.
- En native Android-app ville være nødvendig for fuldt pålidelig baggrundstracking.
- Kortfliser kræver internet, medmindre de allerede er cachet.
- GPS-tracking og JSON-eksport virker stadig, selv hvis kortfliser ikke loader.
- Appen bruger ikke Home Assistant.

## Filstruktur

```text
index.html              — app-skal, Live/Map tabs, GPX-import-knapper
styles.css              — rundet mørkt mockup-inspireret design
app.js                  — turens livscyklus, GPX-import og state
sensors.js              — Web Bluetooth: Cycling Power + Heart Rate
gps.js                  — watchPosition, distance/hastighed/højdemeter
storage.js              — IndexedDB autosave, GPX-rute og krise-genoprettelse
map.js                  — Leaflet farvekort, GPX-rute, kørt spor, markør
route.js                — GPX-parser og route-statusberegning
export.js               — bygger Training-kompatibel JSON og trigger download
ui.js                   — tabs, rendering, dim-tilstand, wake lock, toasts
sw.js                   — service worker med aggressiv update-håndtering
manifest.webmanifest    — PWA-manifest
icons/                  — app-ikoner
training-app-patch/     — minimal patch til Training-appens bike-json.js
```

## Version 3 changes

- GPX-import tilføjet.
- Planlagt rute og kørt rute tegnes separat.
- Pre-ride GPS-punkter tegnes ikke længere som kørt spor.
- Map-fanen viser rutenavn, distance til slut og afstand fra ruten.
- UI er gjort blødere, mørkere, mere rundet og tættere på mockup-stilen.
- Service worker cache-version er bumpet til `bike-outdoor-v3-gpx-route-mockup-ui`.

Når appen ændres igen, skal `CACHE_NAME` i `sw.js` bumpes hver gang, så GitHub Pages/PWA ikke hænger i gammel version.
