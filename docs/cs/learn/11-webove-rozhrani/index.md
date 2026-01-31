# Cast 11: Webove rozhrani

Predchozi kapitoly pokryly REST, GraphQL, SSE a CLI rozhrani — vsechna jsou vykonna, ale textova. noex-rules obsahuje take plnohodnotne **webove rozhrani postavene na Reactu**, ktere poskytuje vizualni dashboard pro spravu celeho pravidloveho enginu. Pripojuje se k serveru pres GraphQL a SSE a nabizi real-time monitoring, upravu pravidel s formularovym a vizualnim flow editorem, prohlizenifaktu, testovani eventu, spravu casovcu, prohlizeni audit logu a historii verzi — vse z prohlizece.

## Kapitoly

### [11.1 Zaciname s webovym rozhranim](./01-zaciname-s-ui.md)

Spustte UI a prozkoumejte dashboard:
- Instalace a registrace UI Fastify pluginu pomoci `registerUI()`
- Prehled dashboardu: zdravi enginu, statisticke karty, navigacni bocni panel
- Sprava pravidel, faktu, eventu, casovcu, skupin a audit logu pres prohlizec
- Real-time streaming eventu s filtrovanim patternu, pause/resume a testovacim emitovanim
- Nastaveni: pripojeni k serveru, motiv (svetly/tmavy), predvolby zobrazeni, notifikace
- Klavesove zkratky pro rychlou navigaci

### [11.2 Vizualni tvorba pravidel](./02-vizualni-tvorba-pravidel.md)

Tvorte a upravujte pravidla vizualne:
- Zalozky detailu pravidla: formularovy editor, YAML editor, flow diagram, historie verzi
- RuleForm: metadata, vyber triggeru, builder podminek, builder akci se Zod validaci
- Flow vizualizace: jak `ruleToFlow()` prevadi trigger, podminky a akce na React Flow graf
- Uprava pravidel pres YAML editor se zvyraznenim syntaxe
- Casova osa historie verzi s diffy a rollbackem
- Kompletni navod: vytvoreni pravidla s vice podminkkami pres UI

## Co se naucite

Na konci teto sekce budete schopni:
- Nainstalovat a servovat webove rozhrani spolecne se serverem pravidloveho enginu
- Monitorovat zdravi enginu, statistiky a real-time eventy z dashboardu
- Vytvaret, upravovat, povolit, zakazat a mazat pravidla pres formularovy a YAML editor
- Vizualizovat logiku pravidel jako interaktivni flow diagramy s uzly triggeru, podminek a akci
- Spravovat fakta, casovace, skupiny a audit logy pres vyhrazene stranky prohlizece
- Emitovat testovaci eventy primo z UI a sledovat jejich pruchod pravidly v realnem case
- Navigovat cele UI pomoci klavesovych zkratek

---

Zacnete s: [Zaciname s webovym rozhranim](./01-zaciname-s-ui.md)
