/** Strategie při chybě lookupu */
export type LookupErrorStrategy = 'skip' | 'fail';

/** Konfigurace cache pro lookup */
export interface LookupCacheConfig {
  /** TTL: duration string ('5m', '1h', '30s') nebo milisekundy */
  ttl: string | number;
}

/** Deklarace požadavku na externí data */
export interface DataRequirement {
  /** Unikátní název lookupu (klíč pro přístup k výsledku) */
  name: string;

  /** Název registrované služby */
  service: string;

  /** Název metody na službě */
  method: string;

  /** Argumenty volání (mohou obsahovat { ref: string } pro runtime resoluci) */
  args: unknown[];

  /** Volitelná konfigurace cache */
  cache?: LookupCacheConfig;

  /** Chování při chybě: 'skip' přeskočí pravidlo, 'fail' vyhodí výjimku. Výchozí: 'skip' */
  onError?: LookupErrorStrategy;
}
