# Cast 6: Organizace pravidel

Hrstku pravidel je snadne spravovat. Ale jak vas system roste na desitky ci stovky pravidel, potrebujete strukturu: zpusob, jak povolit a zakazat souvisejici pravidla najednou, ridit, ktera pravidla se vyhodnocuji prvni, a sledovat, jak se pravidla meni v case. noex-rules poskytuje tri organizacni primitivy — **skupiny**, **tagy** a **prioritu** — plus vestavenou **verzovaci sluzbu**, ktera zaznamenava kazdou zmenu pro audit a rollback.

## Kapitoly

### [6.1 Skupiny a tagy pravidel](./01-skupiny-a-tagy.md)

Organizace pravidel do logickych celku se sdilenym zivotnim cyklem:
- Skupiny pravidel jako hlavni prepinac povoleni/zakazani
- Semantika `isRuleActive()`: `rule.enabled AND group.enabled`
- Tagy pro prurezeovou kategorizaci a filtrovani
- Pouziti: feature flagy, A/B testovani, prostredove pravidla

### [6.2 Priorita a poradi provadeni](./02-priorita-a-razeni.md)

Rizeni toho, ktera pravidla se vyhodnocuji prvni a jak engine zpracovava triggery:
- Priorita: vyssi cislo = vyhodnoceni drive
- Retezeni pravidel: akce, ktere spousti dalsi pravidla
- Vyhybani se nekonecnym smyckam s `maxConcurrency` a `debounceMs`
- Navrh poradi vyhodnocovani pravidel pro predvidatelne chovani

### [6.3 Verzovani pravidel](./03-verzovani.md)

Sledovani zmen pravidel s uplnou historii, diffy a rollbackem:
- Nastaveni `VersioningConfig` se storage adapterem
- Automaticky zaznam verzi pri kazde zmene pravidla
- Dotazovani na historii verzi s filtrovanim a strankovani
- Diffy na urovni poli mezi dvema verzemi
- Rollback na predchozi verzi

## Co se naucite

Na konci teto sekce budete schopni:
- Seskupit souvisejici pravidla a ridit jejich zivotni cyklus jednim prepinacem
- Pouzivat tagy pro flexibilni kategorizaci napric skupinami
- Nastavit priority pro rizeni poradi vyhodnocovani pravidel
- Konfigurovat soubeznot a debounce enginu pro bezpecne retezeni pravidel
- Povolit verzovani pro sledovani kazde zmeny pravidla
- Dotazovat se na historii verzi, porovnavat verze a provadet rollback

---

Zacnete s: [Skupiny a tagy pravidel](./01-skupiny-a-tagy.md)
