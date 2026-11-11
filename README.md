# Klaverjas Scoreblok

Een scoreblok voor klaverjassen dat je als app op je beginscherm zet. Elke tafel maakt een eigen groep en nodigt de andere spelers uit met een link. Eén speler houdt de score bij; de anderen zien de stand live op hun eigen telefoon. Het blok telt nat, pit, roem en verzaken zelf, en houdt per groep een overzicht van alle potjes bij.

## Bestanden

| Bestand | Wat het doet |
|---|---|
| `index.html`, `app.js` | De app zelf |
| `config.js` | De Firebase-gegevens (al ingevuld) |
| `manifest.webmanifest`, `*.png` | Naam en icoon op het beginscherm |
| `sw.js` | Zorgt dat de app ook offline opent |
| `admin.html`, `admin.js` | Beheeroverzicht voor de beheerder van de app |

De Firestore-regels staan niet in deze repository. Ze staan in Firebase zelf, bij **Firestore → Regels**. Pas ze daar aan als dat nodig is.

## 1. Firebase instellen (eenmalig)

Het project `klaverjas-score-database` bestaat al. Er moeten nog drie dingen gebeuren.

**Firestore aanmaken**
1. Kies **Databases & Storage → Firestore → Database maken**.
2. Kies **productiemodus** en als locatie `europe-west4` (Nederland).

**Regels plakken**
1. Ga naar **Firestore → Regels**.
2. Vervang alles door de regels voor deze app en klik op **Publiceren**.

**Anoniem inloggen aanzetten**
1. Ga naar **Authentication → Aan de slag → Sign-in method**.
2. Zet **Anoniem** (Anonymous) aan.

Spelers hebben geen account nodig. Elke telefoon krijgt op de achtergrond een anoniem account, en de uitnodigingslink maakt dat account lid van een groep.

## 2. Op GitHub Pages zetten

1. Maak een repository, bijvoorbeeld `klaverjas`.
2. Upload alle bestanden uit deze map naar de hoofdmap.
3. Kies **Settings → Pages**. Zet Source op **Deploy from a branch**, kies branch `main` en map `/ (root)`, en klik op **Save**.
4. Na ongeveer een minuut staat de app op `https://<gebruikersnaam>.github.io/klaverjas/`.

## 3. Een groep beginnen

1. Open het adres in Safari en kies **Deel → Zet op beginscherm**. Open de app daarna vanaf het beginscherm.
2. Vul een groepsnaam en de vier spelers in en tik op **Groep maken**.
3. Kies bij **Wie ben jij?** jezelf. Als maker van de groep schrijf jij de score; een ander kan dat later overnemen.
4. Kopieer bij **Groep en instellingen** de uitnodigingslink en zet die in de groepsapp. Aan tafel kan het sneller: tik op **Toon QR-code** en laat de anderen die scannen met hun camera.

## 4. Lid worden (de andere spelers)

Open de link, of scan de QR-code met je camera. Je zit dan meteen in de groep. Zet de app op je beginscherm via **Deel → Zet op beginscherm**.

De app op het beginscherm heeft op de iPhone eigen opslag, los van Safari. Daarom houdt de app de uitnodiging in de adresbalk; de app op het beginscherm wordt zo bij de eerste keer openen zelf lid. Zie je de groep toch niet, open dan **Nieuwe groep of lid worden** en plak daar de link.

Maak een nieuwe groep bij voorkeur in de app op het beginscherm. Wie de groep maakt, is beheerder (nieuwe link maken, groep verwijderen), en dat geldt alleen voor de plek waar de groep is gemaakt.

## Hoe het werkt

- **Eén schrijver per potje.** De maker van de groep schrijft eerst. Een andere speler neemt het over via **Groep en instellingen → Wie schrijft → Ik schrijf**, bijvoorbeeld als de batterij van de schrijver leeg is. Bij een nieuw potje blijft dezelfde persoon schrijver.
- **Live meekijken.** Een opgeslagen ronde staat binnen een paar seconden op de andere telefoons.
- **Zonder internet.** De schrijver kan doorspelen. Rondes worden verstuurd zodra er weer verbinding is.
- **Nieuwe link.** De maker van de groep kan bij Groep en instellingen een nieuwe link maken. Wie al lid is, blijft lid. De oude link werkt niet meer voor nieuwe leden.
- **Spelregels per groep.** Het aantal rondes en hoe roem bij verzaken telt, stel je in bij Groep en instellingen.
- **Meer groepen.** Je kunt lid zijn van meerdere groepen en wisselt tussen groepen via de groepsnaam bovenin.
- **Verlaten of verwijderen.** Spelers kunnen een groep verlaten. De maker kan de groep met alle potjes verwijderen.

## Beheer

Op `…/klaverjas-score/admin.html` staat een overzicht voor de beheerder: aantal groepen, telefoons en potjes, gespeelde potjes per week, en per groep de leden, potjes, het lopende potje en de laatste activiteit. Een groep kan daar ook worden verwijderd. De pagina staat niet in de app en is niet vindbaar via zoekmachines.

Instellen (eenmalig):
1. Zet in Firebase bij **Authentication → Sign-in method** ook **E-mail/wachtwoord** aan.
2. Voeg bij **Authentication → Users** een gebruiker toe met je e-mailadres en een wachtwoord.
3. Kopieer de **User UID** van die gebruiker en zet die in de Firestore-regels op de plek van `JOUW_BEHEER_UID`. Publiceer de regels.
4. Open `admin.html` en log in. Lukt het laden niet, dan toont de pagina de UID die in de regels moet staan.

Inloggen in het beheer staat los van de app: de groepen in dezelfde browser blijven gewoon werken.

Let op: als beheerder zie je de namen van groepen en spelers en de scores van alle groepen.

## Later iets aanpassen

Verhoog na elke wijziging `VERSIE` in `sw.js` (bijvoorbeeld `klaverjas-12` naar `klaverjas-13`) en `APP_VERSIE` in `app.js` (`1.12` naar `1.13`). Dan halen de telefoons de nieuwe bestanden op, en onderaan in de app zie je welke versie draait.

## Kosten

Het gratis Spark-abonnement van Firebase is ruim genoeg voor tientallen groepen. Live meekijken kost alleen leesacties als er echt iets verandert.
