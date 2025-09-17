import { Sequelize, Model, DataTypes, ModelStatic } from 'sequelize';

export interface SchemaSyncConfig {
  sequelize: Sequelize;
  models: ModelStatic<Model>[];
  migrationsPath?: string;
  configPath?: string;
}

export interface ColumnDifference {
  column: string;
  action: 'add' | 'remove' | 'change';
  from?: any;
  to?: any;
}

export interface TableDifference {
  table: string;
  action: 'create' | 'drop' | 'alter';
  columns?: ColumnDifference[];
  definition?: any;
}

export interface SchemaDiff {
  tables: TableDifference[];
  hasChanges: boolean;
}

export interface MigrationData {
  timestamp: string;
  name: string;
  up: string;
  down: string;
}