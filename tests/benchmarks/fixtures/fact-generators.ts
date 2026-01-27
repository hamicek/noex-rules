import type { Fact } from '../../../src/types/fact.js';

const DOMAINS = [
  'customer', 'order', 'product', 'inventory',
  'config', 'session', 'cache', 'analytics'
];

const PROPERTIES = {
  customer: ['name', 'email', 'age', 'status', 'tier', 'balance', 'lastLogin', 'preferences'],
  order: ['status', 'total', 'items', 'shippingAddress', 'createdAt', 'updatedAt'],
  product: ['name', 'price', 'stock', 'category', 'rating', 'reviews'],
  inventory: ['quantity', 'reserved', 'available', 'reorderPoint', 'lastUpdated'],
  config: ['enabled', 'threshold', 'limit', 'timeout', 'retries', 'feature'],
  session: ['userId', 'token', 'expiresAt', 'device', 'ip'],
  cache: ['value', 'ttl', 'hits', 'misses'],
  analytics: ['views', 'clicks', 'conversions', 'revenue', 'bounceRate']
};

const SOURCES = ['system', 'api', 'rule-engine', 'import', 'migration', 'webhook'];

export interface FactGeneratorOptions {
  domain?: string;
  property?: string;
  source?: string;
  timestamp?: number;
  version?: number;
}

export interface BulkFactGeneratorOptions extends FactGeneratorOptions {
  entityCount?: number;
  propertiesPerEntity?: number;
  domains?: string[];
}

function randomElement<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateFactValue(domain: string, property: string, entityId: number): unknown {
  const key = `${domain}.${property}`;

  switch (key) {
    case 'customer.name':
      return `Customer ${entityId}`;
    case 'customer.email':
      return `customer${entityId}@example.com`;
    case 'customer.age':
      return 18 + (entityId % 62);
    case 'customer.status':
      return ['active', 'inactive', 'pending', 'suspended'][entityId % 4];
    case 'customer.tier':
      return ['free', 'basic', 'premium', 'enterprise'][entityId % 4];
    case 'customer.balance':
      return Math.round((Math.random() * 10000) * 100) / 100;
    case 'customer.lastLogin':
      return Date.now() - randomInt(0, 30 * 24 * 60 * 60 * 1000);
    case 'customer.preferences':
      return { theme: 'dark', notifications: true, language: 'en' };

    case 'order.status':
      return ['pending', 'processing', 'shipped', 'delivered', 'cancelled'][entityId % 5];
    case 'order.total':
      return Math.round((50 + Math.random() * 950) * 100) / 100;
    case 'order.items':
      return randomInt(1, 20);
    case 'order.shippingAddress':
      return { city: `City ${entityId % 100}`, country: 'US' };
    case 'order.createdAt':
    case 'order.updatedAt':
      return Date.now() - randomInt(0, 90 * 24 * 60 * 60 * 1000);

    case 'product.name':
      return `Product ${entityId}`;
    case 'product.price':
      return Math.round((5 + Math.random() * 495) * 100) / 100;
    case 'product.stock':
      return randomInt(0, 1000);
    case 'product.category':
      return ['electronics', 'clothing', 'food', 'home', 'sports'][entityId % 5];
    case 'product.rating':
      return Math.round((1 + Math.random() * 4) * 10) / 10;
    case 'product.reviews':
      return randomInt(0, 500);

    case 'inventory.quantity':
      return randomInt(0, 10000);
    case 'inventory.reserved':
      return randomInt(0, 100);
    case 'inventory.available':
      return randomInt(0, 9900);
    case 'inventory.reorderPoint':
      return randomInt(10, 100);
    case 'inventory.lastUpdated':
      return Date.now() - randomInt(0, 7 * 24 * 60 * 60 * 1000);

    case 'config.enabled':
    case 'config.feature':
      return entityId % 2 === 0;
    case 'config.threshold':
      return randomInt(1, 100);
    case 'config.limit':
      return randomInt(100, 10000);
    case 'config.timeout':
      return randomInt(1000, 60000);
    case 'config.retries':
      return randomInt(1, 5);

    case 'session.userId':
      return `user_${entityId}`;
    case 'session.token':
      return `token_${entityId}_${Date.now()}`;
    case 'session.expiresAt':
      return Date.now() + randomInt(3600000, 86400000);
    case 'session.device':
      return ['desktop', 'mobile', 'tablet'][entityId % 3];
    case 'session.ip':
      return `192.168.${entityId % 256}.${(entityId * 7) % 256}`;

    case 'cache.value':
      return { cached: true, data: `cached_${entityId}` };
    case 'cache.ttl':
      return randomInt(60, 3600);
    case 'cache.hits':
      return randomInt(0, 10000);
    case 'cache.misses':
      return randomInt(0, 1000);

    case 'analytics.views':
      return randomInt(0, 100000);
    case 'analytics.clicks':
      return randomInt(0, 50000);
    case 'analytics.conversions':
      return randomInt(0, 5000);
    case 'analytics.revenue':
      return Math.round((Math.random() * 100000) * 100) / 100;
    case 'analytics.bounceRate':
      return Math.round(Math.random() * 100 * 100) / 100;

    default:
      return `value_${entityId}_${property}`;
  }
}

export function generateFactKey(
  domain: string,
  entityId: number | string,
  property: string
): string {
  return `${domain}:${entityId}:${property}`;
}

export function generateFact(
  domain: string,
  entityId: number,
  property: string,
  options: FactGeneratorOptions = {}
): Fact {
  return {
    key: generateFactKey(domain, entityId, property),
    value: generateFactValue(domain, property, entityId),
    timestamp: options.timestamp ?? Date.now(),
    source: options.source ?? randomElement(SOURCES),
    version: options.version ?? 1
  };
}

export function generateFacts(count: number, options: BulkFactGeneratorOptions = {}): Fact[] {
  const {
    domains = DOMAINS,
    source,
    timestamp
  } = options;

  const facts: Fact[] = [];

  for (let i = 0; i < count; i++) {
    const domain = domains[i % domains.length];
    const domainProps = PROPERTIES[domain as keyof typeof PROPERTIES] ?? ['value'];
    const property = domainProps[i % domainProps.length];
    const entityId = Math.floor(i / domainProps.length) * domains.length + domains.indexOf(domain);

    facts.push(generateFact(domain, entityId * 1000 + i, property, { source, timestamp }));
  }

  return facts;
}

export function generateFactsForDomain(
  domain: string,
  entityCount: number,
  properties?: string[]
): Fact[] {
  const domainProps = properties ?? PROPERTIES[domain as keyof typeof PROPERTIES] ?? ['value'];
  const facts: Fact[] = [];

  for (let e = 0; e < entityCount; e++) {
    for (const property of domainProps) {
      facts.push(generateFact(domain, e, property));
    }
  }

  return facts;
}

export function generateHierarchicalFacts(
  levels: number,
  breadth: number,
  leafProperties: string[] = ['value', 'status', 'count']
): Fact[] {
  const facts: Fact[] = [];

  function traverse(path: string[], depth: number): void {
    if (depth === levels) {
      for (const prop of leafProperties) {
        const key = [...path, prop].join(':');
        facts.push({
          key,
          value: `leaf_${path.join('_')}_${prop}`,
          timestamp: Date.now(),
          source: 'generator',
          version: 1
        });
      }
      return;
    }

    for (let i = 0; i < breadth; i++) {
      traverse([...path, `node_${i}`], depth + 1);
    }
  }

  traverse(['root'], 0);
  return facts;
}

export function generatePatternMatchingFacts(
  patterns: string[],
  instancesPerPattern: number
): Map<string, Fact[]> {
  const result = new Map<string, Fact[]>();

  for (const pattern of patterns) {
    const facts: Fact[] = [];
    const segments = pattern.split(':');

    for (let i = 0; i < instancesPerPattern; i++) {
      const key = segments
        .map(seg => seg === '*' ? `id_${i}` : seg)
        .join(':');

      facts.push({
        key,
        value: { patternIndex: i, pattern },
        timestamp: Date.now(),
        source: 'pattern-generator',
        version: 1
      });
    }

    result.set(pattern, facts);
  }

  return result;
}

export function generateFactsWithVersionHistory(
  key: string,
  versions: number
): Fact[] {
  const facts: Fact[] = [];
  const baseTimestamp = Date.now() - (versions * 1000);

  for (let v = 1; v <= versions; v++) {
    facts.push({
      key,
      value: `value_v${v}`,
      timestamp: baseTimestamp + (v * 1000),
      source: 'version-generator',
      version: v
    });
  }

  return facts;
}

export function generateScalabilityFacts(scales: number[]): Map<number, Fact[]> {
  const result = new Map<number, Fact[]>();

  for (const scale of scales) {
    result.set(scale, generateFacts(scale));
  }

  return result;
}

export { DOMAINS, PROPERTIES, SOURCES };
