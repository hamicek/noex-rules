# Cast 7: Persistence a spolehlivost

Pravidlovy engine, ktery ztrati svoja pravidla pri kazdem restartu, je v produkci nepouzitelny. Totez plati pro casovace, ktere zmizi pri padu procesu. noex-rules poskytuje tri mechanismy persistence: **persistence pravidel** pro ukladani a obnovu pravidel a skupin napric restarty, **trvanlive casovace**, ktere preziji pad procesu, a **hot reload** pro aktualizaci pravidel z externich zdroju bez zastaveni enginu.

## Kapitoly

### [7.1 Persistence pravidel a faktu](./01-persistence-stavu.md)

Ukladani a obnova pravidel napric restarty enginu:
- `PersistenceConfig` a rozhrani `StorageAdapter`
- Automaticka debounced persistence pri kazde zmene pravidla
- Cyklus obnovy pri startu, finalni ulozeni pri vypnuti
- Verzovani schematu pro bezpecne migrace

### [7.2 Trvanlive casovace](./02-persistence-casovcu.md)

Casovace, ktere preziji restart procesu:
- `TimerPersistenceConfig` a durable rezim vs fallback rezim
- Jak se metadata casovcu ukladaji a obnovuji
- Opakovane casovace se sledovanim poctu spusteni
- Kdy je trvanlivost dulezita a kdy ne

### [7.3 Hot reload](./03-hot-reload.md)

Aktualizace pravidel z externich zdroju bez restartu enginu:
- `HotReloadConfig` se souborovymi a storage zdroji
- Detekce zmen na bazi pollingu s SHA-256 hashovanim
- Atomicky reload: bud se aplikuji vsechny zmeny, nebo zadne
- Validace pred aplikovanim pro prevenci vadnych pravidel

## Co se naucite

Na konci teto sekce budete schopni:
- Konfigurovat persistenci pravidel, aby pravidla prezila restarty enginu
- Porozumet automatickemu zivotnimu cyklu ulozeni/obnovy
- Nastavit trvanlive casovace, ktere preziji pady procesu
- Konfigurovat hot reload pro aktualizaci pravidel z YAML souboru nebo externiho uloziste
- Zvolit spravnou strategii persistence pro vase nasazeni

---

Zacnete s: [Persistence pravidel a faktu](./01-persistence-stavu.md)
