import { graphqlClient } from '../client';
import type { Fact } from '../../types';

const FACT_FRAGMENT = /* GraphQL */ `
  fragment FactFields on Fact {
    key
    value
    timestamp
    source
    version
  }
`;

const FACTS_QUERY = /* GraphQL */ `
  ${FACT_FRAGMENT}
  query Facts {
    facts {
      ...FactFields
    }
  }
`;

const FACT_QUERY = /* GraphQL */ `
  ${FACT_FRAGMENT}
  query Fact($key: String!) {
    fact(key: $key) {
      ...FactFields
    }
  }
`;

const FACTS_PATTERN_QUERY = /* GraphQL */ `
  ${FACT_FRAGMENT}
  query FactsQuery($pattern: String!) {
    factsQuery(pattern: $pattern) {
      ...FactFields
    }
  }
`;

const SET_FACT = /* GraphQL */ `
  ${FACT_FRAGMENT}
  mutation SetFact($key: String!, $value: JSON!) {
    setFact(key: $key, value: $value) {
      ...FactFields
    }
  }
`;

const DELETE_FACT = /* GraphQL */ `
  mutation DeleteFact($key: String!) {
    deleteFact(key: $key)
  }
`;

export async function fetchFacts(): Promise<Fact[]> {
  const data = await graphqlClient.request<{ facts: Fact[] }>(FACTS_QUERY);
  return data.facts;
}

export async function fetchFact(key: string): Promise<Fact | null> {
  const data = await graphqlClient.request<{ fact: Fact | null }>(FACT_QUERY, {
    key,
  });
  return data.fact;
}

export async function queryFacts(pattern: string): Promise<Fact[]> {
  const data = await graphqlClient.request<{ factsQuery: Fact[] }>(
    FACTS_PATTERN_QUERY,
    { pattern },
  );
  return data.factsQuery;
}

export async function setFact(key: string, value: unknown): Promise<Fact> {
  const data = await graphqlClient.request<{ setFact: Fact }>(SET_FACT, {
    key,
    value,
  });
  return data.setFact;
}

export async function deleteFact(key: string): Promise<boolean> {
  const data = await graphqlClient.request<{ deleteFact: boolean }>(
    DELETE_FACT,
    { key },
  );
  return data.deleteFact;
}
