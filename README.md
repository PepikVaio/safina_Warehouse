# Sklad náhradních dílů – GitHub verze

Statická webová aplikace publikovaná přes GitHub Pages. Aplikace pracuje se dvěma oddělenými soukromými repozitáři: jeden obsahuje skladová data a druhý uživatelské účty.

## Soubory aplikace
- `index.html` – uživatelské rozhraní a nastavení.
- `app.js` – načítání dat, ověření uživatele a zápisy přes GitHub API.
- `style.css` – vzhled.

## Repozitáře

Vlastník obou soukromých repozitářů je `PepikVaio`.

1. Veřejný `safina_Warehouse` obsahuje pouze soubory webové aplikace.
2. Soukromý `safina_Warehouse_Data` obsahuje `data.json`, `history.json` a složku `images/`.
3. Soukromý `safina_Warehouse_Admin` obsahuje pouze `users.json`.

Aplikace má názvy těchto repozitářů nastavené v `app.js`. `users.json` se nesmí kopírovat do veřejného repozitáře ani do datového repozitáře.

## Oprávnění GitHub tokenů

Každý uživatel používá svůj vlastní fine-grained personal access token. Tokeny jsou vytvořené pod účtem správce `PepikVaio` a mají přístup pouze k vybraným repozitářům.

| Uživatel | `safina_Warehouse_Data` | `safina_Warehouse_Admin` |
|---|---|---|
| Čtenář (`read`) | Contents: Read-only | Contents: Read-only |
| Zapisující (`write`) | Contents: Read and write | Contents: Read-only |
| Správce (`admin`) | Contents: Read and write | Contents: Read and write |

Oprávnění `Contents` nastav u každého tokenu zvlášť. Běžným uživatelům nedávej do `safina_Warehouse_Admin` právo zápisu. Tím je zápis `users.json` chráněn i mimo aplikaci přes GitHub API.

Všichni uživatelé s přístupem do `safina_Warehouse_Admin` mohou přes svůj token číst `users.json`, tedy i jména a SHA-256 otisky ostatních uživatelů. Nemohou jej však měnit, pokud mají pouze `Contents: Read-only`. Samotné GitHub tokeny v `users.json` nikdy nejsou.

## Soubor users.json

Vytvoř `users.json` v soukromém repozitáři `safina_Warehouse_Admin`. Aplikace v něm vyhledává SHA-256 otisk vloženého tokenu a podle záznamu přiřadí jméno a roli.

Příklad struktury:

```json
{
  "users": [
    {
      "tokenHash": "SEM_VLOZ_SHA256_OTISK_TOKENU",
      "firstName": "Petr",
      "lastName": "Svoboda",
      "role": "read"
    },
    {
      "tokenHash": "SEM_VLOZ_SHA256_OTISK_TOKENU",
      "firstName": "Jana",
      "lastName": "Nováková",
      "role": "write"
    },
    {
      "tokenHash": "SEM_VLOZ_SHA256_OTISK_ADMIN_TOKENU",
      "firstName": "Josef",
      "lastName": "Wajsar",
      "role": "admin"
    }
  ]
}
```

Role `admin` má stejná skladová oprávnění jako `write`, ale aplikace ji rozpozná jako správcovský účet. Záznam správce musí odpovídat tokenu, který má `Contents: Read and write` v obou soukromých repozitářích.

## Připojení uživatele

1. Vytvoř fine-grained token pod účtem `PepikVaio`.
2. V části Repository access vyber pouze `safina_Warehouse_Data` a `safina_Warehouse_Admin`.
3. V obou repozitářích nastav oprávnění `Contents` podle tabulky výše.
4. V aplikaci vlož token do pole Přístupový token a v Nástrojích správce vypočítej jeho SHA-256 otisk.
5. Přidej otisk, jméno, příjmení a roli do `users.json` v soukromém `safina_Warehouse_Admin`.
6. Uživatel vloží svůj token do aplikace. Aplikace načte soukromý `users.json`, ověří otisk a nastaví jeho roli.

## Bezpečnostní upozornění

- Veřejný repozitář aplikace nikdy nesmí obsahovat tokeny, skladová data, fotografie ani `users.json`.
- `users.json` je v samostatném soukromém repozitáři. Běžné tokeny mají v tomto repozitáři pouze čtení; jen správcovský token má zápis.
- Token se ukládá do `localStorage` prohlížeče. Kdokoli s přístupem k odemčenému zařízení a jeho prohlížeči jej může získat.
- SHA-256 otisk v `users.json` není přístupový token; slouží pouze k přiřazení uživatele a role.
- GitHub zaznamená operace pod účtem, ke kterému token patří. Jméno v historii aplikace je přiřazeno správcem v `users.json`, nikoli nezávisle ověřeno GitHubem.
- Kdo získá token s oprávněním zápisu do datového repozitáře, může měnit skladová data i mimo aplikaci.
- Před zápisem aplikace kontroluje SHA souboru, aby nepřepsala změny provedené mezitím někým jiným. `data.json` a `history.json` se ukládají dvěma samostatnými commity, nikoli atomicky.

## Funkce

- Přehled skladu, vyhledávání a filtrování podle zásob a minima.
- Jedno klepnutí na položku ji vybere; druhé rychlé klepnutí otevře detail (na počítači funguje také dvojklik).
- Přehled skladu se načte při otevření nebo obnovení stránky; samostatné tlačítko Obnovit data není v rozhraní.
- Naskladnění, vyskladnění a vytváření nových umístění.
- Karty dílů, dodavatelé, fotografie a interní informace.
- Detail dílu s fotografií, tisk QR štítku a přímá tlačítka pro úpravu, naskladnění a vyskladnění.
- Historie skladových pohybů.
- Přihlášené jméno se zobrazuje v horní liště.
- Čtenáři mohou zobrazovat sklad, detaily, QR a historii. Zápisová tlačítka jsou zašedlá a neaktivní.
