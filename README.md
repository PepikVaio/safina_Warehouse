# Sklad náhradních dílů – prototyp

Jednoduchý statický prototyp pro GitHub Pages.

## Spuštění přes GitHub Pages

1. Vytvoř na GitHubu nový repozitář.
2. Nahraj všechny soubory z této složky do kořene repozitáře:
   - `index.html`
   - `style.css`
   - `app.js`
   - `data.json`
3. Otevři **Settings → Pages**.
4. V části **Build and deployment** zvol **Deploy from a branch**.
5. Vyber větev `main` a složku `/ (root)`, potom ulož.
6. Po zveřejnění otevři zobrazenou adresu GitHub Pages.

## Co prototyp umí

- Zobrazit tabulku skladových položek.
- Vyhledávat v údajích a filtrovat položky podle skladové zásoby.
- Vytvořit novou kartu a automaticky přidělit interní ID.
- Evidovat více dodavatelů a textové ceny v libovolné měně.
- Evidovat interní kartu, středisko, zařízení a poznámku.
- Evidovat více skladových umístění.
- Naskladnit a vyskladnit množství z vybraného umístění.
- Vygenerovat QR kód a vytisknout jednoduchý štítek.

## Důležité omezení této první verze

Toto je pouze prototyp rozhraní a práce s daty. Počáteční data se načítají z `data.json`, ale provedené změny se ukládají do `localStorage` daného prohlížeče.

To znamená:
- změny na iPhonu se automaticky neobjeví na PC;
- změny se nezapisují zpět do GitHubu;
- vymazání dat webu/prohlížeče může odstranit lokálně uložené změny.

GitHub Pages je statický hosting. Pro společný zápis do jednoho JSON souboru bude potřeba následně doplnit GitHub API a bezpečné přihlášení. Nikdy nevkládej osobní GitHub token přímo do veřejného `app.js`.

## Poznámky

QR knihovna se v tomto prototypu načítá z CDN. Pro ostré použití ji můžeme uložit přímo do repozitáře, aby generování QR nebylo závislé na externím CDN.
