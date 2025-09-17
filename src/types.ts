import { Sequelize, Model, DataTypes, ModelStatic } from 'sequelize';

export interface SchemaSyncConfig {
  sequelize: Sequelize;
  models?: ModelStatic<Model>[]; // Array of model classes (existing approach)
  modelsPath?: string; // Path to models directory (new approach)
  migrationsPath?: string;
  configPath?: string;
}

export interface ModelLoader {
  (sequelize: Sequelize): ModelStatic<Model>;
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