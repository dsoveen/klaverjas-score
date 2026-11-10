# Klaverjas Scoreblok

Scoreblok voor klaverjassen als webapp op je beginscherm. Het telt nat, pit, roem en verzaken zelf, en houdt een overzicht van alle potjes bij. Het werkt ook zonder internet. Is Firebase ingesteld, dan wordt het overzicht ook online bewaard.

## Bestanden

| Bestand | Wat het doet |
|---|---|
| `index.html` | De app zelf |
| `config.js` | Je Firebase-gegevens (stap 4) |
| `firestore.rules` | Wie het overzicht mag lezen en schrijven (stap 2) |
| `manifest.webmanifest`, `*.png` | Naam en icoon op het beginscherm |
| `sw.js` | Zorgt dat de app ook offline opent |

Zonder Firebase werkt alles ook. Het overzicht staat dan alleen op het toestel.

## 1. Firebase-project aanmaken (gratis)

1. Ga naar <https://console.firebase.google.com> en log in met een Google-account.
2. Maak een nieuw project aan, bijvoorbeeld `klaverjas`. Google Analytics heb je niet nodig.
3. Het gratis Spark-abonnement is genoeg. Je hoeft geen betaalgegevens in te vullen.

## 2. Database aanmaken

1. Open **Firestore Database** en kies **Database maken**.
2. Kies **productiemodus** en als locatie `europe-west4` (Nederland). De locatie kun je later niet meer wijzigen.
3. Open het tabblad **Regels**. Plak de inhoud van `firestore.rules` en vervang `JOUW@EMAILADRES.NL` door het e-mailadres uit stap 3.
4. Klik op **Publiceren**.

## 3. Inlog aanmaken

1. Open **Authentication** en kies **Aan de slag**.
2. Zet bij **Sign-in method** de optie **E-mail/wachtwoord** aan.
3. Voeg bij **Users** een gebruiker toe met je e-mailadres en een wachtwoord.

Alleen dit e-mailadres komt door de regels uit stap 2. Ook als iemand anders een account aanmaakt, kan die het overzicht niet lezen of wijzigen.

## 4. config.js invullen

1. Open **Projectinstellingen** (het tandwiel) en ga naar **Algemeen**.
2. Neem de **Project-ID** en de **Web-API-sleutel** over in `config.js`:

```js
window.KLAVERJAS_CONFIG = {
  firebase: { apiKey: "AIzaSy...", projectId: "klaverjas-12345" }
};
```

Staat er nog geen Web-API-sleutel, voeg dan onder **Je apps** een web-app toe (het `</>`-icoon). Firebase Hosting hoef je daarbij niet aan te zetten.

De sleutel is niet geheim en mag gewoon op GitHub staan. De beveiliging zit in de regels uit stap 2.

## 5. Op GitHub Pages zetten

1. Maak een nieuwe repository, bijvoorbeeld `klaverjas`.
2. Upload alle bestanden uit deze map naar de hoofdmap van de repository.
3. Kies in de repository **Settings → Pages → Build and deployment**. Zet Source op **Deploy from a branch**, Branch op `main` en map `/ (root)`, en klik op **Save**.
4. Na ongeveer een minuut staat de app op `https://<gebruikersnaam>.github.io/klaverjas/`.

## 6. Op de iPhone zetten

1. Open het adres in **Safari**.
2. Kies **Deel → Zet op beginscherm**.
3. Open de app vanaf het beginscherm. Log onderaan bij **Alle potjes** in met het account uit stap 3.

Let op: een app op het beginscherm heeft op de iPhone eigen opslag, los van Safari. Log in en importeer dus in de app, niet in Safari.

## 7. Gegevens meenemen van de claude.ai-versie

1. Open in de claude.ai-versie **Gegevens overzetten** en tik op **Kopieer gegevens**.
2. Open in de nieuwe app **Gegevens overzetten** en plak de tekst in het vak.
3. Tik op **Importeer** en daarna op **Ja, vervang lopend potje**.

Het lopende potje, de spelers met foto's en het overzicht komen mee. Geïmporteerde potjes worden online bewaard zodra je bent ingelogd.

## Later iets aanpassen

Verhoog na elke wijziging `VERSIE` in `sw.js`, bijvoorbeeld van `klaverjas-1` naar `klaverjas-2`. Dan haalt de app de nieuwe bestanden op.

## Hoe opslaan werkt

- Het lopende potje, de foto's en een kopie van het overzicht staan op het toestel zelf.
- Na ronde 16 gaat het potje naar Firebase. Zonder verbinding wacht het en wordt het later verstuurd. Dat gebeurt als de verbinding terug is of als je de app opnieuw opent.
- Op een ander toestel zie je het overzicht na inloggen ook.
