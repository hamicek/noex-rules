# Part 12: Projects

You've learned every major feature of noex-rules — from basic events and facts through CEP patterns, persistence, observability, APIs, and the Web UI. This final section ties it all together with three complete, production-style projects. Each project demonstrates a realistic domain, uses a wide range of engine features, and provides fully runnable code that you can adapt for your own systems.

## Chapters

### [12.1 E-Commerce Rules System](./01-ecommerce.md)

Build a complete online store rule system:
- Dynamic pricing with tier-based discounts and quantity breaks
- Loyalty program with automatic tier upgrades based on spending
- Order processing pipeline with payment timeout detection (CEP absence)
- Abandoned cart recovery using timers
- Flash sale management with rule groups
- Inventory alerts and low-stock notifications
- 15+ rules working together across events, facts, timers, and CEP patterns

### [12.2 Fraud Detection System](./02-fraud-detection.md)

Build a multi-layer fraud detection pipeline:
- Login anomaly detection with brute force protection (CEP count)
- Transaction velocity monitoring (CEP aggregate)
- Impossible travel detection for geographic anomalies (CEP sequence)
- Risk scoring engine that accumulates signals from multiple detectors
- Alert escalation with graduated response levels
- External service integration for IP geolocation and device fingerprinting
- 10+ rules with a layered detection → scoring → response architecture

### [12.3 IoT Monitoring Pipeline](./03-iot-monitoring.md)

Build a multi-zone industrial monitoring system:
- Sensor threshold monitoring with per-zone configuration
- Heartbeat monitoring for device health (CEP absence)
- Rolling averages and anomaly detection with baselines
- Maintenance scheduling with durable timers
- Real-time SSE dashboard for live monitoring
- Multi-zone architecture with zone-specific rule groups
- Complete server setup with REST API and real-time notifications

## What You'll Learn

By the end of this section, you'll be able to:
- Design rule-based architectures for complex business domains
- Combine events, facts, timers, CEP patterns, and external services in a single system
- Structure rules into layered pipelines with clear stage boundaries
- Use rule groups and tags to manage feature flags and environment-specific behavior
- Build real-time monitoring dashboards with SSE
- Apply persistence, observability, and hot reload for production readiness

---

Start with: [E-Commerce Rules System](./01-ecommerce.md)
