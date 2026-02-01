# Část 12: Projekty

Naučili jste se všechny hlavní funkce noex-rules — od základních eventů a faktů přes CEP vzory, persistenci, pozorovatelnost, API až po webové rozhraní. Tato závěrečná sekce vše spojuje do tří kompletních, produkčně laděných projektů. Každý projekt demonstruje realistickou doménu, používá širokou škálu funkcí enginu a poskytuje plně spustitelný kód, který můžete upravit pro své vlastní systémy.

## Kapitoly

### [12.1 Pravidlový systém pro e-shop](./01-eshop.md)

Vytvořte kompletní pravidlový systém pro online obchod:
- Dynamická cenotvorba s úrovňovými slevami a množstevními zlevněními
- Věrnostní program s automatickým povýšením úrovně na základě útraty
- Pipeline zpracování objednávek s detekcí timeoutu platby (CEP absence)
- Obnova opuštěného košíku pomocí časovačů
- Správa flash výprodeje pomocí skupin pravidel
- Upozornění na zásoby a notifikace o nízkém stavu
- 15+ pravidel spolupracujících na eventech, faktech, časovačích a CEP vzorech

### [12.2 Systém detekce podvodů](./02-detekce-podvodu.md)

Vytvořte vícevrstvý pipeline detekce podvodů:
- Detekce anomálií přihlášení s ochranou proti brute force (CEP count)
- Monitoring rychlosti transakcí (CEP aggregate)
- Detekce nemožného cestování pro geografické anomálie (CEP sequence)
- Engine skórování rizik, který akumuluje signály z více detektorů
- Eskalace alertů s odstupňovanými úrovněmi reakce
- Integrace externích služeb pro IP geolokaci a fingerprinting zařízení
- 10+ pravidel s vrstvovou architekturou detekce → skórování → reakce

### [12.3 IoT monitoring pipeline](./03-iot-monitoring.md)

Vytvořte vícezónový průmyslový monitorovací systém:
- Monitoring prahových hodnot senzorů s konfigurací pro jednotlivé zóny
- Monitoring heartbeatu pro zdraví zařízení (CEP absence)
- Klouzavé průměry a detekce anomálií s baselinami
- Plánování údržby s trvanlivými časovači
- Real-time SSE dashboard pro živý monitoring
- Vícezónová architektura se skupinami pravidel pro jednotlivé zóny
- Kompletní nastavení serveru s REST API a real-time notifikacemi

## Co se naučíte

Na konci této sekce budete schopni:
- Navrhovat architektury založené na pravidlech pro složité business domény
- Kombinovat eventy, fakta, časovače, CEP vzory a externí služby v jednom systému
- Strukturovat pravidla do vrstvených pipeline s jasnými hranicemi stupňů
- Používat skupiny pravidel a tagy pro správu feature flags a prostředově specifického chování
- Stavět real-time monitorovací dashboardy s SSE
- Aplikovat persistenci, pozorovatelnost a hot reload pro produkční připravenost

---

Začněte s: [Pravidlový systém pro e-shop](./01-eshop.md)
