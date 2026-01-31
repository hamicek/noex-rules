# Část 8: Pozorovatelnost

Pravidlový engine, do kterého nevidíte, je černá skříňka. Když se pravidlo nespustí, když akce trvají příliš dlouho, nebo když potřebujete compliance záznam každé změny — potřebujete pozorovatelnost. noex-rules poskytuje čtyři komplementární vrstvy: **debug tracing** pro inspekci při vývoji s breakpointy a snapshoty, **profilování** pro analýzu výkonu jednotlivých pravidel, **audit logging** pro stále zapnutý persistentní záznam pro compliance a **metriky** pro Prometheus scraping a export OpenTelemetry spanů.

## Kapitoly

### [8.1 Debugging pravidel](./01-debugging.md)

Debugging při vývoji s IDE-podobnými schopnostmi:
- Ring buffer `TraceCollector` s vyhledáváním dle korelace
- `DebugController` s breakpointy, pause/resume a snapshoty
- `HistoryService` pro kontext událostí a řetězce kauzality
- Export traců jako JSON nebo Mermaid diagramy

### [8.2 Profilování výkonu](./02-profilaci.md)

Analýza výkonu jednotlivých pravidel z trace streamu:
- `Profiler` s metrikami pro pravidla, podmínky a akce
- Hledání nejpomalejších a nejaktivnějších pravidel
- Analýza úspěšnosti a míry selhání
- REST API endpointy pro data profilování

### [8.3 Audit logging](./03-audit-log.md)

Stále zapnutý, persistentní monitoring pro compliance a produkci:
- `AuditLogService` s časově rozdělovanou persistencí
- 26 typů audit událostí v 5 kategoriích
- Flexibilní dotazování s paginací a filtrováním
- Realtime SSE streaming audit záznamů

### [8.4 Metriky a tracing](./04-metriky.md)

Produkční pozorovatelnost se standardními nástroji:
- `MetricsCollector` s Prometheus text exposition formátem
- Čítače, histogramy a gaugy pro aktivitu enginu
- `OpenTelemetryBridge` pro distribuovaný tracing
- Mapování hierarchie spanů z trace záznamů na OTel spany

## Co se naučíte

Na konci této sekce budete schopni:
- Povolit tracing a nastavit breakpointy pro ladění vyhodnocování pravidel krok po kroku
- Profilovat pravidla pro nalezení výkonnostních úzkých míst a nízkých úspěšností
- Konfigurovat persistentní audit logging pro compliance požadavky
- Vystavit Prometheus metriky a integrovat s OpenTelemetry
- Používat REST API a SSE streamy pro realtime observability dashboardy

---

Začněte s: [Debugging pravidel](./01-debugging.md)
