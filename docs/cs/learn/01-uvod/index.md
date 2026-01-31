# Část 1: Úvod

Tato sekce vysvětluje, proč pravidlový engine existuje, a představuje základní koncepty, které budete používat v celém frameworku.

## Kapitoly

### [1.1 Proč pravidlový engine?](./01-proc-pravidla.md)

Dozvíte se o problémech s hardcoded business logikou a jak pravidlový engine poskytuje strukturovanou alternativu:
- if/else řetězce, které přerostou v neudržitelné spleteniny
- Business pravidla roztroušená po celém kódu
- Těsná vazba mezi logikou a aplikačním kódem

### [1.2 Klíčové koncepty](./02-klicove-koncepty.md)

Přehled základních stavebních bloků:
- **Pravidla** - Trojice trigger-podmínka-akce
- **Fakta** - Perzistentní stav, nad kterým engine uvažuje
- **Události** - Jednorázové signály spouštějící vyhodnocení
- **Časovače** - Naplánované budoucí akce
- **Forward Chaining** - Vyhodnocení pravidel řízené daty
- **CEP** - Detekce temporálních vzorů napříč událostmi

## Co se naučíte

Na konci této sekce porozumíte:
- Proč záleží na extrakci business pravidel z aplikačního kódu
- Jak funguje model trigger-podmínka-akce
- Co dělá každá komponenta enginu
- Jak fakta, události a časovače řídí vyhodnocení pravidel

---

Začněte s: [Proč pravidlový engine?](./01-proc-pravidla.md)
