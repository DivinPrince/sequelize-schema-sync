import { Umzug, SequelizeStorage } from 'umzug';
import { resolve } from 'path';
import { QueryInterface } from 'sequelize';
import { readdirSync } from 'fs';
import { join } from 'path';
import { SchemaSyncConfig } from './types';

export class MigrationRunner {
  private config: SchemaSyncConfig;
  private umzug: Umzug<QueryInterface>;

  constructor(config: SchemaSyncConfig) {
    this.config = config;
    this.umzug = this.createUmzug();
  }

  private createUmzug(): Umzug<QueryInterface> {
    const migrationsPath = resolve(this.config.migrationsPath || './migrations');
    
    // Register ts-node if we have TypeScript files
    try {
      require('ts-node').register({
        compilerOptions: {
          module: 'commonjs',
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
          strict: false, // Allow implicit any types for dynamic loading
          skipLibCheck: true
        },
        transpileOnly: true, // Skip type checking for faster compilation
      });
    } catch {
      // ts-node not available, that's okay for JS files
    }
    
    // Get all migration files manually
    let migrationFiles: string[] = [];
    try {
      migrationFiles = readdirSync(migrationsPath)
        .filter(file => file.endsWith('.ts') || file.endsWith('.js'))
        .map(file => join(migrationsPath, file));
    } catch (error) {
      // Migrations directory doesn't exist yet - that's okay
    }
    
    return new Umzug<QueryInterface>({
      migrations: migrationFiles.map(file => ({
        name: file.split(/[/\\]/).pop()!.replace(/\.(ts|js)$/, ''),
        up: async ({ context }: { context: QueryInterface }) => {
          delete require.cache[file];
          const migration = require(file);
          await migration.up(context);
        },
        down: async ({ context }: { context: QueryInterface }) => {
          delete require.cache[file];
          const migration = require(file);
          await migration.down(context);
        }
      })),
      context: this.config.sequelize.getQueryInterface(),
      storage: new SequelizeStorage({
        sequelize: this.config.sequelize,
        tableName: 'SequelizeMeta'
      }),
      logger: console
    });
  }

  async runPendingMigrations(): Promise<string[]> {
    try {
      const migrations = await this.umzug.up();
      return migrations.map(m => m.name);
    } catch (error) {
      console.error('Failed to run migrations:', error);
      throw error;
    }
  }

  async rollbackLastMigration(): Promise<string | null> {
    try {
      const migrations = await this.umzug.down();
      return migrations.length > 0 ? migrations[0].name : null;
    } catch (error) {
      console.error('Failed to rollback migration:', error);
      throw error;
    }
  }

  async getExecutedMigrations(): Promise<string[]> {
    try {
      const migrations = await this.umzug.executed();
      return migrations.map(m => m.name);
    } catch (error) {
      console.error('Failed to get executed migrations:', error);
      throw error;
    }
  }

  async getPendingMigrations(): Promise<string[]> {
    try {
      const migrations = await this.umzug.pending();
      return migrations.map(m => m.name);
    } catch (error) {
      console.error('Failed to get pending migrations:', error);
      throw error;
    }
  }

  async getMigrationStatus(): Promise<{
    executed: string[];
    pending: string[];
  }> {
    const [executed, pending] = await Promise.all([
      this.getExecutedMigrations(),
      this.getPendingMigrations()
    ]);

    return { executed, pending };
  }
}

export async function runMigrations(config: SchemaSyncConfig): Promise<string[]> {
  const runner = new MigrationRunner(config);
  return await runner.runPendingMigrations();
}

export async function rollbackMigration(config: SchemaSyncConfig): Promise<string | null> {
  const runner = new MigrationRunner(config);
  return await runner.rollbackLastMigration();
}

export async function getMigrationStatus(config: SchemaSyncConfig): Promise<{
  executed: string[];
  pending: string[];
}> {
  const runner = new MigrationRunner(config);
  return await runner.getMigrationStatus();
}