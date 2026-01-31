# Cast 8: Pozorovatelnost

Pravidlovy engine, do ktereho nevidite, je cerna skrinka. Kdyz se pravidlo nespusti, kdyz akce trvaji prilis dlouho, nebo kdyz potrebujete compliance zaznam kazde zmeny — potrebujete pozorovatelnost. noex-rules poskytuje ctyri komplementarni vrstvy: **debug tracing** pro inspekci pri vyvoji s breakpointy a snapshoty, **profilovani** pro analyzu vykonu jednotlivych pravidel, **audit logging** pro stale zapnuty persistentni zaznam pro compliance a **metriky** pro Prometheus scraping a export OpenTelemetry spanu.

## Kapitoly

### [8.1 Debugging pravidel](./01-debugging.md)

Debugging pri vyvoji s IDE-podobnymi schopnostmi:
- Ring buffer `TraceCollector` s vyhledavanim dle korelace
- `DebugController` s breakpointy, pause/resume a snapshoty
- `HistoryService` pro kontext udalosti a retezce kauzality
- Export tracu jako JSON nebo Mermaid diagramy

### [8.2 Profilovani vykonu](./02-profilaci.md)

Analyza vykonu jednotlivych pravidel z trace streamu:
- `Profiler` s metrikami pro pravidla, podminky a akce
- Hledani nejpomalejsich a nejaktivnejsich pravidel
- Analyza uspesnosti a miry selhani
- REST API endpointy pro data profilovani

### [8.3 Audit logging](./03-audit-log.md)

Stale zapnuty, persistentni monitoring pro compliance a produkci:
- `AuditLogService` s casove rozdelovanou persistenci
- 26 typu audit udalosti v 5 kategoriich
- Flexibilni dotazovani s paginaci a filtrovanim
- Realtime SSE streaming audit zaznamu

### [8.4 Metriky a tracing](./04-metriky.md)

Produkcni pozorovatelnost se standardnimi nastroji:
- `MetricsCollector` s Prometheus text exposition formatem
- Citace, histogramy a gaugy pro aktivitu enginu
- `OpenTelemetryBridge` pro distribuovany tracing
- Mapovani hierarchie spanu z trace zaznamu na OTel spany

## Co se naucite

Na konci teto sekce budete schopni:
- Povolit tracing a nastavit breakpointy pro ladeni vyhodnocovani pravidel krok po kroku
- Profilovat pravidla pro nalezeni vykonnostnich uzskych mist a nizkych uspesnosti
- Konfigurovat persistentni audit logging pro compliance pozadavky
- Vystavit Prometheus metriky a integrovat s OpenTelemetry
- Pouzivat REST API a SSE streamy pro realtime observability dashboardy

---

Zacnete s: [Debugging pravidel](./01-debugging.md)
