import { Sequelize } from 'sequelize';
import { SchemaSyncConfig } from '../src/types';
import { User } from './models/User';
import { Post } from './models/Post';
import { initializeModels } from './models';

// Initialize Sequelize with SQLite
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: './example.sqlite',
  logging: console.log, // Enable SQL logging
});

// Initialize models
const models = initializeModels(sequelize);

// Configuration for sequelize-schema-sync
const config: SchemaSyncConfig = {
  sequelize,
  models: [
    User,
    Post,
  ],
  migrationsPath: './migrations',
};

export default config;