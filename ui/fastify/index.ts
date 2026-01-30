import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';

export interface UIPluginOptions {
  basePath?: string;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function registerUI(
  fastify: FastifyInstance,
  options: UIPluginOptions = {},
) {
  const basePath = options.basePath ?? '/ui';
  const distDir = path.resolve(__dirname, '..', 'dist');

  let fastifyStatic: typeof import('@fastify/static');
  try {
    fastifyStatic = await import('@fastify/static');
  } catch {
    fastify.log.error(
      '@fastify/static is required for serving the UI. Install it with: npm install @fastify/static',
    );
    return;
  }

  await fastify.register(fastifyStatic.default, {
    root: distDir,
    prefix: basePath,
    decorateReply: false,
  });

  fastify.get(`${basePath}/*`, async (_request, reply) => {
    return reply.sendFile('index.html', distDir);
  });
}
