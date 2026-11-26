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

Každý uživatel používá samostatný fine-grained personal access token, který vytvoří správce pod účtem `PepikVaio`. Uživatel nepotřebuje vlastní GitHub účet. Token musí mít přístup pouze k `safina_Warehouse_Data` a oprávnění `Contents` podle role:

| Uživatel | Role aplikace | `Contents` v `safina_Warehouse_Data` |
|---|---|---|
| Josef Wajsar | `admin` | Read and write |
| Běžný uživatel | `read` | Read-only |
| Uživatel s možností úprav | `write` | Read and write |

Role je určena výhradně podle SHA-256 otisku tokenu v `users.json`. `read` umožňuje pouze prohlížení, `write` umožňuje úpravy skladu a `admin` navíc umožňuje správu uživatelů.

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

## Přidání uživatele a pozvánka

1. Přihlas se do aplikace jako `admin`.
2. Otevři tlačítko **Uživatelé** vedle **Nová karta**.
3. Zadej jméno, příjmení, roli a GitHub token vytvořený pod účtem `PepikVaio`.
4. Token musí mít přístup pouze k `safina_Warehouse_Data`. Pro `read` nastav `Contents: Read-only`; pro `write` a `admin` nastav `Contents: Read and write`.
5. Aplikace uloží SHA-256 otisk do soukromého `users.json` a připraví osobní pozvánku.
6. Zkopíruj pozvánku a pošli ji uživateli soukromou cestou. Uživatel otevře odkaz a klikne na **Uložit přístup**. Token se mu v aplikaci nezobrazuje.

Při ztrátě pozvánky vytvoř nový token, odeber starý účet a přidej jej znovu. Pro přepnutí účtu na zařízení použij **Odhlásit** a otevři pozvánku druhého účtu.

## Bezpečnostní upozornění

- Veřejný repozitář aplikace nikdy nesmí obsahovat tokeny, skladová data, fotografie ani `users.json`.
- `users.json` je v soukromém datovém repozitáři. Protože všichni uživatelé potřebují ověřit svůj token proti tomuto souboru, jejich tokeny mají k repozitáři přístup alespoň pro čtení. Uživatel s `Contents: Read-only` nemůže soubor měnit.
- Token se ukládá do `localStorage` prohlížeče. Kdokoli s přístupem k odemčenému zařízení a jeho prohlížeči jej může získat.
- Pozvánkový odkaz obsahuje token zakódovaný v části URL za znakem `#`. Aplikace jej nezobrazuje a po načtení odstraní z adresního řádku, ale odkaz sám je přístupové tajemství. Kdokoli, komu odkaz přepošleš nebo kdo jej získá, může token použít. Posílej pozvánky pouze soukromě a při úniku token na GitHubu zruš.
- `write` a `admin` tokeny mají přístup k zápisu do celého datového repozitáře. GitHub neumí omezit zápis jen na `data.json` nebo jen na uživatelské rozhraní. Proto může i uživatel s rolí `write` upravit `users.json` přímo přes GitHub API. Přiděluj zápisová oprávnění jen důvěryhodným osobám.
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
- Přihlášené jméno, příjmení a role se zobrazují v horní liště.
- Správce má tlačítko **Uživatelé** pro přidávání, změnu rolí a odebírání účtů. Tlačítko i Nástroje správce jsou skryté pro ostatní role.
- Správce může vytvořit pozvánkový odkaz s předvyplněným tokenem; nový uživatel jej uloží jedním kliknutím bez zobrazení tokenu.
- Odhlášení umožňuje přepnout účet na stejném zařízení.
- Čtenáři mohou zobrazovat sklad, detaily, QR a historii. Zápisová tlačítka jsou zašedlá a neaktivní.
- Na mobilu mají vstupní pole minimální velikost písma 16 px, aby Safari při klepnutí automaticky nepřibližovalo celou stránku. Běžné gesto přiblížení stránky zůstává dostupné.
