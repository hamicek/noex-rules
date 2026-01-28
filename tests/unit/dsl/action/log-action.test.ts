import { describe, it, expect } from 'vitest';
import { log } from '../../../../src/dsl/action/log-action';

describe('log', () => {
  describe('with explicit level', () => {
    it('creates log action with debug level', () => {
      const action = log('debug', 'Variable value: ${event.value}').build();

      expect(action).toEqual({
        type: 'log',
        level: 'debug',
        message: 'Variable value: ${event.value}',
      });
    });

    it('creates log action with info level', () => {
      const action = log('info', 'Processing order ${event.orderId}').build();

      expect(action).toEqual({
        type: 'log',
        level: 'info',
        message: 'Processing order ${event.orderId}',
      });
    });

    it('creates log action with warn level', () => {
      const action = log('warn', 'Unusual activity detected').build();

      expect(action).toEqual({
        type: 'log',
        level: 'warn',
        message: 'Unusual activity detected',
      });
    });

    it('creates log action with error level', () => {
      const action = log(
        'error',
        'Payment failed for order ${event.orderId}'
      ).build();

      expect(action).toEqual({
        type: 'log',
        level: 'error',
        message: 'Payment failed for order ${event.orderId}',
      });
    });

    it('handles empty message', () => {
      const action = log('info', '').build();

      expect(action).toEqual({
        type: 'log',
        level: 'info',
        message: '',
      });
    });

    it('preserves interpolation syntax in message', () => {
      const action = log(
        'info',
        'User ${fact.userId} ordered ${event.itemCount} items for ${event.total}'
      ).build();

      expect(action).toEqual({
        type: 'log',
        level: 'info',
        message:
          'User ${fact.userId} ordered ${event.itemCount} items for ${event.total}',
      });
    });
  });

  describe('convenience helpers', () => {
    it('log.debug creates debug level action', () => {
      const action = log.debug('Debug trace').build();

      expect(action).toEqual({
        type: 'log',
        level: 'debug',
        message: 'Debug trace',
      });
    });

    it('log.info creates info level action', () => {
      const action = log.info('Operation completed').build();

      expect(action).toEqual({
        type: 'log',
        level: 'info',
        message: 'Operation completed',
      });
    });

    it('log.warn creates warn level action', () => {
      const action = log.warn('Approaching rate limit').build();

      expect(action).toEqual({
        type: 'log',
        level: 'warn',
        message: 'Approaching rate limit',
      });
    });

    it('log.error creates error level action', () => {
      const action = log.error('Service unavailable').build();

      expect(action).toEqual({
        type: 'log',
        level: 'error',
        message: 'Service unavailable',
      });
    });

    it('convenience helpers support interpolation syntax', () => {
      const action = log.info(
        'Order ${event.orderId} processed by ${fact.handlerId}'
      ).build();

      expect(action).toEqual({
        type: 'log',
        level: 'info',
        message: 'Order ${event.orderId} processed by ${fact.handlerId}',
      });
    });
  });
});
