# Cast 12: Projekty

Naucili jste se vsechny hlavni funkce noex-rules — od zakladnich eventu a faktu pres CEP vzory, persistenci, pozorovatelnost, API az po webove rozhrani. Tato zaverecna sekce vse spojuje do tri kompletnich, produkcne lazenych projektu. Kazdy projekt demonstruje realistickou domenu, pouziva sirokou skalu funkci enginu a poskytuje plne spustitelny kod, ktery muzete upravit pro sve vlastni systemy.

## Kapitoly

### [12.1 Pravidlovy system pro e-shop](./01-eshop.md)

Vytvorte kompletni pravidlovy system pro online obchod:
- Dynamicka cenotvorba s urovnovymi slevami a mnozstevnimi zlevnenimmi
- Vernostni program s automatickym povysenim urovne na zaklade utraty
- Pipeline zpracovani objednavek s detekci timeoutu platby (CEP absence)
- Obnova opusteneho kosiku pomoci casovcu
- Sprava flash vyprodeje pomoci skupin pravidel
- Upozorneni na zasoby a notifikace o nizkem stavu
- 15+ pravidel spolupracujicich na eventech, faktech, casovacich a CEP vzorech

### [12.2 System detekce podvodu](./02-detekce-podvodu.md)

Vytvorte vicevrstvy pipeline detekce podvodu:
- Detekce anomalii prihlaseni s ochranou proti brute force (CEP count)
- Monitoring rychlosti transakci (CEP aggregate)
- Detekce nemozneho cestovani pro geograficke anomalie (CEP sequence)
- Engine skorovani rizik, ktery akumuluje signaly z vice detektoru
- Eskalace alertu s odstupnovanymi urovnemi reakce
- Integrace externich sluzeb pro IP geolokaci a fingerprinting zarizeni
- 10+ pravidel s vrstvovou architekturou detekce → skorovani → reakce

### [12.3 IoT monitoring pipeline](./03-iot-monitoring.md)

Vytvorte vicezodovy prumyslovy monitorovaci system:
- Monitoring prahovych hodnot senzoru s konfiguraci pro jednotlive zony
- Monitoring heartbeatu pro zdravi zarizeni (CEP absence)
- Klouzave prumery a detekce anomalii s baselinami
- Planovani udrzby s trvanlivymi casovaci
- Real-time SSE dashboard pro zivy monitoring
- Vicezonova architektura se skupinami pravidel pro jednotlive zony
- Kompletni nastaveni serveru s REST API a real-time notifikacemi

## Co se naucite

Na konci teto sekce budete schopni:
- Navrhovat architektury zalozene na pravidlech pro slozite business domeny
- Kombinovat eventy, fakta, casovace, CEP vzory a externi sluzby v jednom systemu
- Strukturovat pravidla do vrstvenych pipeline s jasnymi hranicemi stupnu
- Pouzivat skupiny pravidel a tagy pro spravu feature flags a prostredove specifickeho chovani
- Stavet real-time monitorovaci dashboardy s SSE
- Aplikovat persistenci, pozorovatelnost a hot reload pro produkcni pripravenost

---

Zacnete s: [Pravidlovy system pro e-shop](./01-eshop.md)
