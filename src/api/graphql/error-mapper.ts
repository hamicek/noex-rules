import { GraphQLError, type ExecutionResult, type FormattedExecutionResult } from 'graphql';

interface AppError extends Error {
  statusCode: number;
  code?: string;
  details?: unknown;
}

function isAppError(error: unknown): error is AppError {
  return (
    error instanceof Error &&
    typeof (error as AppError).statusCode === 'number'
  );
}

/**
 * Převede originalError z resolveru na GraphQL error s extensions.
 *
 * AppError třídy (NotFoundError, ConflictError, ValidationError, …) nesou
 * `statusCode`, `code` a volitelné `details`. Ty se přenesou do
 * `extensions` GraphQL chyby, kde je klient může snadno parsovat.
 */
function mapError(error: GraphQLError): GraphQLError {
  const original = error.originalError;

  if (!isAppError(original)) {
    return error;
  }

  const extensions: Record<string, unknown> = {
    code: original.code ?? 'ERROR',
    statusCode: original.statusCode,
  };

  if (original.details !== undefined) {
    extensions['details'] = original.details;
  }

  return new GraphQLError(error.message, {
    nodes: error.nodes ?? null,
    source: error.source ?? null,
    positions: error.positions ?? null,
    path: error.path ?? null,
    originalError: original,
    extensions,
  });
}

/**
 * Mercurius `errorFormatter` — transformuje execution errors na
 * standardizovaný formát s extensions.
 *
 * GraphQL vždy vrací HTTP 200, i když obsahuje errors (per spec).
 * Statusové kódy se přenášejí přes extensions pro klienty,
 * kteří chtějí rozlišit typ chyby.
 */
export function errorFormatter(
  execution: ExecutionResult & Required<Pick<ExecutionResult, 'errors'>>,
): { statusCode: number; response: ExecutionResult | FormattedExecutionResult } {
  const mappedErrors = execution.errors.map(mapError);

  return {
    statusCode: 200,
    response: {
      data: execution.data ?? null,
      errors: mappedErrors,
    },
  };
}
