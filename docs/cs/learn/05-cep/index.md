# Část 5: Complex Event Processing

Jednotlivé události vám řeknou, co se stalo v jednom okamžiku. Ale reálná business logika často závisí na **vzorech napříč více událostmi** — přišla platba po objednávce? Došlo ke třem neúspěšným přihlášením během pěti minut? Překročily celkové tržby práh za poslední hodinu? Complex Event Processing (CEP) vám dává slovník pro vyjádření těchto temporálních vztahů jako deklarativních pravidel.

## Kapitoly

### [5.1 Co je CEP?](./01-co-je-cep.md)

Motivace pro temporální pattern matching:
- Proč jednotlivé události nestačí pro reálnou logiku
- Čtyři typy CEP vzorů: sekvence, absence, počet, agregace
- Jak CEP zapadá do architektury pravidlového enginu
- Příklady z reálného světa: detekce podvodů, e-commerce a IoT

### [5.2 Sekvence a absence](./02-sekvence-a-absence.md)

Detekce uspořádaných a chybějících událostí v časových oknech:
- `sequence()`: uspořádaný matching událostí s `within`, `groupBy`, `strict`
- `absence()`: detekce očekávaných událostí, které nikdy nepřišly
- Pojmenované události s `as` pro referencování dat v akcích
- Kompletní příklady platebního flow a detekce timeoutu

### [5.3 Počet a agregace](./03-pocet-a-agregace.md)

Frekvenční prahy a numerická agregace v čase:
- `count()`: frekvence událostí s klouzavými vs pevnými okny
- `aggregate()`: sum, avg, min, max nad numerickými poli
- Porovnávací operátory: `gte`, `lte`, `eq`
- Kompletní příklady detekce brute-force a skoků tržeb

### [5.4 CEP vzory v praxi](./04-cep-vzory.md)

Kombinování vzorů pro reálné systémy:
- Vícestupňové detekční pipeline
- Kombinování CEP s běžnými pravidly pro události/fakta
- Příklad IoT monitoring pipeline
- Výkonnostní aspekty a strategie debuggování

## Co se naučíte

Na konci této sekce budete schopni:
- Rozpoznat, kdy business požadavek vyžaduje temporální pattern matching
- Používat sekvenční vzory pro detekci uspořádaných toků událostí
- Používat vzory absence pro detekci timeoutů a chybějících kroků
- Používat vzory počtu pro frekvenčně založené alertování
- Používat agregační vzory pro monitoring na základě prahů
- Kombinovat více CEP vzorů do vícestupňových detekčních pipeline

---

Začněte s: [Co je CEP?](./01-co-je-cep.md)
