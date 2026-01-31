/**
 * CLI typy pro noex-rules.
 */

/** Podporované výstupní formáty */
export type OutputFormat = 'json' | 'table' | 'pretty';

/** Exit kódy CLI */
export const ExitCode = {
  Success: 0,
  GeneralError: 1,
  InvalidArguments: 2,
  ValidationError: 3,
  FileNotFound: 4,
  ConnectionError: 5,
  TestFailed: 6
} as const;

export type ExitCode = (typeof ExitCode)[keyof typeof ExitCode];

/** Globální CLI options */
export interface GlobalOptions {
  format: OutputFormat;
  quiet: boolean;
  noColor: boolean;
  config: string | undefined;
}

/** CLI konfigurace (z konfiguračního souboru) */
export interface CliConfig {
  server: {
    url: string;
  };
  storage: {
    adapter: 'memory' | 'sqlite' | 'file';
    path?: string;
  };
  output: {
    format: OutputFormat;
    colors: boolean;
  };
}

/** Výchozí CLI konfigurace */
export const DEFAULT_CLI_CONFIG: CliConfig = {
  server: {
    url: 'http://localhost:7226'
  },
  storage: {
    adapter: 'memory'
  },
  output: {
    format: 'pretty',
    colors: true
  }
};

/** Formátovatelná data pro výstup */
export interface FormattableData {
  type: 'rules' | 'rule' | 'validation' | 'stats' | 'message' | 'error' | 'table';
  data: unknown;
  meta?: Record<string, unknown>;
}
