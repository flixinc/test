# CONTEXT — Compier Dashboard

> Geef dit bestand aan Claude aan het begin van elke sessie.
> Zeg: "Hier is de CONTEXT.md, ik wil verder werken aan [onderdeel]."

---

## Wat is dit project?

Een interne PWA (Progressive Web App) voor **Compier O&A** (Onderhoud & Aanleg) om projecten bij te houden. Draait op GitHub Pages, communiceert met Supabase als backend. Gebouwd in **vanilla HTML/CSS/JS** — geen framework, bewust simpel gehouden zodat het ook op een telefoon werkt zonder installatie.

**Test URL:** `https://flixinc.github.io/test/` ← altijd hier testen
**Productie URL:** `https://flixinc.github.io/compier-dashboard`
**Beheerder / eigenaar:** Raymond (rayflix@gmail.com)

---

## GitHub setup

- **Repo test branch:** `flixinc/test` (branch: `main`) → GitHub Pages serveert op `/test/`
- **Repo productie:** `flixinc/compier-dashboard`
- **GitHub token** (opgeslagen in `/sessions/.../mnt/.claude/.github_token`): Claude kan zelf pushen naar de test repo
- **Push commando:**
```bash
cd /sessions/nifty-confident-keller/repo-test
cp /sessions/nifty-confident-keller/mnt/outputs/compier-dashboard/app.js .
cp /sessions/nifty-confident-keller/mnt/outputs/compier-dashboard/style.css .
cp /sessions/nifty-confident-keller/mnt/outputs/compier-dashboard/index.html .
git add app.js style.css index.html
git commit -m "beschrijving"
git push origin main
```
- Als `repo-test` niet bestaat: `git clone https://<TOKEN>@github.com/flixinc/test.git repo-test`
- Token ophalen: `source /sessions/nifty-confident-keller/mnt/.claude/.github_token && echo $GITHUB_TOKEN`

---

## Bestandsstructuur

```
compier-dashboard/        ← outputs folder (lokale werkkopie)
├── CONTEXT.md            ← dit bestand (NIET pushen naar GitHub)
├── index.html            ← HTML-structuur + externe CSS/JS refs
├── style.css             ← alle styling
├── app.js                ← alle logica
├── manifest.json         ← PWA manifest (ongewijzigd)
├── sw.js                 ← Service Worker (ongewijzigd)
└── icons/                ← PWA iconen
```

---

## Tech stack

| Component | Technologie |
|-----------|-------------|
| Frontend | Vanilla HTML/CSS/JS (geen framework) |
| Hosting | GitHub Pages (`flixinc.github.io`) |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth (e-mail + wachtwoord) |
| AI uitlezen | Claude Haiku via Cloudflare Worker proxy |
| Kaart | Leaflet.js + PDOK geocoding (NL) |
| Fonts | IBM Plex Sans + IBM Plex Mono (Google Fonts) |
| PWA | manifest.json + sw.js |

---

## Huidige versie: v1.9 (2026-04-03)

### Versiehistorie (kort)
- v1.9 — Kalender tab, ruimte chip rechtsonder in mobiele kaart, kalender chips vergroot met adres, **Deel-knop** in project modal (PNG kaart genereren), deelkaart layout gefixed (geen footer balk, oranje balk als laatste getekend)
- v1.8 — Auth, betere RAL Lab-kleuren, bugfixes
- v1.7 — Actiedatum met tijdkeuze, timed ICS event
- v1.6 — Klik op kleur opent vergroot detail-kaart
- v1.5 — Farrow & Ball kleurencollectie toegevoegd
- v1.4 — RAL kleurenkiezer toegevoegd
- v1.3 — Actie chips: Gereed melden toegevoegd
- v1.0 — Initiële versie: Supabase integratie, bon uitlezen, kaart

---

## Supabase tabellen

### `projecten`
```
id              integer (PK, auto)
nummer          text        — bijv. "M2603 0024"
adres           text        — werklocatie adres
ruimte          text        — ruimtenummer, bijv. "0.01 sluis"
opdrachtgever   text        — bijv. "Prinsenstichting"
status          text        — 'offerte' | 'lopend' | 'wacht' | 'wacht-reactie' | 'wacht-akkoord' | 'klaar'
actie           text        — volgende actie
datum           text        — ISO datetime (YYYY-MM-DDTHH:MM of YYYY-MM-DD)
contact         text        — "Naam — telefoonnummer"
aanmelder       text        — "Naam — telefoonnummer"
notitie         text        — omschrijving werkzaamheden
acties_log      jsonb       — array van { actie, datum } (max 5, LIFO)
fotos           jsonb       — foto-urls
```

### `deuren`
```
id              integer (PK, auto)
m_nummer        text        — FK naar projecten.nummer
deur_nr         integer
naam            text
breedte         text
hoogte          text
status          text        — 'open' | 'ingemeten'
```

### `locaties`
```
id              integer (PK, auto)
naam            text
adres           text
postcode        text
plaats          text
type            text        — 'wonen' | 'dagbesteding'
tel             text
mob             text
subgroepen      jsonb       — array van { naam, mob }
```

---

## Claude API proxy

URL: `https://damp-surf-e962compier-proxy.rayflix.workers.dev`
- Draait op Cloudflare Workers
- Stuurt requests door naar Anthropic API
- Gebruikt: `claude-haiku-4-5-20251001` voor bon uitlezen
- Headers: `x-api-key` (Claude key), `anthropic-version: 2023-06-01`

---

## CSS variabelen (design tokens)

```css
--orange: #E8611A       /* primaire accentkleur, instelbaar door gebruiker */
--orange-dim: #b54c12   /* hover state */
--bg: #0f0f0f           /* pagina achtergrond */
--surface: #181818      /* kaarten, header */
--surface2: #222222     /* tabel header, hover */
--border: #2a2a2a
--text: #e8e8e8
--muted: #666
--green: #4caf6e
--yellow: #d4a017
--blue: #4a90d9
--red: #c0392b
--purple: #8e6bbf
```

Light mode: `body.light` overschrijft bg/surface/border/text.

---

## Functionaliteit overzicht

### Tabs
1. **Projecten** — hoofd-overzicht (tabel op desktop, kaarten op mobiel)
2. **Locaties** — kaart met Leaflet + lijst van locaties uit Supabase
3. **Kalender** — maandoverzicht van alle projecten met datum

### Mobiele kaarten (Projecten tab, <700px)
- Toont: nummer, status badge, adres, opdrachtgever, actie, datum
- **Ruimte chip** rechtsonder in de kaart (naast datum), alleen als `p.ruimte` gevuld is
- CSS klassen: `.card-footer`, `.card-ruimte`, `.card-date`

### Kalender tab
- Maandoverzicht met navigatie (← →) en "Vandaag" knop
- Projectchip toont per dag: **nummer + tijd** (zelfde regel), **adres**, **actie**
- Statuskleur als dot (groen=lopend, oranje=offerte, geel=wacht, grijs=klaar)
- Klik op chip → opent project modal
- Constanten: `KAL_MAANDEN`, `KAL_STATUS_KLEUR`
- State: `kalJaar`, `kalMaand`
- Functies: `renderKalender()`, `kalNavigeer(delta)`, `kalNaarVandaag()`
- CSS: alle `.kal-*` klassen, dagcel min-height 110px (desktop)

### Deel-knop (deelKaart)
- Knop **DEEL** verschijnt in de modal footer (rechts, naast Opslaan/Verwijder), alleen bij bestaande projecten
- `document.getElementById('btn-deel').style.display = isNew ? 'none' : 'block'` in `switchTab()`
- Genereert een **PNG kaart in telefoon-portret formaat** (390×dynamisch px, 2× retina scale)
- **Canvas opbouw (van boven naar onder):**
  1. Achtergrond (`roundRect` radius 12)
  2. Header: "COMPIER" in oranje (IBM Plex Mono 700 11px)
  3. Horizontale lijn
  4. Projectnummer (IBM Plex Mono 700 26px, oranje)
  5. Ruimte chip (als gevuld): afgerond rechthoekje met IBMPlex Mono tekst
  6. Adres (bold 14px) + opdrachtgever (muted 11px)
  7. Horizontale lijn
  8. Label "OPDRACHT" (letter-spacing)
  9. Notitie tekst — **alle regels** (word-wrapped, dynamische hoogte)
  10. Horizontale lijn
  11. Label "DATUM" + datum/tijd in oranje (als gevuld)
  12. **Oranje balk links** (als ALLERLAATSTE getekend, zodat hij altijd schoon bovenop staat)
- **Dynamische hoogte:** notitie-regels worden vooraf berekend via temp canvas context, H = vaste blokken + (aantalRegels × 17px) + datum blok + 32px padding
- **Thema-aware:** `document.body.classList.contains('light')` schakelt alle canvas-kleuren mee
- Preview in nieuw tabblad via `window.open('', '_blank')` + `win.document.write()`. iOS: lang indrukken op afbeelding om op te slaan/delen
- Preview pagina heeft "← Terug naar dashboard" knop (sluit het tabblad)
- **Geen footer balk** op de kaart (eerder verwijderd op verzoek)

### Header tools
- **OPSLAG** — Winst & Risico berekening (10% AK, 5% W&R)
- **STORAX** — Link naar bestelformulier
- **DEUREN** — Link naar inmeet tool
- **RAL** — Kleurenkiezer (RAL Classic + Farrow & Ball)

### Projecten features
- Zoeken op nummer / adres / opdrachtgever / notitie
- Filteren op status (ook via header statistieken klikken)
- Sorteren op kolom
- Dubbel M-nummer check bij opslaan
- Bon uitlezen via Claude AI (tekst plakken → velden invullen)
- Actie log (max 5 stappen, LIFO)
- Actie chips (snelkeuze voor volgende actie)
- Agendapunt exporteren als .ics
- Deuren sectie in modal (toont gemeten deuren vanuit Supabase)

### Auth
- Supabase e-mail + wachtwoord auth
- Token refresh automatisch
- Login setup scherm voor eerste gebruik (sbUrl + sbKey invullen)
- Logout knop

### PWA
- manifest.json + sw.js voor installatie op telefoon
- Ververs-knop: unregistert SW + cleart cache → hard reload

---

## Bekende aandachtspunten

- Geen TypeScript, geen bundler — bewust simpel
- Geocode cache gebruikt localStorage (kan vol raken bij veel locaties)
- PDOK geocoding alleen voor Nederland
- SW caching: bij updates altijd hard reload doen via de ververs-knop (↺)
- GitHub Pages heeft ~1 minuut deploy-vertraging na een push

---

## Standaard startprompt voor nieuwe sessie

```
Hier is de CONTEXT.md van het Compier Dashboard project.
Ik wil verder werken aan: [ONDERDEEL]

Huidige versie: v1.9 — bestanden staan in de outputs folder.
Test URL: https://flixinc.github.io/test/
```

---

*Bijgewerkt: 2026-04-03 | v1.9 — deelkaart layout fixed, CONTEXT volledig*
