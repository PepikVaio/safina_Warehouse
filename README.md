# Sklad náhradních dílů – GitHub verze

Statická webová aplikace publikovaná přes GitHub Pages. Aplikace čte a zapisuje skladová data v samostatném soukromém repozitáři GitHub.

## Soubory aplikace
- `index.html` – uživatelské rozhraní a nastavení.
- `app.js` – načítání dat, ověření role a zápisy přes GitHub API.
- `style.css` – vzhled.

## Soukromý datový repozitář
V soukromém repozitáři (např. `Skladova_data`) musí být: `data.json`, `history.json`, `users.json` a složka `images/`. Data ani obrázky nevkládej do veřejného repozitáře aplikace.

### Soubor users.json
Role se neurčuje ručně v aplikaci. Aplikace vypočítá SHA-256 otisk zadaného tokenu a porovná jej se seznamem v `users.json`.

```json
{
  "users": [
    { "tokenHash": "SEM_VLOZ_SHA256_OTISK_TOKENU", "role": "write" },
    { "tokenHash": "SEM_VLOZ_SHA256_OTISK_TOKENU", "role": "read" }
  ]
}
```

Povolené role jsou `read` a `write`. Chybějící, neplatný nebo nedostupný `users.json`, neznámý token nebo chyba při ověření znamená vždy pouze čtení. Vlastník vytvoří otisk v Nastavení aplikace tlačítkem **Vygenerovat otisk tokenu** a ručně jej vloží do `users.json`.

## Vytvoření tokenů
V GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens vytvoř token omezený pouze na soukromý datový repozitář a oprávnění Contents.
- Čtenář: `Contents: Read-only`.
- Správce: `Contents: Read and write`.

`users.json` určuje, které funkce aplikace zobrazí jako povolené. Skutečné oprávnění k zápisu ale stále vynucuje GitHub: token s `Contents: Read-only` nemůže zapisovat ani tehdy, pokud by se někdo pokusil obejít rozhraní aplikace.

## Nastavení aplikace
V Nastavení zadej jméno, příjmení, vlastníka datového repozitáře, název repozitáře a GitHub token. Typ přístupu se nevybírá. Každé zařízení má vlastní nastavení uložené v místním úložišti prohlížeče.

## Bezpečnostní upozornění
- Veřejný repozitář aplikace nikdy nesmí obsahovat tokeny, skutečná skladová data ani fotografie.
- Token se ukládá do localStorage prohlížeče. Kdokoli s přístupem k odemčenému zařízení a jeho prohlížeči jej může získat.
- SHA-256 otisk v `users.json` není samotný token a slouží pouze k mapování role. Seznam rolí není náhradou za skutečná GitHub oprávnění.
- Tokeny vytvořené pod stejným GitHub účtem se v GitHub historii projeví jako operace tohoto účtu. Jméno v historii je text zadaný uživatelem, nikoli ověřená identita.
- Kdo získá správcovský token, může zapisovat do soukromého repozitáře i mimo aplikaci.
- Před zápisem aplikace kontroluje SHA souboru, aby nepřepsala změny provedené mezitím někým jiným. `data.json` a `history.json` se ukládají dvěma samostatnými commity, nikoli atomicky.

## Funkce
- Přehled skladu, vyhledávání a filtrování podle zásob a minima.
- Naskladnění, vyskladnění a vytváření nových umístění.
- Karty dílů, dodavatelé, fotografie a interní informace.
- Detail dílu a tisk QR štítku.
- Historie skladových pohybů.
- Čtenáři mohou zobrazovat sklad, detaily, QR a historii. Zápisová tlačítka zůstávají viditelná, ale jsou zašedlá a neaktivní.
