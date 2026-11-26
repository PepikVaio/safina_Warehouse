# Sklad náhradních dílů – GitHub verze

Aplikace je statická stránka pro GitHub Pages. Skladová data, historie a fotografie se načítají a ukládají přes GitHub REST API do samostatného **soukromého** repozitáře.

## Rozdělení repozitářů

Použij dva repozitáře:

1. `Skladovy_system` – **Public**, obsahuje pouze tuto aplikaci (`index.html`, `style.css`, `app.js`). Z tohoto repozitáře se publikuje GitHub Pages.
2. `Skladova_data` – **Private**, obsahuje `data.json`, `history.json` a složku `images/`. Použij soubory ze složky `Skladova_data_private` v dodaném balíčku.

Do veřejného repozitáře nikdy nevkládej skutečná skladová data, fotografie ani přístupové tokeny.

## Zapnutí GitHub Pages

V repozitáři aplikace otevři **Settings → Pages → Deploy from a branch**, vyber `main` a `/ (root)` a ulož. Po publikování otevři adresu GitHub Pages.

## Vytvoření přístupových klíčů

Vlastník soukromého datového repozitáře vytvoří Fine-grained Personal Access Token:

1. GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens.
2. Generate new token.
3. Resource owner: vlastník soukromého repozitáře.
4. Repository access: Only select repositories → vyber `Skladova_data`.
5. Repository permissions: **Contents**.
   - Čtenář: `Read-only`.
   - Správce: `Read and write`.
6. Vytvoř token a zkopíruj ho – GitHub ho znovu celý nezobrazí.

Tokeny jsou vázané na GitHub účet, který je vytvořil. Pro tento model je vytváří vlastník repozitáře a bezpečně je předá konkrétním zařízením. Uživatelé aplikace nepotřebují vlastní GitHub účet. GitHub omezuje počet Fine-grained tokenů na 50 a tokeny mají dobu platnosti.

## První připojení aplikace

V aplikaci otevři **Nastavení** a vyplň:

- Jméno a příjmení – zobrazí se v historii pohybů.
- Vlastník repozitáře – GitHub účet, který vlastní `Skladova_data`.
- Název repozitáře – například `Skladova_data`.
- Přístupový klíč – token určený pro toto zařízení.
- Typ přístupu – prohlížení nebo správa. Tato volba pouze přizpůsobí nabídku aplikace; skutečné oprávnění vynucuje GitHub token.

Stiskni **Ověřit připojení** a potom **Uložit nastavení**. Nastavení a token se ukládají do místního úložiště daného prohlížeče/zařízení. Každé zařízení se nastavuje samostatně.

## Co aplikace ukládá

- `data.json`: karty, dodavatelé, minimální množství, obrázky a umístění včetně data posledního naskladnění pro každé umístění.
- `history.json`: každý pohyb s časem, jménem zadaným na zařízení, dílem, umístěním a počtem kusů.
- `images/`: fotografie dílů; aplikace je před nahráním zmenší a uloží jako JPG.

## Důležité bezpečnostní a provozní limity

- Zdroj aplikace je veřejný, skladová data zůstávají v soukromém repozitáři. Bez platného tokenu nelze soukromý obsah přes API číst ani měnit.
- Přístupový token je tajný klíč. Ukládá se v prohlížeči a kdokoliv, kdo má přístup k odemčenému zařízení/prohlížeči, jej může získat. Nepoužívej tuto variantu na sdíleném nebo nedůvěryhodném zařízení.
- Token je vytvořený pod GitHub účtem vlastníka, takže GitHub operace provedené tímto tokenem budou z pohledu GitHubu provedené tímto účtem, nikoliv skutečným kolegou. Jméno v historii je údaj zadaný v nastavení zařízení, nikoliv nezávisle ověřená identita.
- Kdo získá správcovský token, může zapisovat do soukromého datového repozitáře i mimo aplikaci. Oprávnění tokenu lze omezit jen na konkrétní repozitář a Contents.
- Při souběžných úpravách aplikace kontroluje SHA souborů. Pokud někdo mezitím změnil stejný soubor, zápis se zastaví a je nutné data obnovit. U dvou souborů (`data.json` a `history.json`) nejde o jednu atomickou databázovou transakci; při chybě druhého zápisu může být sklad uložen a historie neúplná.
- GitHub API má limity požadavků. Pro malý tým a občasné skladové pohyby je tento způsob použitelný, není to však náhrada databázového systému.
- Při změně zařízení, vymazání dat Safari nebo expiraci tokenu bude nutné nastavení znovu zadat.

## Funkce

- Přehled skladu, vyhledávání a filtr pod minimálním množstvím (počítá součet všech umístění).
- Samostatné naskladnění a vyskladnění.
- Vlastní nové umístění při naskladnění.
- Datum posledního naskladnění samostatně pro každé umístění; vyskladnění datum nemění.
- Karta dílu s obrázkem a minimálním množstvím; bez úprav zásob a QR v editačním formuláři.
- Detail karty se seznamem umístění a daty, akcemi Upravit a Tisk QR štítku.
- Tisk pouze QR kódu na štítek 3 × 4 palce.
- Historie naskladnění a vyskladnění.
