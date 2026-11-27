# Sklad náhradních dílů

Webová aplikace používá GitHub Pages pro rozhraní a soukromý repozitář `PepikVaio/safina_Warehouse_Data` pro skladová data, historii, uživatele a obrázky.

## Soubory
- `index.html` – struktura aplikace
- `app.js` – práce s GitHub API a skladovou evidencí
- `style.css` – vzhled

## Nasazení
Nahraď soubory v tomto ZIPu ve veřejném repozitáři `PepikVaio/safina_Warehouse`. Soukromý repozitář `safina_Warehouse_Data` neměň; aplikace do něj ukládá data přes GitHub API.

## Uživatelé
Správce může v aplikaci spravovat uživatele. U každého se ukládá pouze SHA-256 otisk jeho GitHub tokenu do `users.json`. Samotný token je součástí osobní pozvánky, aby se nový uživatel nemusel přihlašovat ke GitHubu. Pozvánkový odkaz je proto citlivý údaj a musí se posílat soukromě.

Role:
- `read` – pouze prohlížení
- `write` – úpravy skladu
- `admin` – úpravy skladu a správa uživatelů

Tokeny vytváří správce pod účtem `PepikVaio` a musí mít přístup k repozitáři `safina_Warehouse_Data`. Pro role `write` a `admin` musí mít token oprávnění Contents: Read and write; pro `read` stačí Contents: Read-only.

## Poznámka k zabezpečení
GitHub Fine-grained token s Contents: Read and write může přes GitHub API měnit všechny soubory v daném repozitáři, včetně `users.json`. Role v aplikaci omezuje ovládací prvky uživatelského rozhraní, nikoli samotná oprávnění tokenu GitHubu.
