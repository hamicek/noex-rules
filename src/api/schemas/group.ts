/**
 * JSON schémata pro Groups API.
 */
import { idParamSchema } from './common.js';
import { ruleArraySchema } from './rule.js';

export const groupSchema = {
  type: 'object',
  additionalProperties: true,
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    description: { type: 'string' },
    enabled: { type: 'boolean' },
    createdAt: { type: 'number' },
    updatedAt: { type: 'number' }
  },
  required: ['id', 'name', 'enabled']
} as const;

export const groupArraySchema = {
  type: 'array',
  items: groupSchema
} as const;

export const createGroupBodySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string', description: 'Unique group identifier' },
    name: { type: 'string', description: 'Human-readable name' },
    description: { type: 'string', description: 'Optional description' },
    enabled: { type: 'boolean', description: 'Whether group is active (default: true)' }
  },
  required: ['id', 'name']
} as const;

export const updateGroupBodySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string' },
    description: { type: 'string' },
    enabled: { type: 'boolean' }
  }
} as const;

export const groupsSchemas = {
  list: {
    tags: ['Groups'],
    summary: 'Get all groups',
    description: 'Returns a list of all registered rule groups',
    response: {
      200: groupArraySchema
    }
  },
  get: {
    tags: ['Groups'],
    summary: 'Get group by ID',
    description: 'Returns a single rule group by its ID',
    params: idParamSchema,
    response: {
      200: groupSchema
    }
  },
  create: {
    tags: ['Groups'],
    summary: 'Create a new group',
    description: 'Creates a new rule group with the provided configuration',
    body: createGroupBodySchema,
    response: {
      201: groupSchema
    }
  },
  update: {
    tags: ['Groups'],
    summary: 'Update a group',
    description: 'Updates an existing rule group with the provided changes',
    params: idParamSchema,
    body: updateGroupBodySchema,
    response: {
      200: groupSchema
    }
  },
  delete: {
    tags: ['Groups'],
    summary: 'Delete a group',
    description: 'Deletes a rule group. Rules in the group become ungrouped.',
    params: idParamSchema,
    response: {
      204: { type: 'null', description: 'Group deleted successfully' }
    }
  },
  enable: {
    tags: ['Groups'],
    summary: 'Enable a group',
    description: 'Enables a disabled rule group',
    params: idParamSchema,
    response: {
      200: groupSchema
    }
  },
  disable: {
    tags: ['Groups'],
    summary: 'Disable a group',
    description: 'Disables an enabled rule group. All rules in the group stop firing.',
    params: idParamSchema,
    response: {
      200: groupSchema
    }
  },
  rules: {
    tags: ['Groups'],
    summary: 'Get rules in group',
    description: 'Returns all rules that belong to the specified group',
    params: idParamSchema,
    response: {
      200: ruleArraySchema
    }
  }
};
