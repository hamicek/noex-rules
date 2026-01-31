# Cast 5: Complex Event Processing

Jednotlive udalosti vam reknou, co se stalo v jednom okamziku. Ale realna business logika casto zavisi na **vzorech napric vice udalostmi** — prisla platba po objednavce? Doslo ke trem neuspesnym prihlasenim behem peti minut? Prekrocily celkove trzby prah za posledni hodinu? Complex Event Processing (CEP) vam dava slovnik pro vyjadreni techto temporalnich vztahu jako deklarativnich pravidel.

## Kapitoly

### [5.1 Co je CEP?](./01-co-je-cep.md)

Motivace pro temporalni pattern matching:
- Proc jednotlive udalosti nestaci pro realnou logiku
- Ctyri typy CEP vzoru: sekvence, absence, pocet, agregace
- Jak CEP zapada do architektury pravidloveho enginu
- Priklady z realneho sveta: detekce podvodu, e-commerce a IoT

### [5.2 Sekvence a absence](./02-sekvence-a-absence.md)

Detekce usporadanych a chybejicich udalosti v casovych oknech:
- `sequence()`: usporadany matching udalosti s `within`, `groupBy`, `strict`
- `absence()`: detekce ocekavanych udalosti, ktere nikdy neprisly
- Pojmenovane udalosti s `as` pro referencovani dat v akcich
- Kompletni priklady platebniho flow a detekce timeoutu

### [5.3 Pocet a agregace](./03-pocet-a-agregace.md)

Frekvencni prahy a numericka agregace v case:
- `count()`: frekvence udalosti s klouzavymi vs pevnymi okny
- `aggregate()`: sum, avg, min, max nad numerickymi poli
- Porovnavaci operatory: `gte`, `lte`, `eq`
- Kompletni priklady detekce brute-force a skoku trzeb

### [5.4 CEP vzory v praxi](./04-cep-vzory.md)

Kombinovani vzoru pro realne systemy:
- Vicestupnove detakcni pipeline
- Kombinovani CEP s bezpymi pravidly pro udalosti/fakta
- Priklad IoT monitoring pipeline
- Vykonnostni aspekty a strategie debuggovani

## Co se naucite

Na konci teto sekce budete schopni:
- Rozpoznat, kdy business pozadavek vyzaduje temporalni pattern matching
- Pouzivat sekvencni vzory pro detekci usporadanych toku udalosti
- Pouzivat vzory absence pro detekci timeoutu a chybejicich kroku
- Pouzivat vzory poctu pro frekvencne zalozene alertovani
- Pouzivat agregacni vzory pro monitoring na zaklade prahu
- Kombinovat vice CEP vzoru do vicestupnovych detakcnich pipeline

---

Zacnete s: [Co je CEP?](./01-co-je-cep.md)
