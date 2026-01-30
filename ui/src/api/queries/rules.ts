import { graphqlClient } from '../client';
import type { Rule } from '../../types';

const RULE_FRAGMENT = /* GraphQL */ `
  fragment RuleFields on Rule {
    id
    name
    description
    priority
    enabled
    version
    tags
    groupId
    group {
      id
      name
    }
    trigger {
      type
      pattern
      topic
      name
    }
    conditions {
      source {
        type
        pattern
        field
        key
        name
        metric
        comparison
        sensitivity
      }
      operator
      value
    }
    actions {
      type
      key
      value
      topic
      data
      timer
      name
      service
      method
      args
      level
      message
      conditions {
        source { type pattern field key name }
        operator
        value
      }
      thenActions {
        type key value topic data timer name service method args level message
      }
      elseActions {
        type key value topic data timer name service method args level message
      }
    }
    createdAt
    updatedAt
  }
`;

const RULES_QUERY = /* GraphQL */ `
  query Rules {
    rules {
      id
      name
      description
      priority
      enabled
      version
      tags
      groupId
      trigger {
        type
        pattern
        topic
        name
      }
      createdAt
      updatedAt
    }
  }
`;

const RULE_QUERY = /* GraphQL */ `
  ${RULE_FRAGMENT}
  query Rule($id: ID!) {
    rule(id: $id) {
      ...RuleFields
    }
  }
`;

const ENABLE_RULE = /* GraphQL */ `
  mutation EnableRule($id: ID!) {
    enableRule(id: $id) {
      id
      enabled
    }
  }
`;

const DISABLE_RULE = /* GraphQL */ `
  mutation DisableRule($id: ID!) {
    disableRule(id: $id) {
      id
      enabled
    }
  }
`;

const CREATE_RULE = /* GraphQL */ `
  ${RULE_FRAGMENT}
  mutation CreateRule($input: CreateRuleInput!) {
    createRule(input: $input) {
      ...RuleFields
    }
  }
`;

const UPDATE_RULE = /* GraphQL */ `
  ${RULE_FRAGMENT}
  mutation UpdateRule($id: ID!, $input: UpdateRuleInput!) {
    updateRule(id: $id, input: $input) {
      ...RuleFields
    }
  }
`;

const DELETE_RULE = /* GraphQL */ `
  mutation DeleteRule($id: ID!) {
    deleteRule(id: $id)
  }
`;

export async function fetchRules(): Promise<Rule[]> {
  const data = await graphqlClient.request<{ rules: Rule[] }>(RULES_QUERY);
  return data.rules;
}

export async function fetchRule(id: string): Promise<Rule | null> {
  const data = await graphqlClient.request<{ rule: Rule | null }>(RULE_QUERY, {
    id,
  });
  return data.rule;
}

export async function enableRule(
  id: string,
): Promise<{ id: string; enabled: boolean }> {
  const data = await graphqlClient.request<{
    enableRule: { id: string; enabled: boolean };
  }>(ENABLE_RULE, { id });
  return data.enableRule;
}

export async function disableRule(
  id: string,
): Promise<{ id: string; enabled: boolean }> {
  const data = await graphqlClient.request<{
    disableRule: { id: string; enabled: boolean };
  }>(DISABLE_RULE, { id });
  return data.disableRule;
}

export async function createRule(input: Record<string, unknown>): Promise<Rule> {
  const data = await graphqlClient.request<{ createRule: Rule }>(CREATE_RULE, {
    input,
  });
  return data.createRule;
}

export async function updateRule(
  id: string,
  input: Record<string, unknown>,
): Promise<Rule> {
  const data = await graphqlClient.request<{ updateRule: Rule }>(UPDATE_RULE, {
    id,
    input,
  });
  return data.updateRule;
}

export async function deleteRule(id: string): Promise<boolean> {
  const data = await graphqlClient.request<{ deleteRule: boolean }>(
    DELETE_RULE,
    { id },
  );
  return data.deleteRule;
}
