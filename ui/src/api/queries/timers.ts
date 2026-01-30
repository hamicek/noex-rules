import { graphqlClient } from '../client';
import type { Timer } from '../../types';

const TIMER_FRAGMENT = /* GraphQL */ `
  fragment TimerFields on Timer {
    id
    name
    expiresAt
    onExpire {
      topic
      data
    }
    repeat {
      interval
      maxCount
    }
    correlationId
  }
`;

const TIMERS_QUERY = /* GraphQL */ `
  ${TIMER_FRAGMENT}
  query Timers {
    timers {
      ...TimerFields
    }
  }
`;

const TIMER_QUERY = /* GraphQL */ `
  ${TIMER_FRAGMENT}
  query Timer($name: String!) {
    timer(name: $name) {
      ...TimerFields
    }
  }
`;

const CREATE_TIMER = /* GraphQL */ `
  ${TIMER_FRAGMENT}
  mutation CreateTimer($input: CreateTimerInput!) {
    createTimer(input: $input) {
      ...TimerFields
    }
  }
`;

const CANCEL_TIMER = /* GraphQL */ `
  mutation CancelTimer($name: String!) {
    cancelTimer(name: $name)
  }
`;

export async function fetchTimers(): Promise<Timer[]> {
  const data = await graphqlClient.request<{ timers: Timer[] }>(TIMERS_QUERY);
  return data.timers;
}

export async function fetchTimer(name: string): Promise<Timer | null> {
  const data = await graphqlClient.request<{ timer: Timer | null }>(
    TIMER_QUERY,
    { name },
  );
  return data.timer;
}

export async function createTimer(
  input: Record<string, unknown>,
): Promise<Timer> {
  const data = await graphqlClient.request<{ createTimer: Timer }>(
    CREATE_TIMER,
    { input },
  );
  return data.createTimer;
}

export async function cancelTimer(name: string): Promise<boolean> {
  const data = await graphqlClient.request<{ cancelTimer: boolean }>(
    CANCEL_TIMER,
    { name },
  );
  return data.cancelTimer;
}
