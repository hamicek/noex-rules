/**
 * Příkazy server pro CLI.
 * Správa REST API serveru - spuštění a zjištění stavu.
 */

import type { GlobalOptions, CliConfig } from '../types.js';
import { RuleEngineServer } from '../../api/server.js';
import { createServerClient, type HealthResponse } from '../services/server-client.js';
import { printData, print, colorize, success, info } from '../utils/output.js';

/** Options pro server start */
export interface ServerStartOptions extends GlobalOptions {
  port: number;
  host: string;
  noSwagger: boolean;
  noLogger: boolean;
}

/** Options pro server status */
export interface ServerStatusOptions extends GlobalOptions {
  url: string | undefined;
}

/**
 * Formátuje uptime v sekundách do čitelné podoby.
 */
function formatUptime(seconds: number): string {
  if (seconds < 60) {
    return `${Math.round(seconds)}s`;
  }
  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${minutes}m ${secs}s`;
  }
  if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  }
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  return `${days}d ${hours}h`;
}

/**
 * Formátuje status s barvou.
 */
function formatStatus(status: string): string {
  switch (status) {
    case 'ok':
      return colorize(status, 'green');
    case 'degraded':
      return colorize(status, 'yellow');
    default:
      return colorize(status, 'red');
  }
}

/**
 * Formátuje pretty výstup pro server status.
 */
function formatStatusPrettyOutput(health: HealthResponse, serverUrl: string): string {
  const lines: string[] = [];

  lines.push(colorize('Server Status', 'bold'));
  lines.push(colorize(`URL: ${serverUrl}`, 'dim'));
  lines.push('');

  lines.push(`Status:  ${formatStatus(health.status)}`);
  lines.push(`Version: ${health.version}`);
  lines.push(`Uptime:  ${formatUptime(health.uptime)}`);
  lines.push('');

  lines.push(colorize('Engine:', 'cyan'));
  lines.push(`  Name:    ${health.engine.name}`);
  lines.push(`  Running: ${health.engine.running ? colorize('yes', 'green') : colorize('no', 'red')}`);

  return lines.join('\n');
}

/**
 * Akce příkazu server start.
 * Spustí REST API server a drží proces běžící.
 */
export async function serverStartCommand(options: ServerStartOptions): Promise<void> {
  const { port, host, noSwagger, noLogger, format } = options;

  print(info(`Starting server on ${host}:${port}...`));

  const server = await RuleEngineServer.start({
    server: {
      port,
      host,
      swagger: !noSwagger,
      logger: !noLogger
    }
  });

  const address = server.address;

  if (format === 'json') {
    printData({
      type: 'message',
      data: {
        status: 'started',
        address,
        port: server.port,
        swagger: !noSwagger,
        logger: !noLogger
      }
    });
  } else {
    print('');
    print(success(`Server running at ${colorize(address, 'cyan')}`));
    if (!noSwagger) {
      print(info(`Swagger UI available at ${colorize(`${address}/documentation`, 'cyan')}`));
    }
    print('');
    print(colorize('Press Ctrl+C to stop', 'dim'));
  }

  // Graceful shutdown handlers
  const shutdown = async (signal: string): Promise<void> => {
    if (format !== 'json') {
      print('');
      print(info(`Received ${signal}, shutting down...`));
    }

    await server.stop();

    if (format === 'json') {
      printData({
        type: 'message',
        data: {
          status: 'stopped',
          signal
        }
      });
    } else {
      print(success('Server stopped'));
    }

    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Keep process running
  await new Promise(() => {
    // Never resolves - server runs until signal
  });
}

/**
 * Akce příkazu server status.
 * Zjistí stav běžícího serveru přes HTTP health endpoint.
 */
export async function serverStatusCommand(options: ServerStatusOptions, config: CliConfig): Promise<void> {
  const serverUrl = options.url ?? config.server.url;

  const client = createServerClient({
    baseUrl: serverUrl
  });

  const health = await client.getHealth();

  if (options.format === 'json') {
    printData({
      type: 'stats',
      data: {
        ...health,
        serverUrl
      }
    });
  } else {
    print(formatStatusPrettyOutput(health, serverUrl));
  }
}
