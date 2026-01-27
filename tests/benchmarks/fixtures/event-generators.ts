import type { Event } from '../../../src/types/event.js';
import { generateId } from '../../../src/utils/id-generator.js';

const DEFAULT_TOPICS = [
  'order.created', 'order.updated', 'order.cancelled', 'order.completed',
  'payment.initiated', 'payment.completed', 'payment.failed',
  'user.registered', 'user.logged_in', 'user.profile_updated',
  'inventory.updated', 'inventory.low_stock', 'inventory.out_of_stock',
  'shipping.dispatched', 'shipping.delivered', 'shipping.returned'
];

const SOURCES = [
  'api-gateway', 'web-frontend', 'mobile-app',
  'batch-processor', 'cron-job', 'external-webhook'
];

export interface EventGeneratorOptions {
  topic?: string;
  source?: string;
  correlationId?: string;
  causationId?: string;
  timestamp?: number;
  data?: Record<string, unknown>;
}

export interface BulkEventGeneratorOptions extends EventGeneratorOptions {
  topicDistribution?: string[];
  timeSpanMs?: number;
  correlationGroups?: number;
}

function randomElement<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateEventData(topic: string, index: number): Record<string, unknown> {
  const [domain, action] = topic.split('.');

  const baseData: Record<string, unknown> = {
    eventIndex: index,
    processedAt: Date.now()
  };

  switch (domain) {
    case 'order':
      return {
        ...baseData,
        orderId: `ORD-${index.toString().padStart(8, '0')}`,
        customerId: `CUST-${(index % 1000).toString().padStart(6, '0')}`,
        total: Math.round((50 + Math.random() * 950) * 100) / 100,
        items: randomInt(1, 10),
        currency: 'USD',
        status: action
      };

    case 'payment':
      return {
        ...baseData,
        paymentId: `PAY-${index.toString().padStart(8, '0')}`,
        orderId: `ORD-${index.toString().padStart(8, '0')}`,
        amount: Math.round((10 + Math.random() * 990) * 100) / 100,
        method: ['card', 'bank_transfer', 'wallet'][index % 3],
        status: action
      };

    case 'user':
      return {
        ...baseData,
        userId: `USR-${index.toString().padStart(8, '0')}`,
        email: `user${index}@example.com`,
        tier: ['free', 'basic', 'premium', 'enterprise'][index % 4],
        action
      };

    case 'inventory':
      return {
        ...baseData,
        productId: `PROD-${(index % 500).toString().padStart(6, '0')}`,
        sku: `SKU-${index}`,
        quantity: randomInt(0, 1000),
        warehouseId: `WH-${(index % 5).toString().padStart(2, '0')}`,
        action
      };

    case 'shipping':
      return {
        ...baseData,
        shipmentId: `SHIP-${index.toString().padStart(8, '0')}`,
        orderId: `ORD-${index.toString().padStart(8, '0')}`,
        carrier: ['fedex', 'ups', 'dhl', 'usps'][index % 4],
        trackingNumber: `TRK${index}${Date.now()}`,
        status: action
      };

    default:
      return {
        ...baseData,
        domain,
        action,
        genericField: `value_${index}`
      };
  }
}

export function generateEvent(index: number, options: EventGeneratorOptions = {}): Event {
  const topic = options.topic ?? randomElement(DEFAULT_TOPICS);

  return {
    id: generateId(),
    topic,
    data: options.data ?? generateEventData(topic, index),
    timestamp: options.timestamp ?? Date.now(),
    correlationId: options.correlationId,
    causationId: options.causationId,
    source: options.source ?? randomElement(SOURCES)
  };
}

export function generateEvents(count: number, options: BulkEventGeneratorOptions = {}): Event[] {
  const {
    topicDistribution = DEFAULT_TOPICS,
    timeSpanMs = 0,
    correlationGroups = 0
  } = options;

  const events: Event[] = [];
  const baseTimestamp = Date.now();
  const correlationIds = correlationGroups > 0
    ? Array.from({ length: correlationGroups }, (_, i) => `corr_${i}`)
    : [];

  for (let i = 0; i < count; i++) {
    const topic = topicDistribution[i % topicDistribution.length];
    const timestamp = timeSpanMs > 0
      ? baseTimestamp - Math.floor(Math.random() * timeSpanMs)
      : baseTimestamp;
    const correlationId = correlationIds.length > 0
      ? correlationIds[i % correlationIds.length]
      : undefined;

    events.push(generateEvent(i, {
      ...options,
      topic,
      timestamp,
      correlationId
    }));
  }

  return events;
}

export function generateEventSequence(
  topics: string[],
  options: { groupBy?: string; delayBetweenMs?: number } = {}
): Event[] {
  const { groupBy, delayBetweenMs = 1000 } = options;
  const correlationId = groupBy ?? generateId();
  const baseTimestamp = Date.now();

  return topics.map((topic, index) => generateEvent(index, {
    topic,
    correlationId,
    timestamp: baseTimestamp + (index * delayBetweenMs),
    causationId: index > 0 ? `causation_${index - 1}` : undefined
  }));
}

export function generateEventsForTopic(topic: string, count: number): Event[] {
  return generateEvents(count, { topic, topicDistribution: [topic] });
}

export function generateCorrelatedEventGroups(
  groupCount: number,
  eventsPerGroup: number,
  topics: string[]
): Event[][] {
  const groups: Event[][] = [];

  for (let g = 0; g < groupCount; g++) {
    const correlationId = `group_${g}`;
    const groupEvents: Event[] = [];

    for (let e = 0; e < eventsPerGroup; e++) {
      groupEvents.push(generateEvent(g * eventsPerGroup + e, {
        topic: topics[e % topics.length],
        correlationId,
        timestamp: Date.now() + (e * 100)
      }));
    }

    groups.push(groupEvents);
  }

  return groups;
}

export function generateTimeRangeEvents(
  count: number,
  startMs: number,
  endMs: number,
  topic?: string
): Event[] {
  const timeRange = endMs - startMs;
  const events: Event[] = [];

  for (let i = 0; i < count; i++) {
    const timestamp = startMs + Math.floor((i / count) * timeRange);
    events.push(generateEvent(i, {
      topic: topic ?? randomElement(DEFAULT_TOPICS),
      timestamp
    }));
  }

  return events;
}

export function generateHighFrequencyEvents(
  count: number,
  topic: string,
  intervalMs: number = 10
): Event[] {
  const baseTimestamp = Date.now();

  return Array.from({ length: count }, (_, i) =>
    generateEvent(i, {
      topic,
      timestamp: baseTimestamp + (i * intervalMs)
    })
  );
}

export { DEFAULT_TOPICS, SOURCES };
