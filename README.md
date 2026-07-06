# Bike Outdoor

Bike Outdoor er en selvstændig, installerbar outdoor-cykeltracker til Android. Den bruger telefonens GPS og kan forbinde en Bluetooth LE Cycling Power-måler (fx Stages) og en Bluetooth-pulsmåler. Appen har ingen server, login, cloud-sync eller Home Assistant-integration.

## Funktioner

- Live power, puls, kadence, fart, distance, tid og højdemeter
- GPS-rutespor med mørkt Leaflet-kort og tile-uafhængig fallback
- Start, pause/fortsæt, lap og bekræftet stop
- Autosave i IndexedDB hvert 7. sekund og ved vigtige livscyklushændelser
- Recovery af en ufærdig tur: genoptag, eksportér eller kassér
- Screen Wake Lock og valgfri visuel auto-dæmpning
- Én Training-kompatibel JSON-fil per tur
- Offline app-shell via service worker

## GitHub Pages

1. Læg hele denne mappe i roden af et GitHub-repository (eller peg Pages på mappen).
2. Aktivér **Settings → Pages → Deploy from a branch**.
3. Åbn Pages-adressen i Chrome på Android.
4. Vælg **Føj til startskærm / Installér app**.

Appens relative filstier virker både på et Pages-projektsite og et domænerod-site. HTTPS er obligatorisk for GPS, Web Bluetooth, service worker og Wake Lock; GitHub Pages leverer HTTPS.

## Brug

Giv lokationstilladelse, vent gerne på GPS LOCK, og forbind sensorer fra menuen. Start derefter turen. Ved Stop færdiggøres turen lokalt, og **Eksportér JSON** downloader filen. Importér filen via Bike JSON-importen i Training-appen.

Filnavn: `ride-YYYY-MM-DD-HHMM-outdoor.json`.

Eksporten følger TrainingV2 schema version 1: `summary.distanceKm`, `summary.durationSec`, `t`, `power`, `heartRate`, `cadence`, `speedKmh` og `distanceKm`. Outdoor-felter som GPS, højde, moving time, laps og pausemarkeringer er supplerende og ændrer ikke indoor/Garmin-kompatibilitet.

## Vigtige browserbegrænsninger

- Web Bluetooth kræver en understøttet Android-browser; Chrome på Android anbefales. iOS understøtter normalt ikke Web Bluetooth.
- Bluetooth-enheder skal første gang vælges via en brugerhandling. Automatisk reconnect forsøges kun til en allerede godkendt enhed.
- GPS kræver lokationstilladelse og er kun pålidelig, mens appen er åben og aktiv.
- Tracking med låst skærm eller i baggrunden kan blive stoppet af browseren eller Android. En native Android-app er nødvendig for fuld baggrundspålidelighed.
- Wake Lock kan blive afvist af browseren eller strømstyring; appen viser i så fald en advarsel og fortsætter.
- Mørke kortfliser kræver internet. GPS-punkter, distance og eksport fortsætter uden kortfliser, og en lokal breadcrumb-visning bruges, hvis Leaflet ikke er tilgængelig.
- Telefonens systemlysstyrke kan ikke styres sikkert fra en webapp. Auto dim dæmper derfor kun selve brugerfladen.
- Appen bruger ikke Home Assistant.

## Data og privatliv

Alle aktive og seneste ture opbevares lokalt i browserens IndexedDB. Der sendes ingen træningsdata til en server. Browserdata kan slettes af brugeren eller systemets lageroprydning, så eksportér afsluttede ture løbende.

## Lokal test

Servér mappen med en lokal webserver og åbn den på `localhost`. Bluetooth og rigtig mobil-GPS testes bedst på den endelige HTTPS GitHub Pages-adresse på telefonen.
