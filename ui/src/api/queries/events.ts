import { graphqlClient } from '../client';
import type { EngineEvent } from '../../types';

const EMIT_EVENT = /* GraphQL */ `
  mutation EmitEvent($input: EmitEventInput!) {
    emitEvent(input: $input) {
      id
      topic
      data
      timestamp
      correlationId
      causationId
      source
    }
  }
`;

const EMIT_CORRELATED_EVENT = /* GraphQL */ `
  mutation EmitCorrelatedEvent($input: EmitCorrelatedEventInput!) {
    emitCorrelatedEvent(input: $input) {
      id
      topic
      data
      timestamp
      correlationId
      causationId
      source
    }
  }
`;

export async function emitEvent(input: {
  topic: string;
  data?: unknown;
}): Promise<EngineEvent> {
  const data = await graphqlClient.request<{ emitEvent: EngineEvent }>(
    EMIT_EVENT,
    { input },
  );
  return data.emitEvent;
}

export async function emitCorrelatedEvent(input: {
  topic: string;
  data?: unknown;
  correlationId: string;
  causationId?: string;
}): Promise<EngineEvent> {
  const data = await graphqlClient.request<{
    emitCorrelatedEvent: EngineEvent;
  }>(EMIT_CORRELATED_EVENT, { input });
  return data.emitCorrelatedEvent;
}
