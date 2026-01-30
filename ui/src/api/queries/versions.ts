import { graphqlClient } from '../client';
import type {
  Rule,
  RuleVersionQueryResult,
  RuleVersionEntry,
  RuleVersionDiff,
  RuleVersionQueryInput,
} from '../../types';

const VERSION_ENTRY_FRAGMENT = /* GraphQL */ `
  fragment VersionEntryFields on RuleVersionEntry {
    version
    timestamp
    changeType
    rolledBackFrom
    description
    ruleSnapshot {
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
  }
`;

const RULE_VERSIONS_QUERY = /* GraphQL */ `
  ${VERSION_ENTRY_FRAGMENT}
  query RuleVersions($ruleId: ID!, $query: RuleVersionQueryInput) {
    ruleVersions(ruleId: $ruleId, query: $query) {
      entries {
        ...VersionEntryFields
      }
      totalVersions
      hasMore
    }
  }
`;

const RULE_VERSION_QUERY = /* GraphQL */ `
  ${VERSION_ENTRY_FRAGMENT}
  query RuleVersion($ruleId: ID!, $version: Int!) {
    ruleVersion(ruleId: $ruleId, version: $version) {
      ...VersionEntryFields
    }
  }
`;

const RULE_VERSION_DIFF_QUERY = /* GraphQL */ `
  query RuleVersionDiff($ruleId: ID!, $fromVersion: Int!, $toVersion: Int!) {
    ruleVersionDiff(ruleId: $ruleId, fromVersion: $fromVersion, toVersion: $toVersion) {
      ruleId
      fromVersion
      toVersion
      changes {
        field
        oldValue
        newValue
      }
    }
  }
`;

const ROLLBACK_RULE = /* GraphQL */ `
  mutation RollbackRule($id: ID!, $version: Int!) {
    rollbackRule(id: $id, version: $version) {
      id
      name
      version
    }
  }
`;

export async function fetchRuleVersions(
  ruleId: string,
  query?: RuleVersionQueryInput,
): Promise<RuleVersionQueryResult> {
  const data = await graphqlClient.request<{
    ruleVersions: RuleVersionQueryResult;
  }>(RULE_VERSIONS_QUERY, { ruleId, query });
  return data.ruleVersions;
}

export async function fetchRuleVersion(
  ruleId: string,
  version: number,
): Promise<RuleVersionEntry | null> {
  const data = await graphqlClient.request<{
    ruleVersion: RuleVersionEntry | null;
  }>(RULE_VERSION_QUERY, { ruleId, version });
  return data.ruleVersion;
}

export async function fetchRuleVersionDiff(
  ruleId: string,
  fromVersion: number,
  toVersion: number,
): Promise<RuleVersionDiff | null> {
  const data = await graphqlClient.request<{
    ruleVersionDiff: RuleVersionDiff | null;
  }>(RULE_VERSION_DIFF_QUERY, { ruleId, fromVersion, toVersion });
  return data.ruleVersionDiff;
}

export async function rollbackRule(
  id: string,
  version: number,
): Promise<Rule> {
  const data = await graphqlClient.request<{
    rollbackRule: Rule;
  }>(ROLLBACK_RULE, { id, version });
  return data.rollbackRule;
}
