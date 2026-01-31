# Cast 9: Zpetne retezeni

Forward chaining — vychozi rezim noex-rules — je **rizeny daty**: udalosti a fakta prochazi pravidly a produji nove fakta a udalosti. Ale nekdy potrebujete polozit opacnou otazku: "**Je tento cil dosazitelny?**" Zpetne retezeni obrati smer. Na zaklade cile (faktu nebo udalosti, ktery chcete, aby platil) engine prochazi graf pravidel pozpatku, hleda pravidla, jejichz akce cil produji, a rekurzivne overuje, zda jejich podminky lze splnit. Vysledkem je **dukazovy strom**, ktery presne vysvetli, proc cil je nebo neni dosazitelny — aniz by modifikoval jakykoli stav enginu.

## Kapitoly

### [9.1 Dopredne vs zpetne retezeni](./01-dopredu-vs-zpet.md)

Dve komplementarni strategie uvazovani:
- Rekapitulace forward chainingu: data prochazi pravidly a produji zavery
- Backward chaining: zacnete od cile a postupujte zpet pres podminky pravidel
- Kdy pouzit ktery pristup a jak se navzajem doplnuji
- Srovnavaci tabulka a rozhodovaci kriteria

### [9.2 Dotazovani cilu](./02-dotazovani-cilu.md)

Kompletni API zpetneho retezeni:
- Typy `FactGoal` a `EventGoal` s DSL buildery
- Metoda `engine.query()` a `BackwardChainingConfig`
- `QueryResult` a struktura dukazoveho stromu (union `ProofNode`)
- Retezeni pravidel, detekce cyklu a limity hloubky
- Kompletni priklad overovani zpusobilosti s viceurovnovymi dukazovymi stromy

## Co se naucite

Na konci teto sekce budete schopni:
- Vysvetlit rozdil mezi doprednym a zpetnym retezenim
- Zvolit spravnou strategii uvazovani pro dany problem
- Dotazovat engine pomoci builderu `factGoal()` a `eventGoal()`
- Cist a interpretovat dukazove stromy pro pochopeni, proc cile uspely nebo selhaly
- Konfigurovat limity hloubky a poctu pravidel pro dotazy zpetneho retezeni
- Pouzivat zpetne retezeni pro overovani zpusobilosti, validaci predpokladu a analyzu dopadu

---

Zacnete s: [Dopredne vs zpetne retezeni](./01-dopredu-vs-zpet.md)
