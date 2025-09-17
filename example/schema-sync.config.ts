import { Sequelize } from 'sequelize';
import { SchemaSyncConfig } from 'sequelize-schema-sync';

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: './example.sqlite',
  logging: false // Set to console.log to see SQL queries
});

const config: SchemaSyncConfig = {
  sequelize,
  
  // Use models directory path - models will be auto-discovered
  modelsPath: './models',
  migrationsPath: './migrations',
};

export default config;