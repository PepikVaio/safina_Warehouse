# Náhled oken Safina Warehouse

Otevři `preview/` přes místní HTTP server. V kořenové složce projektu spusť:

```sh
python3 -m http.server 8000
```

Pak navštiv <http://localhost:8000/preview/>.

Nabídka obsahuje původní obrazovky a dialogy z `pages/`. HTML i styly se načítají přímo z kořenového projektu, takže se zobrazí aktuální vzhled originálních souborů. Náhled pouze doplní formuláře a tabulky fiktivními hodnotami z `mock-data.json`; nic se neukládá a nepřipojuje se ke GitHubu.
