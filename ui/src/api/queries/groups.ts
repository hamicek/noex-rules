import { graphqlClient } from '../client';
import type { RuleGroup } from '../../types';

const GROUP_FRAGMENT = /* GraphQL */ `
  fragment GroupFields on RuleGroup {
    id
    name
    description
    enabled
    rulesCount
    createdAt
    updatedAt
  }
`;

const GROUPS_QUERY = /* GraphQL */ `
  ${GROUP_FRAGMENT}
  query Groups {
    groups {
      ...GroupFields
    }
  }
`;

const GROUP_QUERY = /* GraphQL */ `
  ${GROUP_FRAGMENT}
  query Group($id: ID!) {
    group(id: $id) {
      ...GroupFields
    }
  }
`;

const CREATE_GROUP = /* GraphQL */ `
  ${GROUP_FRAGMENT}
  mutation CreateGroup($input: CreateGroupInput!) {
    createGroup(input: $input) {
      ...GroupFields
    }
  }
`;

const UPDATE_GROUP = /* GraphQL */ `
  ${GROUP_FRAGMENT}
  mutation UpdateGroup($id: ID!, $input: UpdateGroupInput!) {
    updateGroup(id: $id, input: $input) {
      ...GroupFields
    }
  }
`;

const DELETE_GROUP = /* GraphQL */ `
  mutation DeleteGroup($id: ID!) {
    deleteGroup(id: $id)
  }
`;

const ENABLE_GROUP = /* GraphQL */ `
  ${GROUP_FRAGMENT}
  mutation EnableGroup($id: ID!) {
    enableGroup(id: $id) {
      ...GroupFields
    }
  }
`;

const DISABLE_GROUP = /* GraphQL */ `
  ${GROUP_FRAGMENT}
  mutation DisableGroup($id: ID!) {
    disableGroup(id: $id) {
      ...GroupFields
    }
  }
`;

export async function fetchGroups(): Promise<RuleGroup[]> {
  const data = await graphqlClient.request<{ groups: RuleGroup[] }>(
    GROUPS_QUERY,
  );
  return data.groups;
}

export async function fetchGroup(id: string): Promise<RuleGroup | null> {
  const data = await graphqlClient.request<{ group: RuleGroup | null }>(
    GROUP_QUERY,
    { id },
  );
  return data.group;
}

export async function createGroup(
  input: Record<string, unknown>,
): Promise<RuleGroup> {
  const data = await graphqlClient.request<{ createGroup: RuleGroup }>(
    CREATE_GROUP,
    { input },
  );
  return data.createGroup;
}

export async function updateGroup(
  id: string,
  input: Record<string, unknown>,
): Promise<RuleGroup> {
  const data = await graphqlClient.request<{ updateGroup: RuleGroup }>(
    UPDATE_GROUP,
    { id, input },
  );
  return data.updateGroup;
}

export async function deleteGroup(id: string): Promise<boolean> {
  const data = await graphqlClient.request<{ deleteGroup: boolean }>(
    DELETE_GROUP,
    { id },
  );
  return data.deleteGroup;
}

export async function enableGroup(id: string): Promise<RuleGroup> {
  const data = await graphqlClient.request<{ enableGroup: RuleGroup }>(
    ENABLE_GROUP,
    { id },
  );
  return data.enableGroup;
}

export async function disableGroup(id: string): Promise<RuleGroup> {
  const data = await graphqlClient.request<{ disableGroup: RuleGroup }>(
    DISABLE_GROUP,
    { id },
  );
  return data.disableGroup;
}
