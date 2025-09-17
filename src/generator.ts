import { join, resolve } from 'path';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { uniqueNamesGenerator, adjectives, colors, animals } from 'unique-names-generator';
import { SchemaSyncConfig, SchemaDiff, TableDifference, ColumnDifference, MigrationData } from './types';
import { generateSchemaDiff } from './diff';

export class MigrationGenerator {
  private config: SchemaSyncConfig;
  private migrationsPath: string;

  constructor(config: SchemaSyncConfig) {
    this.config = config;
    this.migrationsPath = resolve(config.migrationsPath || './migrations');
  }

  async generate(name?: string): Promise<string | null> {
    const diff = await generateSchemaDiff(this.config);
    
    if (!diff.hasChanges) {
      return null;
    }

    const migrationData = this.createMigrationData(diff, name);
    const migrationFile = this.writeMigrationFile(migrationData);
    
    return migrationFile;
  }

  private createMigrationData(diff: SchemaDiff, name?: string): MigrationData {
    const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
    const migrationName = name || uniqueNamesGenerator({
      dictionaries: [adjectives, colors, animals],
      separator: '_',
      length: 3,
      style: 'lowerCase'
    });
    const fileName = `${timestamp}_${migrationName}`;

    const upStatements: string[] = [];
    const downStatements: string[] = [];

    for (const table of diff.tables) {
      const { up, down } = this.generateTableMigration(table);
      upStatements.push(up);
      downStatements.unshift(down); // Reverse order for down migrations
    }

    const upCode = this.formatMigrationStatements(upStatements);
    const downCode = this.formatMigrationStatements(downStatements);

    return {
      timestamp,
      name: fileName,
      up: upCode,
      down: downCode
    };
  }

  private generateTableMigration(table: TableDifference): { up: string; down: string } {
    switch (table.action) {
      case 'create':
        return {
          up: this.generateCreateTable(table),
          down: this.generateDropTable(table)
        };
      
      case 'drop':
        return {
          up: this.generateDropTable(table),
          down: `// NOTE: Cannot auto-generate recreate for dropped table '${table.table}'`
        };
      
      case 'alter':
        return this.generateAlterTable(table);
      
      default:
        return { up: '', down: '' };
    }
  }

  private generateCreateTable(table: TableDifference): string {
    const tableName = table.table;
    const definition = table.definition;
    
    const columns: string[] = [];
    
    for (const [columnName, columnDef] of Object.entries(definition)) {
      columns.push(`    ${columnName}: ${this.formatColumnDefinition(columnDef)}`);
    }
    
    return `  await queryInterface.createTable('${tableName}', {\n${columns.join(',\n')}\n  });`;
  }

  private generateDropTable(table: TableDifference): string {
    return `  await queryInterface.dropTable('${table.table}');`;
  }

  private generateAlterTable(table: TableDifference): { up: string; down: string } {
    const upStatements: string[] = [];
    const downStatements: string[] = [];
    
    if (table.columns) {
      for (const column of table.columns) {
        const { up, down } = this.generateColumnMigration(table.table, column);
        upStatements.push(up);
        downStatements.unshift(down);
      }
    }
    
    return {
      up: upStatements.join('\n'),
      down: downStatements.join('\n')
    };
  }

  private generateColumnMigration(tableName: string, column: ColumnDifference): { up: string; down: string } {
    switch (column.action) {
      case 'add':
        return {
          up: `  await queryInterface.addColumn('${tableName}', '${column.column}', ${this.formatColumnDefinition(column.to)});`,
          down: `  await queryInterface.removeColumn('${tableName}', '${column.column}');`
        };
      
      case 'remove':
        return {
          up: `  await queryInterface.removeColumn('${tableName}', '${column.column}');`,
          down: `  await queryInterface.addColumn('${tableName}', '${column.column}', ${this.formatColumnDefinition(column.from)});`
        };
      
      case 'change':
        return {
          up: `  await queryInterface.changeColumn('${tableName}', '${column.column}', ${this.formatColumnDefinition(column.to)});`,
          down: `  await queryInterface.changeColumn('${tableName}', '${column.column}', ${this.formatColumnDefinition(column.from)});`
        };
      
      default:
        return { up: '', down: '' };
    }
  }

  private formatColumnDefinition(columnDef: any): string {
    const parts: string[] = [];
    
    // Type
    if (columnDef.type) {
      const typeStr = this.formatDataType(columnDef.type);
      parts.push(`type: ${typeStr}`);
    }
    
    // Allow null
    if (columnDef.allowNull !== undefined) {
      parts.push(`allowNull: ${columnDef.allowNull}`);
    }
    
    // Primary key
    if (columnDef.primaryKey) {
      parts.push('primaryKey: true');
    }
    
    // Auto increment
    if (columnDef.autoIncrement) {
      parts.push('autoIncrement: true');
    }
    
    // Default value
    if (columnDef.defaultValue !== undefined) {
      let defaultStr: string;
      
      // Check if defaultValue is a Date object (from new Date())
      if (columnDef.defaultValue instanceof Date) {
        // Convert Date objects to DataTypes.NOW for proper SQL generation
        defaultStr = 'DataTypes.NOW';
      } else if (typeof columnDef.defaultValue === 'string') {
        // Check if it's a date string that looks like it came from new Date()
        if (columnDef.defaultValue.match(/^\w{3} \w{3} \d{2} \d{4} \d{2}:\d{2}:\d{2}/)) {
          // This looks like a serialized Date object, convert to DataTypes.NOW
          defaultStr = 'DataTypes.NOW';
        } else {
          defaultStr = `'${columnDef.defaultValue}'`;
        }
      } else if (typeof columnDef.defaultValue === 'function') {
        // Handle function references like DataTypes.NOW
        const funcStr = String(columnDef.defaultValue);
        if (funcStr.includes('NOW') || funcStr.includes('CURRENT_TIMESTAMP')) {
          defaultStr = 'DataTypes.NOW';
        } else {
          defaultStr = String(columnDef.defaultValue);
        }
      } else {
        defaultStr = String(columnDef.defaultValue);
      }
      
      parts.push(`defaultValue: ${defaultStr}`);
    }
    
    // Unique
    if (columnDef.unique) {
      parts.push('unique: true');
    }
    
    // References
    if (columnDef.references) {
      const refStr = JSON.stringify(columnDef.references);
      parts.push(`references: ${refStr}`);
    }
    
    return `{ ${parts.join(', ')} }`;
  }

  private formatDataType(type: any): string {
    const typeStr = String(type);
    
    // Common Sequelize DataTypes
    const dataTypeMap: Record<string, string> = {
      'VARCHAR(255)': 'DataTypes.STRING',
      'TEXT': 'DataTypes.TEXT',
      'INTEGER': 'DataTypes.INTEGER',
      'BIGINT': 'DataTypes.BIGINT',
      'FLOAT': 'DataTypes.FLOAT',
      'DOUBLE': 'DataTypes.DOUBLE',
      'DECIMAL': 'DataTypes.DECIMAL',
      'BOOLEAN': 'DataTypes.BOOLEAN',
      'TINYINT(1)': 'DataTypes.BOOLEAN',
      'DATE': 'DataTypes.DATE',
      'DATEONLY': 'DataTypes.DATEONLY',
      'TIME': 'DataTypes.TIME',
      'UUID': 'DataTypes.UUID',
      'JSON': 'DataTypes.JSON',
      'JSONB': 'DataTypes.JSONB'
    };
    
    // Check for exact matches
    for (const [key, value] of Object.entries(dataTypeMap)) {
      if (typeStr.toUpperCase().includes(key)) {
        return value;
      }
    }
    
    // Check for STRING with length
    const stringMatch = typeStr.match(/VARCHAR\((\d+)\)/i);
    if (stringMatch) {
      return `DataTypes.STRING(${stringMatch[1]})`;
    }
    
    // Default fallback
    return `DataTypes.STRING`;
  }

  private formatMigrationStatements(statements: string[]): string {
    return statements.filter(stmt => stmt.trim()).join('\n\n');
  }

  private writeMigrationFile(migration: MigrationData): string {
    // Ensure migrations directory exists
    if (!existsSync(this.migrationsPath)) {
      mkdirSync(this.migrationsPath, { recursive: true });
    }
    
    const fileName = `${migration.name}.ts`;
    const filePath = join(this.migrationsPath, fileName);
    
    const migrationContent = `import { QueryInterface, DataTypes } from 'sequelize';

/**
 * Migration: ${migration.name}
 * Generated on: ${new Date().toISOString()}
 */

export async function up(queryInterface: QueryInterface): Promise<void> {
${migration.up || '  // No up migrations'}
}

export async function down(queryInterface: QueryInterface): Promise<void> {
${migration.down || '  // No down migrations'}
}
`;
    
    writeFileSync(filePath, migrationContent, 'utf8');
    return filePath;
  }
}

export async function generateMigration(config: SchemaSyncConfig, name?: string): Promise<string | null> {
  const generator = new MigrationGenerator(config);
  return await generator.generate(name);
}