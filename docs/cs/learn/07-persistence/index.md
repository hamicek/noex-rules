# Část 7: Persistence a spolehlivost

Pravidlový engine, který ztratí svá pravidla při každém restartu, je v produkci nepoužitelný. Totéž platí pro časovače, které zmizí při pádu procesu. noex-rules poskytuje tři mechanismy persistence: **persistence pravidel** pro ukládání a obnovu pravidel a skupin napříč restarty, **trvanlivé časovače**, které přežijí pád procesu, a **hot reload** pro aktualizaci pravidel z externích zdrojů bez zastavení enginu.

## Kapitoly

### [7.1 Persistence pravidel a faktů](./01-persistence-stavu.md)

Ukládání a obnova pravidel napříč restarty enginu:
- `PersistenceConfig` a rozhraní `StorageAdapter`
- Automatická debounced persistence při každé změně pravidla
- Cyklus obnovy při startu, finální uložení při vypnutí
- Verzování schématu pro bezpečné migrace

### [7.2 Trvanlivé časovače](./02-persistence-casovcu.md)

Časovače, které přežijí restart procesu:
- `TimerPersistenceConfig` a durable režim vs fallback režim
- Jak se metadata časovačů ukládají a obnovují
- Opakované časovače se sledováním počtu spuštění
- Kdy je trvanlivost důležitá a kdy ne

### [7.3 Hot reload](./03-hot-reload.md)

Aktualizace pravidel z externích zdrojů bez restartu enginu:
- `HotReloadConfig` se souborovými a storage zdroji
- Detekce změn na bázi pollingu s SHA-256 hashováním
- Atomický reload: buď se aplikují všechny změny, nebo žádné
- Validace před aplikováním pro prevenci vadných pravidel

## Co se naučíte

Na konci této sekce budete schopni:
- Konfigurovat persistenci pravidel, aby pravidla přežila restarty enginu
- Porozumět automatickému životnímu cyklu uložení/obnovy
- Nastavit trvanlivé časovače, které přežijí pády procesu
- Konfigurovat hot reload pro aktualizaci pravidel z YAML souborů nebo externího úložiště
- Zvolit správnou strategii persistence pro vaše nasazení

---

Začněte s: [Persistence pravidel a faktů](./01-persistence-stavu.md)
