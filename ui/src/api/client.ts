import { GraphQLClient } from 'graphql-request';

const STORAGE_KEY = 'noex-rules-server-url';

function resolveServerUrl(): string {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return stored;
  }
  return import.meta.env.VITE_SERVER_URL || '';
}

export const graphqlClient = new GraphQLClient(
  `${resolveServerUrl()}/graphql`,
);

export function getServerUrl(): string {
  return resolveServerUrl();
}

export function setServerUrl(url: string): void {
  localStorage.setItem(STORAGE_KEY, url);
  graphqlClient.setEndpoint(`${url}/graphql`);
}
