# Část 11: Webové rozhraní

Předchozí kapitoly pokryly REST, GraphQL, SSE a CLI rozhraní — všechna jsou výkonná, ale textová. noex-rules obsahuje také plnohodnotné **webové rozhraní postavené na Reactu**, které poskytuje vizuální dashboard pro správu celého pravidlového enginu. Připojuje se k serveru přes GraphQL a SSE a nabízí real-time monitoring, úpravu pravidel s formulářovým a vizuálním flow editorem, prohlížení faktů, testování eventů, správu časovačů, prohlížení audit logů a historii verzí — vše z prohlížeče.

## Kapitoly

### [11.1 Začínáme s webovým rozhraním](./01-zaciname-s-ui.md)

Spusťte UI a prozkoumejte dashboard:
- Instalace a registrace UI Fastify pluginu pomocí `registerUI()`
- Přehled dashboardu: zdraví enginu, statistické karty, navigační boční panel
- Správa pravidel, faktů, eventů, časovačů, skupin a audit logů přes prohlížeč
- Real-time streaming eventů s filtrováním patternů, pause/resume a testovacím emitováním
- Nastavení: připojení k serveru, motiv (světlý/tmavý), předvolby zobrazení, notifikace
- Klávesové zkratky pro rychlou navigaci

### [11.2 Vizuální tvorba pravidel](./02-vizualni-tvorba-pravidel.md)

Tvořte a upravujte pravidla vizuálně:
- Záložky detailu pravidla: formulářový editor, YAML editor, flow diagram, historie verzí
- RuleForm: metadata, výběr triggeru, builder podmínek, builder akcí se Zod validací
- Flow vizualizace: jak `ruleToFlow()` převádí trigger, podmínky a akce na React Flow graf
- Úprava pravidel přes YAML editor se zvýrazněním syntaxe
- Časová osa historie verzí s diffy a rollbackem
- Kompletní návod: vytvoření pravidla s více podmínkami přes UI

## Co se naučíte

Na konci této sekce budete schopni:
- Nainstalovat a servovat webové rozhraní společně se serverem pravidlového enginu
- Monitorovat zdraví enginu, statistiky a real-time eventy z dashboardu
- Vytvářet, upravovat, povolit, zakázat a mazat pravidla přes formulářový a YAML editor
- Vizualizovat logiku pravidel jako interaktivní flow diagramy s uzly triggeru, podmínek a akcí
- Spravovat fakta, časovače, skupiny a audit logy přes vyhrazené stránky prohlížeče
- Emitovat testovací eventy přímo z UI a sledovat jejich průchod pravidly v reálném čase
- Navigovat celé UI pomocí klávesových zkratek

---

Začněte s: [Začínáme s webovým rozhraním](./01-zaciname-s-ui.md)
