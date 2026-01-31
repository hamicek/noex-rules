# Část 6: Organizace pravidel

Hrstku pravidel je snadné spravovat. Ale jak váš systém roste na desítky či stovky pravidel, potřebujete strukturu: způsob, jak povolit a zakázat související pravidla najednou, řídit, která pravidla se vyhodnocují první, a sledovat, jak se pravidla mění v čase. noex-rules poskytuje tři organizační primitivy — **skupiny**, **tagy** a **prioritu** — plus vestavěnou **verzovací službu**, která zaznamenává každou změnu pro audit a rollback.

## Kapitoly

### [6.1 Skupiny a tagy pravidel](./01-skupiny-a-tagy.md)

Organizace pravidel do logických celků se sdíleným životním cyklem:
- Skupiny pravidel jako hlavní přepínač povolení/zakázání
- Sémantika `isRuleActive()`: `rule.enabled AND group.enabled`
- Tagy pro průřezovou kategorizaci a filtrování
- Použití: feature flagy, A/B testování, prostředová pravidla

### [6.2 Priorita a pořadí provádění](./02-priorita-a-razeni.md)

Řízení toho, která pravidla se vyhodnocují první a jak engine zpracovává triggery:
- Priorita: vyšší číslo = vyhodnocení dříve
- Řetězení pravidel: akce, které spouští další pravidla
- Vyhýbání se nekonečným smyčkám s `maxConcurrency` a `debounceMs`
- Návrh pořadí vyhodnocování pravidel pro předvídatelné chování

### [6.3 Verzování pravidel](./03-verzovani.md)

Sledování změn pravidel s úplnou historií, diffy a rollbackem:
- Nastavení `VersioningConfig` se storage adapterem
- Automatický záznam verzí při každé změně pravidla
- Dotazování na historii verzí s filtrováním a stránkováním
- Diffy na úrovni polí mezi dvěma verzemi
- Rollback na předchozí verzi

## Co se naučíte

Na konci této sekce budete schopni:
- Seskupit související pravidla a řídit jejich životní cyklus jedním přepínačem
- Používat tagy pro flexibilní kategorizaci napříč skupinami
- Nastavit priority pro řízení pořadí vyhodnocování pravidel
- Konfigurovat souběžnost a debounce enginu pro bezpečné řetězení pravidel
- Povolit verzování pro sledování každé změny pravidla
- Dotazovat se na historii verzí, porovnávat verze a provádět rollback

---

Začněte s: [Skupiny a tagy pravidel](./01-skupiny-a-tagy.md)
