/**
 * JSON schémata pro Rules API.
 */
import { idParamSchema } from './common.js';

const triggerSchema = {
  type: 'object',
  additionalProperties: true,
  properties: {
    type: { type: 'string' },
    topic: { type: 'string' },
    key: { type: 'string' },
    pattern: { type: 'string' },
    name: { type: 'string' }
  },
  required: ['type']
} as const;

const conditionSchema = {
  type: 'object',
  additionalProperties: true,
  properties: {
    type: { type: 'string' },
    key: { type: 'string' },
    operator: { type: 'string' },
    value: {},
    negate: { type: 'boolean' },
    source: { type: 'object', additionalProperties: true }
  }
} as const;

const actionSchema = {
  type: 'object',
  additionalProperties: true,
  properties: {
    type: { type: 'string' },
    topic: { type: 'string' },
    key: { type: 'string' },
    value: {},
    data: { type: 'object', additionalProperties: true }
  }
} as const;

export const ruleSchema = {
  type: 'object',
  additionalProperties: true,
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    description: { type: 'string' },
    priority: { type: 'number' },
    enabled: { type: 'boolean' },
    tags: { type: 'array', items: { type: 'string' } },
    trigger: triggerSchema,
    conditions: { type: 'array', items: conditionSchema },
    actions: { type: 'array', items: actionSchema },
    createdAt: { type: 'number' },
    updatedAt: { type: 'number' },
    lastFiredAt: { type: 'number', nullable: true },
    fireCount: { type: 'number' },
    version: { type: 'number' }
  },
  required: ['id', 'name', 'trigger']
} as const;

export const ruleArraySchema = {
  type: 'array',
  items: ruleSchema
} as const;

export const createRuleBodySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string', description: 'Unique rule identifier' },
    name: { type: 'string', description: 'Human-readable name' },
    description: { type: 'string', description: 'Optional description' },
    priority: { type: 'number', description: 'Rule priority (higher = more important)' },
    enabled: { type: 'boolean', description: 'Whether rule is active' },
    tags: { type: 'array', items: { type: 'string' }, description: 'Tags for categorization' },
    trigger: { ...triggerSchema, description: 'Event/fact/timer that activates this rule' },
    conditions: { type: 'array', items: conditionSchema, description: 'Conditions that must be met' },
    actions: { type: 'array', items: actionSchema, description: 'Actions to execute' }
  },
  required: ['id', 'name', 'trigger']
} as const;

export const updateRuleBodySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string' },
    description: { type: 'string' },
    priority: { type: 'number' },
    enabled: { type: 'boolean' },
    tags: { type: 'array', items: { type: 'string' } },
    trigger: triggerSchema,
    conditions: { type: 'array', items: conditionSchema },
    actions: { type: 'array', items: actionSchema }
  }
} as const;

export const rulesSchemas = {
  list: {
    tags: ['Rules'],
    summary: 'Get all rules',
    description: 'Returns a list of all registered rules',
    response: {
      200: ruleArraySchema
    }
  },
  get: {
    tags: ['Rules'],
    summary: 'Get rule by ID',
    description: 'Returns a single rule by its ID',
    params: idParamSchema,
    response: {
      200: ruleSchema
    }
  },
  create: {
    tags: ['Rules'],
    summary: 'Create a new rule',
    description: 'Creates a new rule with the provided configuration',
    body: createRuleBodySchema,
    response: {
      201: ruleSchema
    }
  },
  update: {
    tags: ['Rules'],
    summary: 'Update a rule',
    description: 'Updates an existing rule with the provided changes',
    params: idParamSchema,
    body: updateRuleBodySchema,
    response: {
      200: ruleSchema
    }
  },
  delete: {
    tags: ['Rules'],
    summary: 'Delete a rule',
    description: 'Deletes a rule by its ID',
    params: idParamSchema,
    response: {
      204: { type: 'null', description: 'Rule deleted successfully' }
    }
  },
  enable: {
    tags: ['Rules'],
    summary: 'Enable a rule',
    description: 'Enables a disabled rule',
    params: idParamSchema,
    response: {
      200: ruleSchema
    }
  },
  disable: {
    tags: ['Rules'],
    summary: 'Disable a rule',
    description: 'Disables an enabled rule',
    params: idParamSchema,
    response: {
      200: ruleSchema
    }
  }
};
