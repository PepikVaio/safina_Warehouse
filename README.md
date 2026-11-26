# Sklad náhradních dílů – GitHub verze

Statická webová aplikace publikovaná přes GitHub Pages. Skladová data jsou v samostatném soukromém GitHub repozitáři.

## Soubory aplikace
- `index.html` – uživatelské rozhraní a nastavení.
- `app.js` – načítání dat, ověření uživatele a zápisy přes GitHub API.
- `style.css` – vzhled.

## Datový repozitář
Aplikace je nyní pevně nastavena na repozitář `PepikVaio/safina_Warehouse_Data`. Pokud se repozitář někdy přejmenuje, musí správce změnit konstanty `REPO_OWNER` a `REPO_NAME` na začátku `app.js`.

V soukromém repozitáři musí být `data.json`, `history.json`, `users.json` a složka `images/`.

## Registrace uživatelů – postup správce
Každý uživatel musí mít vlastní GitHub token s přístupem do datového repozitáře. Token musí mít alespoň `Contents: Read-only`; uživatelům, kteří mají zapisovat, nastav `Contents: Read and write`.

1. Vytvoř nebo si vyžádej osobní GitHub token uživatele a zajisti, aby měl přístup k soukromému repozitáři.
2. V Nastavení aplikace vlož tento token do pole GitHub token.
3. Klikni na **Vypočítat otisk vloženého tokenu**. Zkopíruj zobrazený SHA-256 otisk. Není nutné token ukládat ani potvrzovat nastavení.
4. Přidej uživatele do `users.json`: vlož otisk, jeho jméno, příjmení a roli `read` nebo `write`.
5. Nahraj upravený `users.json` do soukromého repozitáře.
6. Předej uživateli jeho vlastní token. Uživatel jej vloží do Nastavení aplikace a uloží. Jméno a oprávnění se načtou automaticky z `users.json`.

Uživatel se sám do `users.json` nezapisuje. Pokud jeho otisk v souboru není, aplikace přihlášení odmítne.

### Příklad users.json

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
    }
  ]
}
```

Otisk se počítá automaticky z přesného tokenu. Do `users.json` nikdy nevkládej samotný token.

## Proč jsou oprávnění uvedena dvakrát?

Jsou to dvě různé kontroly:
- GitHub token určuje, co GitHub API skutečně dovolí. `Contents: Read-only` nemůže zapisovat; `Contents: Read and write` zapisovat může.
- `role` v `users.json` určuje, co aplikace danému uživateli zobrazí a povolí. `read` zašedí a zablokuje zápisové funkce; `write` je zpřístupní.

Obě nastavení musí souhlasit. Pro čtenáře nastav v GitHub tokenu `Contents: Read-only` a v JSON `role: read`. Pro zapisujícího nastav v tokenu `Contents: Read and write` a v JSON `role: write`. Pokud je v JSON `write`, ale token má pouze čtení, aplikace zápisové funkce zobrazí, ale GitHub zápis odmítne. Pokud má token zápis, ale JSON obsahuje `read`, aplikace zápisové funkce skryje/zablokuje.

Role v JSON tedy není náhradou oprávnění tokenu; slouží hlavně k řízení rozhraní a k tomu, aby čtenář neměl aktivní ovládací prvky pro změny.

## Historie
Při naskladnění a vyskladnění aplikace zapíše do `history.json` jméno a příjmení přiřazené k otisku tokenu, typ pohybu, díl, umístění, množství a čas. Jméno se nebere z volného textu zadaného uživatelem při přihlášení.

## Bezpečnostní upozornění
- Veřejný repozitář aplikace nikdy nesmí obsahovat tokeny, skladová data ani fotografie.
- Token se ukládá do `localStorage` prohlížeče. Kdokoli s přístupem k odemčenému zařízení a jeho prohlížeči jej může získat.
- SHA-256 otisk v `users.json` není přístupový token; slouží pouze k přiřazení uživatele a role.
- GitHub token je nutné chránit. Pokud jej uživatel ztratí nebo unikne, zruš jej na GitHubu a vytvoř nový; nový token bude mít nový otisk.
- GitHub zaznamená operace pod účtem, ke kterému token patří. Jméno v historii aplikace je přiřazeno správcem v `users.json`, nikoli nezávisle ověřeno GitHubem.
- Kdo získá token s oprávněním zápisu, může zapisovat i mimo aplikaci.
- Před zápisem aplikace kontroluje SHA souboru, aby nepřepsala změny provedené mezitím někým jiným. `data.json` a `history.json` se ukládají dvěma samostatnými commity, nikoli atomicky.

## Funkce
- Přehled skladu, vyhledávání a filtrování podle zásob a minima.
- Jedno klepnutí na položku ji vybere; druhé rychlé klepnutí otevře detail (na počítači funguje také dvojklik).
- Přehled skladu se načte při otevření nebo obnovení stránky; samostatné tlačítko Obnovit data není v rozhraní.
- Přehled skladu, vyhledávání a filtrování podle zásob a minima.
- Naskladnění, vyskladnění a vytváření nových umístění.
- Karty dílů, dodavatelé, fotografie a interní informace.
- Detail dílu s fotografií, tisk QR štítku a přímá tlačítka pro úpravu, naskladnění a vyskladnění.
- Historie skladových pohybů.
- Přihlášené jméno se zobrazuje v horní liště.
- Nástroj pro správce (výpočet otisku a test připojení) je schovaný pod tlačítkem Nástroje správce v nastavení.
- Čtenáři mohou zobrazovat sklad, detaily, QR a historii. Zápisová tlačítka jsou zašedlá a neaktivní.
