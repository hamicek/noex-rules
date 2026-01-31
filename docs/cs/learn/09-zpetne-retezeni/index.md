# Část 9: Zpětné řetězení

Forward chaining — výchozí režim noex-rules — je **řízený daty**: události a fakta procházejí pravidly a produkují nové fakta a události. Ale někdy potřebujete položit opačnou otázku: "**Je tento cíl dosažitelný?**" Zpětné řetězení obrátí směr. Na základě cíle (faktu nebo události, který chcete, aby platil) engine prochází graf pravidel pozpátku, hledá pravidla, jejichž akce cíl produkují, a rekurzivně ověřuje, zda jejich podmínky lze splnit. Výsledkem je **důkazový strom**, který přesně vysvětlí, proč cíl je nebo není dosažitelný — aniž by modifikoval jakýkoli stav enginu.

## Kapitoly

### [9.1 Dopředné vs zpětné řetězení](./01-dopredu-vs-zpet.md)

Dvě komplementární strategie uvažování:
- Rekapitulace forward chainingu: data procházejí pravidly a produkují závěry
- Backward chaining: začněte od cíle a postupujte zpět přes podmínky pravidel
- Kdy použít který přístup a jak se navzájem doplňují
- Srovnávací tabulka a rozhodovací kritéria

### [9.2 Dotazování cílů](./02-dotazovani-cilu.md)

Kompletní API zpětného řetězení:
- Typy `FactGoal` a `EventGoal` s DSL buildery
- Metoda `engine.query()` a `BackwardChainingConfig`
- `QueryResult` a struktura důkazového stromu (union `ProofNode`)
- Řetězení pravidel, detekce cyklů a limity hloubky
- Kompletní příklad ověřování způsobilosti s víceúrovňovými důkazovými stromy

## Co se naučíte

Na konci této sekce budete schopni:
- Vysvětlit rozdíl mezi dopředným a zpětným řetězením
- Zvolit správnou strategii uvažování pro daný problém
- Dotazovat engine pomocí builderů `factGoal()` a `eventGoal()`
- Číst a interpretovat důkazové stromy pro pochopení, proč cíle uspěly nebo selhaly
- Konfigurovat limity hloubky a počtu pravidel pro dotazy zpětného řetězení
- Používat zpětné řetězení pro ověřování způsobilosti, validaci předpokladů a analýzu dopadu

---

Začněte s: [Dopředné vs zpětné řetězení](./01-dopredu-vs-zpet.md)
