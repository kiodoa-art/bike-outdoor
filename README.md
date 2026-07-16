# Bike Workout V3.7.2

Bike Workout er en statisk PWA til indendørs cykeltræning med Wahoo KICKR. Appen læser live-data via Web Bluetooth, kan importere ZWO-workouts og kan styre target watt via FTMS/ERG.

## Funktioner

- Forbindelse til KICKR via Web Bluetooth
- Separat forbindelse til Bluetooth-pulsmåler
- Automatisk genforbindelse til tidligere godkendt udstyr
- Live-visning af watt, kadence, puls, tid, gennemsnit, maksimum og distance
- Pulsgraf for de seneste ti minutter
- Import af `.zwo`- og `.xml`-workouts
- Wattberegning ud fra FTP
- FTMS-baseret ERG-styring, når træneren understøtter Control Point
- Workout-kommentarer og intervalvisning
- Testvisning med simulerede data
- Lagring af afsluttede ture som JSON i valgt mappe
- Automatisk download som fallback, hvis browseren ikke understøtter mappevalg
- Installerbar PWA med offline-cache

## Krav

Appen skal åbnes via HTTPS eller `localhost`. Web Bluetooth virker bedst i en Chromium-baseret browser som Microsoft Edge eller Google Chrome.

På Android skal browseren have Bluetooth-tilladelse. På Windows skal Bluetooth være slået til, og KICKR/pulsmåleren må ikke allerede være låst af en anden app.

## Projektstruktur

```text
bike-workout-main/
├── app.js                 Bluetooth, workout, ERG, turregistrering og UI-logik
├── icons/
│   ├── apple-touch-icon-180.png
│   ├── icon-192.png
│   ├── icon-512.png
│   └── icon-maskable-512.png
├── index.html             Appens brugerflade
├── manifest.webmanifest   PWA-konfiguration
├── README.md
├── styles.css             Layout og design
├── sw.js                  Service worker og offline-cache
└── wrangler.jsonc         Cloudflare Workers/Assets-konfiguration
```

Projektet kræver ingen build-proces og har ingen JavaScript-afhængigheder.

## Lokal test

Start en simpel lokal webserver i projektmappen:

```bash
python -m http.server 8000
```

Åbn derefter:

```text
http://localhost:8000
```

Testvisningen kan startes fra **Indstillinger → Test og fejlfinding** eller med URL-parameteren:

```text
http://localhost:8000/?demo=1
```

## Deployment på Cloudflare

`wrangler.jsonc` peger på projektmappen som statisk asset-mappe. Projektet kan deployes direkte fra GitHub via Cloudflare eller med Wrangler:

```bash
npx wrangler deploy
```

Efter en ny deployment opretter service workeren en versionsbestemt cache og sletter ældre Bike Workout-caches, når opdateringen aktiveres.

## Turfiler

Når en tur afsluttes, gemmes en JSON-fil med turens metadata, sammenfatning og samples. Ved understøttelse af File System Access API kan en fast mappe vælges i indstillingerne. Ellers downloades filen gennem browseren.

## Vigtige begrænsninger

- ERG virker kun, hvis KICKR eksponerer FTMS Fitness Machine Control Point.
- Browseren kræver normalt en brugerhandling første gang et Bluetooth-produkt godkendes.
- En anden cykelapp kan blokere Bluetooth-forbindelsen.
- En ny service worker venter under en aktiv tur og aktiveres først bagefter eller ved manuel bekræftelse.


## PWA og opdateringer

- Installeres fra Edge/Chrome som en selvstændig PWA.
- Manifestet foretrækker fuldskærmsvisning og falder tilbage til standalone.
- Appskallen caches lokalt og kan åbnes offline.
- Appen kontrollerer automatisk for opdateringer ved opstart, når den bliver synlig igen og hvert 30. minut.
- En ventende opdatering aktiveres automatisk, når der ikke kører en tur eller workout. Under en aktiv tur venter opdateringen, så data ikke går tabt.
- Manuel opdateringskontrol findes under **Indstillinger → App og opdatering**.
