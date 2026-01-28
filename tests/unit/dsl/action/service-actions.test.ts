import { describe, it, expect } from 'vitest';
import { callService } from '../../../../src/dsl/action/service-actions';
import { ref } from '../../../../src/dsl/helpers/ref';

describe('callService', () => {
  describe('with direct arguments', () => {
    it('creates call_service action with method and no args', () => {
      const action = callService('paymentService', 'healthCheck').build();

      expect(action).toEqual({
        type: 'call_service',
        service: 'paymentService',
        method: 'healthCheck',
        args: [],
      });
    });

    it('creates call_service action with method and args', () => {
      const action = callService('paymentService', 'processPayment', [
        'order-123',
        100,
      ]).build();

      expect(action).toEqual({
        type: 'call_service',
        service: 'paymentService',
        method: 'processPayment',
        args: ['order-123', 100],
      });
    });

    it('normalizes ref values in args', () => {
      const action = callService('orderService', 'cancel', [
        ref('event.orderId'),
        'reason',
        ref('event.userId'),
      ]).build();

      expect(action).toEqual({
        type: 'call_service',
        service: 'orderService',
        method: 'cancel',
        args: [{ ref: 'event.orderId' }, 'reason', { ref: 'event.userId' }],
      });
    });

    it('handles empty args array', () => {
      const action = callService('cacheService', 'flush', []).build();

      expect(action).toEqual({
        type: 'call_service',
        service: 'cacheService',
        method: 'flush',
        args: [],
      });
    });

    it('handles mixed arg types including objects and arrays', () => {
      const action = callService('notificationService', 'send', [
        { email: 'test@example.com' },
        ['sms', 'email'],
        true,
        42,
      ]).build();

      expect(action).toEqual({
        type: 'call_service',
        service: 'notificationService',
        method: 'send',
        args: [{ email: 'test@example.com' }, ['sms', 'email'], true, 42],
      });
    });
  });

  describe('with fluent API', () => {
    it('creates call_service action with fluent builder', () => {
      const action = callService('paymentService')
        .method('processPayment')
        .args('order-123', 100)
        .build();

      expect(action).toEqual({
        type: 'call_service',
        service: 'paymentService',
        method: 'processPayment',
        args: ['order-123', 100],
      });
    });

    it('normalizes ref values in fluent args', () => {
      const action = callService('orderService')
        .method('updateStatus')
        .args(ref('event.orderId'), 'shipped', ref('context.timestamp'))
        .build();

      expect(action).toEqual({
        type: 'call_service',
        service: 'orderService',
        method: 'updateStatus',
        args: [
          { ref: 'event.orderId' },
          'shipped',
          { ref: 'context.timestamp' },
        ],
      });
    });

    it('creates action without args when args() not called', () => {
      const action = callService('healthService')
        .method('ping')
        .build();

      expect(action).toEqual({
        type: 'call_service',
        service: 'healthService',
        method: 'ping',
        args: [],
      });
    });

    it('throws error when method() not called', () => {
      expect(() => {
        callService('incompleteService').build();
      }).toThrow('callService("incompleteService") requires method name');
    });

    it('allows method chaining in any order', () => {
      const action = callService('analyticsService')
        .args('event-data', 42)
        .method('track')
        .build();

      expect(action).toEqual({
        type: 'call_service',
        service: 'analyticsService',
        method: 'track',
        args: ['event-data', 42],
      });
    });

    it('last args() call wins', () => {
      const action = callService('service')
        .method('doSomething')
        .args('first')
        .args('second', 'third')
        .build();

      expect(action).toEqual({
        type: 'call_service',
        service: 'service',
        method: 'doSomething',
        args: ['second', 'third'],
      });
    });
  });
});
