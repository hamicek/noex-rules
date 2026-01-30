import { graphqlClient } from '../client';
import type { AuditQueryResult, AuditQueryInput } from '../../types';

const AUDIT_ENTRY_FRAGMENT = /* GraphQL */ `
  fragment AuditEntryFields on AuditEntry {
    id
    timestamp
    category
    type
    summary
    source
    ruleId
    ruleName
    correlationId
    details
    durationMs
  }
`;

const AUDIT_ENTRIES_QUERY = /* GraphQL */ `
  ${AUDIT_ENTRY_FRAGMENT}
  query AuditEntries($query: AuditQueryInput) {
    auditEntries(query: $query) {
      entries {
        ...AuditEntryFields
      }
      totalCount
      queryTimeMs
      hasMore
    }
  }
`;

export async function fetchAuditEntries(
  query?: AuditQueryInput,
): Promise<AuditQueryResult> {
  const data = await graphqlClient.request<{
    auditEntries: AuditQueryResult;
  }>(AUDIT_ENTRIES_QUERY, { query: query ?? {} });
  return data.auditEntries;
}
