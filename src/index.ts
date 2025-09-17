export * from './types';
export * from './diff';
export * from './generator';
export * from './migrator';

// Main API
export { SchemaSyncConfig, SchemaDiff, TableDifference, ColumnDifference } from './types';
export { generateSchemaDiff } from './diff';
export { generateMigration } from './generator';
export { runMigrations, rollbackMigration, getMigrationStatus } from './migrator';