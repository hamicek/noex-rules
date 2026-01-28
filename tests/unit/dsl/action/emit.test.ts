import { describe, it, expect } from 'vitest';
import { emit } from '../../../../src/dsl/action/emit';
import { ref } from '../../../../src/dsl/helpers/ref';

describe('emit', () => {
  it('creates emit_event action with topic and data', () => {
    const action = emit('notification.send', {
      message: 'Hello',
      priority: 'high',
    }).build();

    expect(action).toEqual({
      type: 'emit_event',
      topic: 'notification.send',
      data: {
        message: 'Hello',
        priority: 'high',
      },
    });
  });

  it('creates emit_event action without data', () => {
    const action = emit('system.ping').build();

    expect(action).toEqual({
      type: 'emit_event',
      topic: 'system.ping',
      data: {},
    });
  });

  it('normalizes ref values in data', () => {
    const action = emit('order.processed', {
      orderId: ref('event.orderId'),
      amount: ref('event.total'),
      timestamp: Date.now(),
    }).build();

    expect(action).toEqual({
      type: 'emit_event',
      topic: 'order.processed',
      data: {
        orderId: { ref: 'event.orderId' },
        amount: { ref: 'event.total' },
        timestamp: expect.any(Number),
      },
    });
  });

  it('handles mixed literal and ref values', () => {
    const action = emit('mixed.event', {
      literal: 'value',
      number: 42,
      ref: ref('event.dynamic'),
      nested: { key: 'value' },
    }).build();

    expect(action.data).toEqual({
      literal: 'value',
      number: 42,
      ref: { ref: 'event.dynamic' },
      nested: { key: 'value' },
    });
  });
});
