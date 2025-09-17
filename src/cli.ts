#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { resolve, join } from 'path';
import { existsSync } from 'fs';
import { SchemaSyncConfig } from './types';
import { generateMigration } from './generator';
import { runMigrations, rollbackMigration } from './migrator';

const program = new Command();

program
  .name('sequelize-schema-sync')
  .description('Drizzle-like migrations for Sequelize')
  .version('1.0.0');

async function loadConfig(): Promise<SchemaSyncConfig> {
  const configPath = resolve(process.cwd(), 'schema-sync.config.ts');
  const jsConfigPath = resolve(process.cwd(), 'schema-sync.config.js');
  
  let actualConfigPath: string;
  
  if (existsSync(configPath)) {
    actualConfigPath = configPath;
  } else if (existsSync(jsConfigPath)) {
    actualConfigPath = jsConfigPath;
  } else {
    console.error(chalk.red('❌ Config file not found. Please create schema-sync.config.ts or schema-sync.config.js'));
    process.exit(1);
  }
  
  try {
    // For TypeScript configs, we need to compile them first
    if (actualConfigPath.endsWith('.ts')) {
      // Try to register ts-node if available
      try {
        require('ts-node/register');
      } catch {
        console.error(chalk.red('❌ ts-node is required for TypeScript config files. Please install: npm install --save-dev ts-node'));
        process.exit(1);
      }
    }
    
    // Clear require cache to ensure fresh config loading
    delete require.cache[actualConfigPath];
    const config = require(actualConfigPath);
    return config.default || config;
  } catch (error) {
    console.error(chalk.red('❌ Failed to load config:'), error);
    process.exit(1);
  }
}

program
  .command('generate')
  .description('Generate a new migration based on model changes')
  .option('-n, --name <name>', 'Migration name')
  .action(async (options) => {
    console.log(chalk.blue('🔄 Loading configuration...'));
    
    try {
      const config = await loadConfig();
      console.log(chalk.green('✅ Configuration loaded'));
      
      console.log(chalk.blue('🔍 Analyzing schema differences...'));
      const migrationFile = await generateMigration(config, options.name);
      
      if (migrationFile) {
        console.log(chalk.green(`✅ Migration generated: ${migrationFile}`));
      } else {
        console.log(chalk.yellow('ℹ️  No changes detected. No migration generated.'));
      }
    } catch (error) {
      console.error(chalk.red('❌ Failed to generate migration:'), error);
      process.exit(1);
    }
  });

program
  .command('migrate')
  .description('Run pending migrations')
  .action(async () => {
    console.log(chalk.blue('🔄 Loading configuration...'));
    
    try {
      const config = await loadConfig();
      console.log(chalk.green('✅ Configuration loaded'));
      
      console.log(chalk.blue('📦 Running migrations...'));
      const appliedMigrations = await runMigrations(config);
      
      if (appliedMigrations.length > 0) {
        console.log(chalk.green(`✅ Applied ${appliedMigrations.length} migration(s):`));
        appliedMigrations.forEach((migration: string) => {
          console.log(chalk.green(`  - ${migration}`));
        });
      } else {
        console.log(chalk.yellow('ℹ️  No pending migrations found.'));
      }
    } catch (error) {
      console.error(chalk.red('❌ Failed to run migrations:'), error);
      process.exit(1);
    }
  });

program
  .command('rollback')
  .description('Rollback the last migration')
  .action(async () => {
    console.log(chalk.blue('🔄 Loading configuration...'));
    
    try {
      const config = await loadConfig();
      console.log(chalk.green('✅ Configuration loaded'));
      
      console.log(chalk.blue('⏪ Rolling back last migration...'));
      const rolledBackMigration = await rollbackMigration(config);
      
      if (rolledBackMigration) {
        console.log(chalk.green(`✅ Rolled back migration: ${rolledBackMigration}`));
      } else {
        console.log(chalk.yellow('ℹ️  No migrations to rollback.'));
      }
    } catch (error) {
      console.error(chalk.red('❌ Failed to rollback migration:'), error);
      process.exit(1);
    }
  });

program
  .command('status')
  .description('Show migration status')
  .action(async () => {
    console.log(chalk.blue('🔄 Loading configuration...'));
    
    try {
      const config = await loadConfig();
      console.log(chalk.green('✅ Configuration loaded'));
      
      // TODO: Implement migration status check
      console.log(chalk.blue('📊 Migration status:'));
      console.log(chalk.yellow('Status command not yet implemented'));
    } catch (error) {
      console.error(chalk.red('❌ Failed to check status:'), error);
      process.exit(1);
    }
  });

program
  .command('init')
  .description('Initialize a new schema-sync.config.ts file')
  .action(async () => {
    const configPath = join(process.cwd(), 'schema-sync.config.ts');
    
    if (existsSync(configPath)) {
      console.log(chalk.yellow('⚠️  schema-sync.config.ts already exists'));
      return;
    }
    
    const { writeFileSync } = require('fs');
    
    const configTemplate = `import { Sequelize } from 'sequelize';
import { SchemaSyncConfig } from 'sequelize-schema-sync';

// Import your models here
// import { User } from './models/User';
// import { Post } from './models/Post';

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: './database.sqlite',
  // Configure your database connection
});

const config: SchemaSyncConfig = {
  sequelize,
  models: [
    // Add your models here
    // User,
    // Post,
  ],
  migrationsPath: './migrations',
};

export default config;
`;
    
    writeFileSync(configPath, configTemplate);
    console.log(chalk.green(`✅ Created ${configPath}`));
    console.log(chalk.blue('💡 Don\'t forget to:'));
    console.log(chalk.blue('  1. Configure your database connection'));
    console.log(chalk.blue('  2. Import and add your models to the models array'));
  });

if (require.main === module) {
  program.parse();
}