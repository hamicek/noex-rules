import { graphqlClient } from '../client';
import type { Rule } from '../../types';

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

export async function fetchRules(): Promise<Rule[]> {
  const data = await graphqlClient.request<{ rules: Rule[] }>(RULES_QUERY);
  return data.rules;
}

export async function enableRule(id: string): Promise<{ id: string; enabled: boolean }> {
  const data = await graphqlClient.request<{
    enableRule: { id: string; enabled: boolean };
  }>(ENABLE_RULE, { id });
  return data.enableRule;
}

export async function disableRule(id: string): Promise<{ id: string; enabled: boolean }> {
  const data = await graphqlClient.request<{
    disableRule: { id: string; enabled: boolean };
  }>(DISABLE_RULE, { id });
  return data.disableRule;
}
