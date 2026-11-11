# Klaverjas Scoreblok

Een scoreblok voor klaverjassen dat je als app op je beginscherm zet. Elke tafel maakt een eigen groep en nodigt de andere spelers uit met een link. Eén speler houdt de score bij; de anderen zien de stand live op hun eigen telefoon. Het blok telt nat, pit, roem en verzaken zelf, en houdt per groep een overzicht van alle potjes bij.

## Bestanden

| Bestand | Wat het doet |
|---|---|
| `index.html`, `app.js` | De app zelf |
| `config.js` | De Firebase-gegevens (al ingevuld) |
| `manifest.webmanifest`, `*.png` | Naam en icoon op het beginscherm |
| `sw.js` | Zorgt dat de app ook offline opent |

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
4. Kopieer bij **Groep en instellingen** de uitnodigingslink en zet die in de groepsapp.

## 4. Lid worden (de andere spelers)

Open de link op je telefoon. Je zit dan meteen in de groep. Zet de app op je beginscherm via **Deel → Zet op beginscherm**.

De app op het beginscherm heeft op de iPhone eigen opslag, los van Safari. Zie je de groep niet in de app, open dan **Groep en instellingen → Nieuwe groep of lid worden** en plak daar de link.

## Hoe het werkt

- **Eén schrijver per potje.** De maker van de groep schrijft eerst. Een andere speler neemt het over via **Groep en instellingen → Wie schrijft → Ik schrijf**, bijvoorbeeld als de batterij van de schrijver leeg is. Bij een nieuw potje blijft dezelfde persoon schrijver.
- **Live meekijken.** Een opgeslagen ronde staat binnen een paar seconden op de andere telefoons.
- **Zonder internet.** De schrijver kan doorspelen. Rondes worden verstuurd zodra er weer verbinding is.
- **Nieuwe link.** De maker van de groep kan bij Groep en instellingen een nieuwe link maken. Wie al lid is, blijft lid. De oude link werkt niet meer voor nieuwe leden.
- **Spelregels per groep.** Het aantal rondes en hoe roem bij verzaken telt, stel je in bij Groep en instellingen.
- **Meer groepen.** Je kunt lid zijn van meerdere groepen en wisselt tussen groepen via de groepsnaam bovenin.
- **Verlaten of verwijderen.** Spelers kunnen een groep verlaten. De maker kan de groep met alle potjes verwijderen.

## Later iets aanpassen

Verhoog na elke wijziging `VERSIE` in `sw.js`, bijvoorbeeld `klaverjas-2` naar `klaverjas-3`. Dan halen de telefoons de nieuwe bestanden op.

## Kosten

Het gratis Spark-abonnement van Firebase is ruim genoeg voor tientallen groepen. Live meekijken kost alleen leesacties als er echt iets verandert.
