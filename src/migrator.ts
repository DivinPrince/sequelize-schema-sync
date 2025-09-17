import { Umzug, SequelizeStorage } from 'umzug';
import { resolve } from 'path';
import { QueryInterface } from 'sequelize';
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
    
    return new Umzug<QueryInterface>({
      migrations: {
        glob: [`${migrationsPath}/*.{ts,js}`, { cwd: process.cwd() }],
        resolve: ({ name, path, context }) => {
          // Handle both TypeScript and JavaScript migration files
          const migration = require(path!);
          
          return {
            name,
            up: async () => {
              await migration.up(context);
            },
            down: async () => {
              await migration.down(context);
            }
          };
        }
      },
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