# Část 2: Začínáme

Tato sekce vás provede základními stavebními bloky noex-rules: vytvořením enginu, registrací pravidel, emitováním událostí, správou faktů a psaním podmínek.

## Kapitoly

### [2.1 Váš první pravidlový engine](./01-prvni-engine.md)

Instalace balíčku, konfigurace enginu a spuštění zpracování událostí:
- Instalace a nastavení TypeScriptu
- `RuleEngine.start()` a konfigurační volby
- Spuštění, zastavení a kontrola stavu enginu

### [2.2 Pravidla a eventy](./02-pravidla-a-eventy.md)

Registrace pravidel a jejich řízení událostmi:
- Anatomie pravidla: id, name, priority, tags, trigger, conditions, actions
- Emitování událostí a odběr výsledků
- Jak engine vyhodnocuje pravidla při příchodu události

### [2.3 Práce s fakty](./03-fakta.md)

Správa perzistentního stavu, nad kterým pravidla uvažují:
- `setFact`, `getFact`, `deleteFact`, `queryFacts`
- Pravidla spouštěná fakty a konvence formátu klíčů
- Kdy použít fakta vs události

### [2.4 Podmínky do hloubky](./04-podminky.md)

Zvládnutí systému podmínek pro přesné cílení pravidel:
- Všech 12 operátorů s příklady
- Typy zdrojů: event, fact, context, lookup
- Dynamické reference a řetězcová interpolace

## Co se naučíte

Na konci této sekce budete schopni:
- Nastavit běžící pravidlový engine od nuly
- Registrovat pravidla reagující na události a změny faktů
- Spravovat perzistentní stav pomocí úložiště faktů
- Psát přesné podmínky s využitím celé sady operátorů

---

Začněte s: [Váš první pravidlový engine](./01-prvni-engine.md)
