# Část 3: Akce

Akce jsou to, co se stane, když pravidlo vyhodnotí své podmínky úspěšně. V předchozích kapitolách jste viděli `log` a `emit_event` — tato sekce pokrývá celý systém akcí, od základní manipulace s daty přes časovače a plánování až po volání externích služeb.

## Kapitoly

### [3.1 Základní akce](./01-zakladni-akce.md)

Čtyři základní akce, které každý pravidlový engine potřebuje:
- `emit_event`, `set_fact`, `delete_fact`, `log`
- Řetězcová interpolace a rozlišení referencí v hodnotách akcí
- Více akcí na pravidlo a pořadí vykonávání

### [3.2 Časovače a plánování](./02-casovace.md)

Plánování odložené práce a detekce neaktivity:
- Akce `set_timer` a `cancel_timer`
- Syntaxe trvání a konfigurace `onExpire`
- Pravidla spouštěná časovači a opakující se časovače

### [3.3 Volání externích služeb](./03-externi-sluzby.md)

Integrace pravidlového enginu s okolním světem:
- Akce `call_service` a registrace služeb
- Datové požadavky (lookups) s cachováním a strategiemi pro chyby
- Použití výsledků lookupů v podmínkách a akcích

## Co se naučíte

Na konci této sekce budete schopni:
- Používat všech sedm typů akcí k budování reaktivních řetězců pravidel
- Plánovat a rušit časovače s flexibilní syntaxí trvání
- Propojit pravidla s externími API a databázemi
- Používat řetězcovou interpolaci a reference pro dynamické akce

---

Začněte s: [Základní akce](./01-zakladni-akce.md)
