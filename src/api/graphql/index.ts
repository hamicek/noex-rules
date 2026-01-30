import { readFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import type { GraphQLContext } from './context.js';
import { errorFormatter } from './error-mapper.js';
import { resolvers } from './resolvers/index.js';
import type { GraphQLConfig } from '../config.js';

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const SCHEMA_DIR = join(MODULE_DIR, 'schema');
const TYPES_DIR = join(SCHEMA_DIR, 'types');

/**
 * Loads all `.graphql` files from the schema directory and concatenates
 * them into a single SDL string. Type definitions (from `types/`) are
 * loaded first in alphabetical order, followed by the root schema.
 */
async function loadSchema(): Promise<string> {
  const typeFiles = await readdir(TYPES_DIR);
  const typeContents = await Promise.all(
    typeFiles
      .filter((f) => f.endsWith('.graphql'))
      .sort()
      .map((f) => readFile(join(TYPES_DIR, f), 'utf-8')),
  );

  const rootSchema = await readFile(join(SCHEMA_DIR, 'schema.graphql'), 'utf-8');

  return [...typeContents, rootSchema].join('\n\n');
}

/**
 * Registers the Mercurius GraphQL plugin on a Fastify instance.
 *
 * - Loads `.graphql` schema files from disk
 * - Wires merged resolvers and shared context
 * - Configures WebSocket subscriptions, GraphiQL IDE, and error formatting
 *
 * The endpoint is registered at root level (without the REST API prefix)
 * because GraphQL uses a single endpoint by convention.
 */
export async function registerGraphQL(
  fastify: FastifyInstance,
  routeContext: GraphQLContext,
  config: Required<GraphQLConfig>,
): Promise<void> {
  const mercurius = await import('mercurius');
  const schema = await loadSchema();

  await fastify.register(mercurius.default, {
    schema,
    // Resolvers are internally typed per-module; cast at the plugin boundary.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolvers: resolvers as any,
    path: config.path,
    graphiql: config.graphiql,
    context: () => routeContext,
    subscription: config.subscriptions
      ? { context: () => routeContext }
      : false,
    errorFormatter,
  });
}
