import { Sequelize } from 'sequelize';
import { SchemaSyncConfig } from 'sequelize-schema-sync';

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: './example.sqlite',
  logging: false, // Set to console.log to see SQL queries
  
  // Global define options that apply to all models
  define: {
    charset: 'utf8mb4',
    collate: 'utf8mb4_general_ci',
    // Use snake_case for all auto-generated fields: timestamps, foreign keys, etc.
    // createdAt -> created_at, updatedAt -> updated_at, userId -> user_id
    underscored: true,
    // Prevent table name pluralization (User -> User, not Users)
    freezeTableName: true,
    // Add timestamps by default
    timestamps: true,
  },
});

const config: SchemaSyncConfig = {
  sequelize,
  
  // Use models directory path - models will be auto-discovered
  modelsPath: './models',
  migrationsPath: './migrations',
};

export default config;