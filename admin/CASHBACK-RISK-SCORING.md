# Cashback claim risicobeoordeling

Dit document legt uit hoe het systeem automatisch een risicoscore bepaalt voor elke ingediende cashback claim, en hoe je het admin dashboard moet lezen.

---

## Risicoscores: Low / Medium / High

Bij het indienen van een claim berekent het systeem automatisch een risiconiveau op basis van vijf factoren. Dit niveau wordt opgeslagen en is zichtbaar in het admin dashboard.

### Factoren

| Factor | Low | Medium | High |
|---|---|---|---|
| **Click timing** | Click ≤7 dagen geleden | Click 8–30 dagen geleden | Geen click, of click >30 dagen geleden |
| **Click vóór aankoop** | Click was vóór aankoopdatum | — | Click was ná aankoopdatum |
| **Account leeftijd** | Account ≥14 dagen oud | Account <14 dagen oud | — |
| **Eerste claim** | Eerder goedgekeurde claims aanwezig | Eerste claim ooit | — |
| **Claimbedrag** | ≤€500 | — | >€500 |

### Beslislogica (volgorde van beoordeling)

Het systeem doorloopt de condities van boven naar beneden en stopt bij de eerste match:

1. **High** — bedrag >€500
2. **High** — geen click, of click >30 dagen geleden
3. **High** — click was ná de opgegeven aankoopdatum *(sterke fraude-indicator: gebruiker klikte link pas ná de aankoop)*
4. **Medium** — click was 8–30 dagen geleden
5. **Medium** — account is jonger dan 14 dagen
6. **Medium** — eerste claim (nog geen eerder goedgekeurde claim)
7. **Low** — alles hierboven is negatief

---

## Click badges in het admin dashboard

De gekleurde badge naast elke claim toont wanneer de gebruiker voor het laátst op een affiliate link van deze firm klikte.

| Badge | Betekenis |
|---|---|
| ✓ Click Xd ago (groen) | Click ≤7 dagen geleden — laagste risico |
| ⚠ Click Xd ago (oranje) | Click 8–30 dagen geleden — matig risico |
| ✗ Click Xd ago (rood) | Click >30 dagen geleden — hoog risico |
| ✗ No click (rood) | Geen click gevonden — hoog risico |

> **Let op:** de badge toont de meest recente click van de gebruiker op *deze firm*, ongeacht tijdvenster. Een click van 3 maanden geleden wordt dus ook getoond, maar geeft altijd een hoge risicoscore.

---

## Filteropties in het dashboard

| Filter | Toont |
|---|---|
| All | Alle openstaande claims |
| Low risk | Alleen lage risico claims |
| Medium risk | Alleen gemiddelde risico claims |
| High risk | Alleen hoge risico claims |
| ✗ No click | Claims zonder enige click gevonden |
| ✓ Click ≤7d | Claims met recente click (≤7 dagen) |
| ⚠ Click 8-30d | Claims met matig oude click |
| ✗ Click 31d+ | Claims met oude click of geen click |

---

## Aanbevolen werkwijze

- **Low risk** → normaal goedkeuren na controle van het bewijs
- **Medium risk** → bewijs extra goed controleren; kijk of order reference klopt en of het bedrag realistisch is
- **High risk** → altijd handmatig verifiëren; bij twijfel afwijzen en de gebruiker vragen opnieuw in te dienen met correcte documentatie

### Rode vlaggen die altijd extra aandacht vragen

- Click was ná de aankoopdatum (het systeem markeert dit automatisch als High risk)
- Nieuw account (<14 dagen) met een grote eerste claim
- Geen click + geen BRO code gebruik in het verleden

---

## Technische details (voor developers)

De risicobeoordeling vindt plaats in `functions/api/rewards/claim.js` bij het indienen van de claim. Het berekende niveau wordt opgeslagen in de kolom `risk_level` van de `purchase_claims` tabel en verandert **niet** na opslaan (ook niet als er later nieuwe clicks binnenkomen).

De click badge in het admin dashboard wordt berekend op het moment van laden van het dashboard, op basis van de `last_click_at` subquery in `functions/api/rewards/admin.js`.
