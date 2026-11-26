# Sklad náhradních dílů – GitHub verze

Statická webová aplikace publikovaná přes GitHub Pages. Aplikace používá veřejný repozitář pro web a soukromý repozitář pro skladová data i uživatelské účty.

## Soubory aplikace
- `index.html` – uživatelské rozhraní a nastavení.
- `app.js` – načítání dat, ověření uživatele a zápisy přes GitHub API.
- `style.css` – vzhled.

## Repozitáře

Vlastník repozitářů je `PepikVaio`.

1. Veřejný `safina_Warehouse` obsahuje pouze soubory webové aplikace.
2. Soukromý `safina_Warehouse_Data` obsahuje `data.json`, `history.json`, `users.json` a složku `images/`.
3. Repozitář `safina_Warehouse_Admin` aplikace nepoužívá a není potřeba.

Aplikace načítá skladová data i `users.json` výhradně z `safina_Warehouse_Data`.

## Oprávnění GitHub tokenů

Každý uživatel používá svůj vlastní fine-grained personal access token vytvořený pod účtem `PepikVaio`. Token musí mít přístup pouze k `safina_Warehouse_Data` a oprávnění `Contents` podle role:

| Uživatel | Role aplikace | `Contents` v `safina_Warehouse_Data` |
|---|---|---|
| Josef Wajsar | `admin` | Read and write |
| Jakub Vanta a ostatní uživatelé | `read` | Read-only |

Role je určena výhradně podle SHA-256 otisku tokenu v `users.json`. Aplikace přijímá také role `write` pro případné budoucí použití, ale zatím je přiděluj pouze po samostatném rozhodnutí.

## Soubor users.json

Soubor `users.json` musí být uložen v kořeni soukromého repozitáře `safina_Warehouse_Data`. Veřejný repozitář jej nesmí obsahovat.

Příklad struktury:

```json
{
  "users": [
    {
      "tokenHash": "8afc7fdb4006e439753e295a4c84f43b2cc66bad83f00ab9cdd6dd33edd49b6a",
      "firstName": "Jakub",
      "lastName": "Vanta",
      "role": "read"
    },
    {
      "tokenHash": "9d02ff326de2cac2dd8abbaa822dc7ff54adf06f206c61c3324379f8a855e31b",
      "firstName": "Josef",
      "lastName": "Wajsar",
      "role": "admin"
    }
  ]
}
```

Hash Jakubova tokenu doplň podle skutečného tokenu; výše uvedený hash Josefa je převzat z předchozí konfigurace. Samotné tokeny se do JSON nikdy neukládají.

## Připojení uživatele

1. Vytvoř fine-grained token pod účtem `PepikVaio`.
2. V části Repository access vyber pouze `safina_Warehouse_Data`.
3. Nastav `Contents: Read-only` pro běžného uživatele nebo `Contents: Read and write` pro Josefa.
4. V aplikaci vlož token. V Nástrojích správce lze vypočítat jeho SHA-256 otisk.
5. Přidej otisk, jméno, příjmení a roli do `users.json` v soukromém `safina_Warehouse_Data`.

## Bezpečnostní upozornění

- Veřejný repozitář aplikace nikdy nesmí obsahovat tokeny, skladová data, fotografie ani `users.json`.
- `users.json` je v soukromém datovém repozitáři. Protože všichni uživatelé potřebují ověřit svůj token proti tomuto souboru, jejich tokeny mají k repozitáři přístup alespoň pro čtení. Uživatel s `Contents: Read-only` nemůže soubor měnit.
- Token se ukládá do `localStorage` prohlížeče. Kdokoli s přístupem k odemčenému zařízení a jeho prohlížeči jej může získat.
- Kdo získá token s oprávněním zápisu do datového repozitáře, může měnit skladová data i `users.json` přímo přes GitHub API, mimo aplikaci. GitHub neumí omezit Contents oprávnění jen na vybrané soubory. Proto zatím nedávej běžným uživatelům roli `write` ani zápisová oprávnění.
- GitHub zaznamená operace pod účtem, ke kterému token patří. Jméno v historii aplikace je přiřazeno správcem v `users.json`, nikoli nezávisle ověřeno GitHubem.
- Před zápisem aplikace kontroluje SHA souboru, aby nepřepsala změny provedené mezitím někým jiným. `data.json` a `history.json` se ukládají dvěma samostatnými commity, nikoli atomicky.

## Funkce

- Přehled skladu, vyhledávání a filtrování podle zásob a minima.
- Jedno klepnutí na položku ji vybere; druhé rychlé klepnutí otevře detail (na počítači funguje také dvojklik).
- Přehled skladu se načte při otevření nebo obnovení stránky; samostatné tlačítko Obnovit data není v rozhraní.
- Naskladnění, vyskladnění a vytváření nových umístění.
- Karty dílů, dodavatelé, fotografie a interní informace.
- Detail dílu s fotografií, tisk QR štítku a tlačítka pro úpravu, naskladnění a vyskladnění.
- Historie skladových pohybů.
- Přihlášené jméno se zobrazuje v horní liště.
- Čtenáři mohou zobrazovat sklad, detaily, QR a historii. Zápisová tlačítka jsou zašedlá a neaktivní.
- Na mobilu mají vstupní pole minimální velikost písma 16 px, aby Safari při klepnutí automaticky nepřibližovalo celou stránku. Běžné gesto přiblížení stránky zůstává dostupné.
