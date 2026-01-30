import { graphqlClient } from '../client';
import type { RuleGroup } from '../../types';

const GROUPS_QUERY = /* GraphQL */ `
  query Groups {
    groups {
      id
      name
      description
      enabled
      rulesCount
    }
  }
`;

export async function fetchGroups(): Promise<RuleGroup[]> {
  const data = await graphqlClient.request<{ groups: RuleGroup[] }>(
    GROUPS_QUERY,
  );
  return data.groups;
}
