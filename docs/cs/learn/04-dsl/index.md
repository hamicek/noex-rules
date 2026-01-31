# Část 4: DSL

Dosud jste psali pravidla jako prosté objekty — specifikovali jste `trigger`, `conditions` a `actions` v doslovných JSON-like strukturách. Funguje to, ale je to ukecaný a náchylný k chybám zápis. noex-rules poskytuje tři doménově specifické jazykové přístupy, které činí tvorbu pravidel bezpečnější, expresivnější a pohodlnější podle toho, kdo pravidla píše.

## Kapitoly

### [4.1 Fluent Builder API](./01-fluent-builder.md)

Primární způsob psaní pravidel v TypeScriptu:
- `Rule.create()` s kompletním řetězením metod
- Trigger helpery: `onEvent()`, `onFact()`, `onTimer()`
- Podmínkové operátory s typově bezpečnými výrazy
- Akční helpery: `emit()`, `setFact()`, `deleteFact()`, `setTimer()`, `cancelTimer()`, `callService()`, `log()`
- Reference pomocí `ref()` a interpolace řetězců

### [4.2 Tagged šablonové literály](./02-tagged-sablony.md)

Kompaktní, řádkově orientovaná syntaxe pro rychlé prototypování:
- Funkce tagged šablony `rule`
- Klíčová slova WHEN / IF / AND / THEN
- Inline datové objekty a automatická detekce referencí
- JavaScript interpolace pro dynamické hodnoty

### [4.3 YAML pravidla](./03-yaml-pravidla.md)

Konfiguračně řízená pravidla pro netechnické publikum:
- `loadRulesFromYAML()` a `loadRulesFromFile()`
- Podporované YAML formáty (jedno pravidlo, pole, klíč `rules`)
- Validace a zpracování chyb

### [4.4 Volba správného přístupu](./04-volba-pristupu.md)

Praktický průvodce výběrem nejlepšího DSL pro vaši situaci:
- Porovnání všech čtyř přístupů vedle sebe
- Rozhodovací strom pro běžné scénáře
- Míchání přístupů ve stejném enginu
- Strategie migrace

## Co se naučíte

Na konci této sekce budete schopni:
- Psát typově bezpečná pravidla s fluent builder API
- Rychle prototypovat pravidla pomocí tagged šablonových literálů
- Načítat pravidla z YAML souborů pro konfiguračně řízené systémy
- Vybrat správný přístup k tvorbě pravidel pro každý use case

---

Začněte s: [Fluent Builder API](./01-fluent-builder.md)
