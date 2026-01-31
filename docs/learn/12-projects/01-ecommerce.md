# E-Commerce Rules System

This project builds a complete rule-based backend for an online store. Instead of scattering business logic across services, you'll centralize pricing, loyalty, order processing, cart recovery, flash sales, and inventory management in a single rule engine. The result is a system where business stakeholders can understand and modify behavior without touching application code.

## What You'll Learn

- How to design a rule-based architecture for e-commerce
- Dynamic pricing with tier discounts and quantity breaks
- Loyalty program with automatic tier upgrades
- Order processing pipeline with payment timeout detection
- Abandoned cart recovery using timers
- Flash sale management with rule groups
- Inventory monitoring with low-stock alerts
- Combining events, facts, timers, CEP patterns, and external services in one system

## Architecture Overview

```text
┌──────────────────────────────────────────────────────────────────────┐
│                    E-Commerce Rule Engine                            │
│                                                                      │
│  Events In                     Facts (State)                        │
│  ┌─────────────┐               ┌──────────────────────────────┐     │
│  │ cart.add     │               │ customer:ID:tier  (bronze…)  │     │
│  │ cart.checkout│               │ customer:ID:spent (lifetime) │     │
│  │ order.created│               │ product:SKU:price            │     │
│  │ payment.*    │               │ product:SKU:stock            │     │
│  │ product.*    │               │ cart:ID:total                │     │
│  └──────┬──────┘               └──────────────────────────────┘     │
│         │                                                            │
│  ┌──────▼──────────────────────────────────────────────────────┐    │
│  │  Rule Layers                                                │    │
│  │                                                              │    │
│  │  Layer 1: Pricing         (priority 300)                    │    │
│  │    ├─ tier-discount          Apply discount by loyalty tier  │    │
│  │    ├─ quantity-break         Bulk purchase discount          │    │
│  │    └─ flash-sale-price       Override price during flash     │    │
│  │                                                              │    │
│  │  Layer 2: Order Pipeline  (priority 200)                    │    │
│  │    ├─ order-confirm          Confirm order, set timer        │    │
│  │    ├─ payment-received       Process payment, cancel timer   │    │
│  │    ├─ payment-timeout        Handle missing payment (CEP)    │    │
│  │    └─ order-ship             Ship after payment              │    │
│  │                                                              │    │
│  │  Layer 3: Loyalty         (priority 150)                    │    │
│  │    ├─ track-spending         Accumulate lifetime spending    │    │
│  │    ├─ upgrade-silver         Auto-upgrade at $500            │    │
│  │    ├─ upgrade-gold           Auto-upgrade at $2000           │    │
│  │    └─ upgrade-platinum       Auto-upgrade at $5000           │    │
│  │                                                              │    │
│  │  Layer 4: Cart Recovery   (priority 100)                    │    │
│  │    ├─ cart-abandonment       Start timer on cart.add         │    │
│  │    ├─ cart-reminder          Send reminder on timer expire   │    │
│  │    └─ cart-checkout-cancel   Cancel timer on checkout        │    │
│  │                                                              │    │
│  │  Layer 5: Inventory       (priority 50)                     │    │
│  │    ├─ stock-deduct           Deduct stock on order           │    │
│  │    ├─ low-stock-alert        Alert when stock < threshold    │    │
│  │    └─ out-of-stock           Disable product when stock = 0  │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  Events Out                                                          │
│  ┌─────────────────────────────────────────────────────┐            │
│  │ order.confirmed, order.shipped, order.cancelled      │            │
│  │ payment.timeout, notification.cart_reminder           │            │
│  │ loyalty.upgraded, alert.low_stock, alert.out_of_stock │            │
│  └─────────────────────────────────────────────────────┘            │
└──────────────────────────────────────────────────────────────────────┘
```

The system uses **five rule layers** organized by priority. Higher-priority rules (pricing) evaluate first so that downstream rules (order pipeline, loyalty) always work with correct values.

## Complete Implementation

```typescript
import { RuleEngine } from '@hamicek/noex-rules';
import {
  Rule, onEvent, onFact, onTimer, event, fact, context,
  emit, setFact, deleteFact, setTimer, cancelTimer, callService, log, ref,
  absence,
} from '@hamicek/noex-rules/dsl';

async function main() {
  // External services
  const emailService = {
    send: async (to: string, subject: string, body: string) => {
      console.log(`[EMAIL] To: ${to} | ${subject} | ${body}`);
    },
  };

  const inventoryService = {
    check: async (sku: string) => {
      // In production, this would query a warehouse API
      return { available: true, quantity: 42 };
    },
  };

  const engine = await RuleEngine.start({
    name: 'ecommerce',
    services: { emailService, inventoryService },
  });

  // ================================================================
  // LAYER 1: PRICING (priority 300)
  // ================================================================

  // 1. Tier-based discount
  engine.registerRule(
    Rule.create('tier-discount')
      .name('Loyalty Tier Discount')
      .description('Apply percentage discount based on customer loyalty tier')
      .priority(300)
      .tags('pricing', 'loyalty')
      .when(onEvent('cart.checkout'))
      .if(fact('customer:${event.customerId}:tier').exists())
      .then(emit('pricing.discount_applied', {
        orderId: ref('event.orderId'),
        customerId: ref('event.customerId'),
        tier: ref('fact.customer:${event.customerId}:tier'),
      }))
      .build()
  );

  // 2. Quantity break discount
  engine.registerRule(
    Rule.create('quantity-break')
      .name('Quantity Break Discount')
      .description('Apply bulk discount when item quantity >= 10')
      .priority(300)
      .tags('pricing', 'promotion')
      .when(onEvent('cart.add'))
      .if(event('quantity').gte(10))
      .then(emit('pricing.bulk_discount', {
        customerId: ref('event.customerId'),
        sku: ref('event.sku'),
        quantity: ref('event.quantity'),
        discountPercent: 15,
      }))
      .also(log('info', 'Bulk discount: ${event.quantity}x ${event.sku} for ${event.customerId}'))
      .build()
  );

  // 3. Flash sale price override (controlled by rule group)
  engine.registerRule(
    Rule.create('flash-sale-price')
      .name('Flash Sale Price Override')
      .description('Override product price during active flash sale')
      .priority(310)
      .tags('pricing', 'flash-sale')
      .group('flash-sales')
      .when(onEvent('cart.add'))
      .if(fact('flash:${event.sku}:price').exists())
      .then(setFact('cart:${event.customerId}:${event.sku}:price',
        ref('fact.flash:${event.sku}:price')))
      .also(log('info', 'Flash price applied: ${event.sku}'))
      .build()
  );

  // ================================================================
  // LAYER 2: ORDER PIPELINE (priority 200)
  // ================================================================

  // 4. Order confirmation — start payment timer
  engine.registerRule(
    Rule.create('order-confirm')
      .name('Confirm Order')
      .description('Confirm order and start 15-minute payment timer')
      .priority(200)
      .tags('order', 'pipeline')
      .when(onEvent('order.created'))
      .then(setFact('order:${event.orderId}:status', 'confirmed'))
      .also(setTimer({
        name: 'payment-timeout:${event.orderId}',
        duration: '15m',
        onExpire: {
          topic: 'payment.timeout',
          data: {
            orderId: ref('event.orderId'),
            customerId: ref('event.customerId'),
          },
        },
      }))
      .also(emit('order.confirmed', {
        orderId: ref('event.orderId'),
        customerId: ref('event.customerId'),
      }))
      .also(log('info', 'Order confirmed: ${event.orderId}'))
      .build()
  );

  // 5. Payment received — cancel timeout, advance pipeline
  engine.registerRule(
    Rule.create('payment-received')
      .name('Process Payment')
      .description('Record payment and cancel the timeout timer')
      .priority(200)
      .tags('order', 'pipeline')
      .when(onEvent('payment.completed'))
      .then(setFact('order:${event.orderId}:status', 'paid'))
      .also(cancelTimer('payment-timeout:${event.orderId}'))
      .also(emit('order.paid', {
        orderId: ref('event.orderId'),
        customerId: ref('event.customerId'),
        amount: ref('event.amount'),
      }))
      .also(log('info', 'Payment received: ${event.orderId}'))
      .build()
  );

  // 6. Payment timeout — cancel order (CEP absence)
  engine.registerRule(
    Rule.create('payment-timeout')
      .name('Payment Timeout Handler')
      .description('Cancel order when payment timer expires')
      .priority(200)
      .tags('order', 'pipeline')
      .when(onTimer('payment-timeout:*'))
      .then(setFact('order:${event.orderId}:status', 'cancelled'))
      .also(emit('order.cancelled', {
        orderId: ref('event.orderId'),
        customerId: ref('event.customerId'),
        reason: 'payment_timeout',
      }))
      .also(log('warn', 'Order cancelled (payment timeout): ${event.orderId}'))
      .build()
  );

  // 7. Ship after payment
  engine.registerRule(
    Rule.create('order-ship')
      .name('Ship Order')
      .description('Initiate shipping after successful payment')
      .priority(190)
      .tags('order', 'pipeline')
      .when(onEvent('order.paid'))
      .then(setFact('order:${event.orderId}:status', 'shipped'))
      .also(emit('order.shipped', {
        orderId: ref('event.orderId'),
        customerId: ref('event.customerId'),
      }))
      .also(log('info', 'Order shipped: ${event.orderId}'))
      .build()
  );

  // 8. Absence-based payment monitoring (alternative CEP approach)
  engine.registerRule(
    Rule.create('payment-absence-monitor')
      .name('Payment Absence Monitor')
      .description('Detect when payment is not received within 10 minutes of order creation')
      .priority(210)
      .tags('order', 'monitoring')
      .when(absence()
        .after('order.created')
        .expected('payment.completed')
        .within('10m')
        .groupBy('orderId')
      )
      .then(emit('notification.payment_reminder', {
        orderId: ref('trigger.after.orderId'),
        customerId: ref('trigger.after.customerId'),
      }))
      .also(log('info', 'Payment reminder sent: ${trigger.after.orderId}'))
      .build()
  );

  // ================================================================
  // LAYER 3: LOYALTY PROGRAM (priority 150)
  // ================================================================

  // 9. Track lifetime spending
  engine.registerRule(
    Rule.create('track-spending')
      .name('Track Customer Spending')
      .description('Accumulate lifetime spending on each payment')
      .priority(150)
      .tags('loyalty', 'tracking')
      .when(onEvent('order.paid'))
      .then(setFact('customer:${event.customerId}:lastOrderAmount', ref('event.amount')))
      .also(emit('loyalty.purchase_recorded', {
        customerId: ref('event.customerId'),
        amount: ref('event.amount'),
      }))
      .build()
  );

  // 10. Upgrade to Silver (lifetime spend >= $500)
  engine.registerRule(
    Rule.create('upgrade-silver')
      .name('Upgrade to Silver Tier')
      .description('Promote customer to silver when lifetime spending reaches $500')
      .priority(140)
      .tags('loyalty', 'tier')
      .when(onFact('customer:*:spent'))
      .if(fact('${trigger.key}').gte(500))
      .and(fact('customer:${trigger.key.split(":")[1]}:tier').eq('bronze'))
      .then(setFact('customer:${trigger.key.split(":")[1]}:tier', 'silver'))
      .also(emit('loyalty.upgraded', {
        customerId: '${trigger.key.split(":")[1]}',
        fromTier: 'bronze',
        toTier: 'silver',
      }))
      .also(log('info', 'Customer upgraded to Silver: ${trigger.key.split(":")[1]}'))
      .build()
  );

  // 11. Upgrade to Gold (lifetime spend >= $2000)
  engine.registerRule(
    Rule.create('upgrade-gold')
      .name('Upgrade to Gold Tier')
      .description('Promote customer to gold when lifetime spending reaches $2000')
      .priority(140)
      .tags('loyalty', 'tier')
      .when(onFact('customer:*:spent'))
      .if(fact('${trigger.key}').gte(2000))
      .and(fact('customer:${trigger.key.split(":")[1]}:tier').eq('silver'))
      .then(setFact('customer:${trigger.key.split(":")[1]}:tier', 'gold'))
      .also(emit('loyalty.upgraded', {
        customerId: '${trigger.key.split(":")[1]}',
        fromTier: 'silver',
        toTier: 'gold',
      }))
      .also(log('info', 'Customer upgraded to Gold: ${trigger.key.split(":")[1]}'))
      .build()
  );

  // 12. Upgrade to Platinum (lifetime spend >= $5000)
  engine.registerRule(
    Rule.create('upgrade-platinum')
      .name('Upgrade to Platinum Tier')
      .description('Promote customer to platinum when lifetime spending reaches $5000')
      .priority(140)
      .tags('loyalty', 'tier')
      .when(onFact('customer:*:spent'))
      .if(fact('${trigger.key}').gte(5000))
      .and(fact('customer:${trigger.key.split(":")[1]}:tier').eq('gold'))
      .then(setFact('customer:${trigger.key.split(":")[1]}:tier', 'platinum'))
      .also(emit('loyalty.upgraded', {
        customerId: '${trigger.key.split(":")[1]}',
        fromTier: 'gold',
        toTier: 'platinum',
      }))
      .also(log('info', 'Customer upgraded to Platinum: ${trigger.key.split(":")[1]}'))
      .build()
  );

  // ================================================================
  // LAYER 4: CART RECOVERY (priority 100)
  // ================================================================

  // 13. Start abandonment timer on cart addition
  engine.registerRule(
    Rule.create('cart-abandonment')
      .name('Cart Abandonment Timer')
      .description('Start a 30-minute timer when items are added to cart')
      .priority(100)
      .tags('cart', 'recovery')
      .when(onEvent('cart.add'))
      .then(setTimer({
        name: 'cart-reminder:${event.customerId}',
        duration: '30m',
        onExpire: {
          topic: 'cart.abandoned',
          data: {
            customerId: ref('event.customerId'),
            sku: ref('event.sku'),
          },
        },
      }))
      .also(setFact('cart:${event.customerId}:active', true))
      .build()
  );

  // 14. Send cart reminder when timer expires
  engine.registerRule(
    Rule.create('cart-reminder')
      .name('Cart Reminder Notification')
      .description('Send email reminder for abandoned cart')
      .priority(100)
      .tags('cart', 'recovery')
      .when(onEvent('cart.abandoned'))
      .then(emit('notification.cart_reminder', {
        customerId: ref('event.customerId'),
      }))
      .also(callService('emailService', 'send', [
        ref('event.customerId'),
        'You left items in your cart!',
        'Complete your purchase and get free shipping.',
      ]))
      .also(log('info', 'Cart reminder sent: ${event.customerId}'))
      .build()
  );

  // 15. Cancel abandonment timer on checkout
  engine.registerRule(
    Rule.create('cart-checkout-cancel')
      .name('Cancel Cart Timer on Checkout')
      .description('Cancel the abandonment timer when customer checks out')
      .priority(100)
      .tags('cart', 'recovery')
      .when(onEvent('cart.checkout'))
      .then(cancelTimer('cart-reminder:${event.customerId}'))
      .also(deleteFact('cart:${event.customerId}:active'))
      .build()
  );

  // ================================================================
  // LAYER 5: INVENTORY (priority 50)
  // ================================================================

  // 16. Deduct stock on order
  engine.registerRule(
    Rule.create('stock-deduct')
      .name('Deduct Inventory')
      .description('Reduce product stock when order is confirmed')
      .priority(50)
      .tags('inventory')
      .when(onEvent('order.confirmed'))
      .if(event('items').exists())
      .then(log('info', 'Stock deducted for order: ${event.orderId}'))
      .build()
  );

  // 17. Low stock alert
  engine.registerRule(
    Rule.create('low-stock-alert')
      .name('Low Stock Alert')
      .description('Emit alert when product stock drops below 10')
      .priority(50)
      .tags('inventory', 'alerts')
      .when(onFact('product:*:stock'))
      .if(fact('${trigger.key}').lt(10))
      .and(fact('${trigger.key}').gt(0))
      .then(emit('alert.low_stock', {
        sku: '${trigger.key.split(":")[1]}',
        remaining: ref('trigger.value'),
      }))
      .also(log('warn', 'Low stock: ${trigger.key} = ${trigger.value}'))
      .build()
  );

  // 18. Out of stock — disable product
  engine.registerRule(
    Rule.create('out-of-stock')
      .name('Out of Stock Handler')
      .description('Mark product as unavailable when stock reaches zero')
      .priority(50)
      .tags('inventory', 'alerts')
      .when(onFact('product:*:stock'))
      .if(fact('${trigger.key}').lte(0))
      .then(setFact('product:${trigger.key.split(":")[1]}:available', false))
      .also(emit('alert.out_of_stock', {
        sku: '${trigger.key.split(":")[1]}',
      }))
      .also(log('error', 'Out of stock: ${trigger.key.split(":")[1]}'))
      .build()
  );

  // ================================================================
  // FLASH SALE MANAGEMENT
  // ================================================================

  // Create a rule group for flash sales (disabled by default)
  engine.createGroup({
    id: 'flash-sales',
    name: 'Flash Sale Rules',
    description: 'Enable during active flash sale events',
    enabled: false,
  });

  // ================================================================
  // SIMULATION
  // ================================================================

  console.log('=== E-Commerce Rule Engine Started ===\n');

  // Set up initial customer
  await engine.setFact('customer:C-100:tier', 'bronze');
  await engine.setFact('customer:C-100:spent', 0);
  await engine.setFact('product:SKU-001:stock', 25);
  await engine.setFact('product:SKU-001:price', 49.99);

  // Subscribe to key events
  engine.subscribe('order.*', (event) => {
    console.log(`[ORDER] ${event.topic}:`, event.data);
  });

  engine.subscribe('loyalty.*', (event) => {
    console.log(`[LOYALTY] ${event.topic}:`, event.data);
  });

  engine.subscribe('alert.*', (event) => {
    console.log(`[ALERT] ${event.topic}:`, event.data);
  });

  // Customer adds item to cart
  await engine.emit('cart.add', {
    customerId: 'C-100',
    sku: 'SKU-001',
    quantity: 2,
    price: 49.99,
  });

  // Customer checks out
  await engine.emit('cart.checkout', {
    customerId: 'C-100',
    orderId: 'ORD-500',
    total: 99.98,
  });

  // Order is created
  await engine.emit('order.created', {
    orderId: 'ORD-500',
    customerId: 'C-100',
    items: [{ sku: 'SKU-001', quantity: 2 }],
    total: 99.98,
  });

  // Payment arrives
  await engine.emit('payment.completed', {
    orderId: 'ORD-500',
    customerId: 'C-100',
    amount: 99.98,
  });

  // Check state
  console.log('\n=== Final State ===');
  console.log('Order status:', engine.getFact('order:ORD-500:status'));
  console.log('Customer tier:', engine.getFact('customer:C-100:tier'));
  console.log('Product stock:', engine.getFact('product:SKU-001:stock'));

  // --- Flash sale demo ---
  console.log('\n=== Activating Flash Sale ===');
  await engine.setFact('flash:SKU-001:price', 29.99);
  engine.enableGroup('flash-sales');

  await engine.emit('cart.add', {
    customerId: 'C-100',
    sku: 'SKU-001',
    quantity: 1,
    price: 49.99,
  });

  console.log('Flash price applied:', engine.getFact('cart:C-100:SKU-001:price'));
  // 29.99

  engine.disableGroup('flash-sales');
  console.log('Flash sale deactivated\n');

  await engine.stop();
  console.log('Engine stopped.');
}

main();
```

## Detailed Breakdown

### Pricing Layer

The pricing layer evaluates first (priority 300+). This ensures downstream rules see correct values.

| Rule | Trigger | What It Does |
|------|---------|-------------|
| `tier-discount` | `cart.checkout` | Looks up customer tier from facts, emits discount event |
| `quantity-break` | `cart.add` | Checks quantity >= 10, emits bulk discount event |
| `flash-sale-price` | `cart.add` | Overrides price from flash sale fact (group-gated) |

The flash sale rule belongs to the `flash-sales` group. When the group is disabled, the rule doesn't evaluate — no conditional checks needed. Enable the group to activate the sale, disable it to end it.

### Order Pipeline

The order pipeline uses **timers** for payment deadlines and **CEP absence** for proactive reminders:

```text
  order.created         payment.completed        order.paid
       │                       │                      │
       ▼                       ▼                      ▼
  ┌──────────┐           ┌──────────┐           ┌──────────┐
  │ Confirm  │──timer──→ │ Payment  │           │  Ship    │
  │ order    │  15 min   │ received │──cancel──→│  order   │
  │ set fact │           │ set fact │   timer   │  set fact│
  └──────────┘           └──────────┘           └──────────┘
       │
       │ (if timer expires)
       ▼
  ┌──────────┐
  │ Cancel   │
  │ order    │
  └──────────┘
```

The absence pattern (`payment-absence-monitor`) works alongside the timer as an early warning: if 10 minutes pass without payment, a reminder is sent. If the full 15 minutes pass without payment, the timer-based rule cancels the order.

### Loyalty Program

The loyalty layer uses **fact-triggered rules** to react to spending changes:

```text
  customer:ID:spent
       │
       ├──── >= $500  ──→ silver
       ├──── >= $2000 ──→ gold
       └──── >= $5000 ──→ platinum
```

Each upgrade rule checks both the spending threshold and the current tier. This prevents skipping tiers — a customer at bronze who reaches $2000 first becomes silver (the silver rule fires because its condition matches), and then immediately the gold rule fires because the tier is now silver and spending is >= $2000.

### Cart Recovery

Cart recovery uses a simple timer pattern:

1. `cart.add` → start 30-minute timer
2. Timer expires → `cart.abandoned` event → email reminder
3. `cart.checkout` → cancel timer (customer converted)

This pattern is common in e-commerce and demonstrates how timers bridge the gap between "something happened" and "something didn't happen within a time frame."

### Inventory Management

Inventory rules react to **fact changes** rather than events. When stock is updated via `setFact('product:SKU:stock', newValue)`, the fact-triggered rules evaluate:

- Stock < 10 and > 0 → low stock alert
- Stock <= 0 → mark product unavailable

This decouples inventory logic from the order pipeline. Any process that changes stock (returns, manual adjustments, supplier deliveries) automatically triggers the appropriate alerts.

## Exercise

Extend the system with a **repeat customer reward**: if a customer places 3 or more orders within 7 days, emit a `loyalty.repeat_reward` event with a 10% coupon code. Use a CEP count pattern.

Additionally, add a rule that sends a **shipping confirmation email** when `order.shipped` fires, using the `emailService`.

<details>
<summary>Solution</summary>

```typescript
import {
  Rule, onEvent, event,
  emit, callService, log, ref,
  count,
} from '@hamicek/noex-rules/dsl';

// Repeat customer reward (CEP count)
engine.registerRule(
  Rule.create('repeat-reward')
    .name('Repeat Customer Reward')
    .priority(140)
    .tags('loyalty', 'reward')
    .when(count()
      .event('order.paid')
      .threshold(3)
      .window('7d')
      .groupBy('customerId')
    )
    .then(emit('loyalty.repeat_reward', {
      customerId: ref('trigger.groupKey'),
      couponCode: 'REPEAT10',
      discountPercent: 10,
    }))
    .also(log('info', 'Repeat reward for: ${trigger.groupKey}'))
    .build()
);

// Shipping confirmation email
engine.registerRule(
  Rule.create('shipping-email')
    .name('Shipping Confirmation Email')
    .priority(40)
    .tags('order', 'notification')
    .when(onEvent('order.shipped'))
    .then(callService('emailService', 'send', [
      ref('event.customerId'),
      'Your order has shipped!',
      'Order ${event.orderId} is on its way.',
    ]))
    .also(log('info', 'Shipping email sent: ${event.orderId}'))
    .build()
);
```

The count pattern tracks `order.paid` events per customer over a 7-day sliding window. When the third payment arrives, the reward event fires. The shipping email rule listens on `order.shipped` and calls the email service — simple event-driven notification.

</details>

## Summary

- Organize rules into **priority layers**: pricing first, then order pipeline, loyalty, cart recovery, inventory
- Use **rule groups** for toggle-able features like flash sales — enable/disable the group instead of modifying rules
- Use **timers** for deadlines (payment timeout) and delayed actions (cart abandonment)
- Use **CEP absence** for early warnings (payment reminder before the hard timeout)
- Use **fact-triggered rules** for state-dependent logic (loyalty upgrades, inventory alerts)
- Event topics serve as **contracts** between layers — each layer produces events that downstream layers consume
- Facts provide **queryable state** for dashboards and APIs (order status, customer tier, stock levels)
- The system is **extensible**: adding a new pricing rule, loyalty tier, or notification doesn't require changing existing rules

---

Next: [Fraud Detection System](./02-fraud-detection.md)
