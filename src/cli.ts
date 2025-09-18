#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { resolve, join } from 'path';
import { existsSync } from 'fs';
import { uniqueNamesGenerator, adjectives, colors, animals } from 'unique-names-generator';
import { SchemaSyncConfig } from './types';
import { generateMigration } from './generator';
import { runMigrations, rollbackMigration, getMigrationStatus } from './migrator';

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
  .option('--dry-run', 'Show what changes would be made without generating files')
  .action(async (options) => {
    console.log(chalk.blue('🔄 Loading configuration...'));
    
    try {
      const config = await loadConfig();
      console.log(chalk.green('✅ Configuration loaded'));
      
      if (options.dryRun) {
        console.log(chalk.yellow('🔍 Running in dry-run mode...'));
        const { generateSchemaDiff } = await import('./diff');
        const diff = await generateSchemaDiff(config, true); // Enable debug logging
        
        console.log(chalk.blue('\n📊 Schema Analysis Results:'));
        console.log('='.repeat(50));
        
        if (diff.hasChanges) {
          console.log(chalk.yellow(`Found ${diff.tables.length} table(s) with changes:`));
          
          for (const tableDiff of diff.tables) {
            console.log(chalk.cyan(`\n📄 Table: ${tableDiff.table}`));
            console.log(chalk.gray(`   Action: ${tableDiff.action}`));
            
            if (tableDiff.action === 'create') {
              const cols = Object.keys(tableDiff.definition || {});
              console.log(chalk.green(`   → Will create table with ${cols.length} columns: ${cols.join(', ')}`));
            } else if (tableDiff.action === 'alter' && tableDiff.columns) {
              console.log(chalk.yellow(`   → Will modify ${tableDiff.columns.length} column(s):`));
              for (const colDiff of tableDiff.columns) {
                console.log(chalk.gray(`     - ${colDiff.column}: ${colDiff.action}`));
              }
            } else if (tableDiff.action === 'drop') {
              console.log(chalk.red(`   → Will drop table`));
            }
          }
          
          console.log(chalk.yellow(`\n💡 To generate the migration file, run without --dry-run flag`));
        } else {
          console.log(chalk.green('✅ No schema changes detected!'));
          console.log(chalk.gray('   Your database schema is in sync with your models.'));
        }
        
        return;
      }
      
      console.log(chalk.blue('🔍 Analyzing schema differences...'));
      
      // Generate a random name if none provided
      let migrationName = options.name;
      if (!migrationName) {
        migrationName = uniqueNamesGenerator({
          dictionaries: [adjectives, colors, animals],
          separator: '_',
          length: 3,
          style: 'lowerCase'
        });
        console.log(chalk.cyan(`🎲 Generated migration name: ${migrationName}`));
      }
      
      const migrationFile = await generateMigration(config, migrationName);
      
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
      
      console.log(chalk.blue('📊 Migration status:'));
      const status = await getMigrationStatus(config);
      
      console.log(chalk.blue('Executed migrations:'), status.executed);
      console.log(chalk.blue('Pending migrations:'), status.pending);
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

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: './database.sqlite',
  // Configure your database connection
  
  // Global define options for all models
  define: {
    // For MySQL, also set charset and collate in dialectOptions
    charset: 'utf8mb4',
    collate: 'utf8mb4_general_ci',
    // Use snake_case for all auto-generated fields (timestamps, foreign keys, etc.)
    underscored: true,
    // Prevent Sequelize from pluralizing table names
    freezeTableName: true,
    // Add timestamps by default
    timestamps: true,
  },
  
  // For MySQL/MariaDB databases, uncomment and configure:
  // dialectOptions: {
  //   charset: 'utf8mb4',
  //   collate: 'utf8mb4_general_ci',
  // },
});

const config: SchemaSyncConfig = {
  sequelize,
  
  // Option 1: Provide models array directly (existing approach)
  // models: [User, Post],
  
  // Option 2: Provide models directory path (new approach)
  modelsPath: './models',
  
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

// Always parse when this file is executed
program.parse();