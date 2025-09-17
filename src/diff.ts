import { Sequelize, ModelStatic, Model, QueryInterface, DataTypes } from 'sequelize';
import { SchemaSyncConfig, SchemaDiff, TableDifference, ColumnDifference } from './types';
import { loadModelsFromConfig } from './model-loader';

interface DatabaseDialectHandler {
  normalizeType(type: string): string;
  isAutoIncrement(column: any): boolean;
  normalizeDefaultValue(value: any): any;
  filterSystemTables(tables: string[]): string[];
  compareBooleans(existing: any, model: any): boolean;
}

export class SchemaDiffer {
  private sequelize: Sequelize;
  private config: SchemaSyncConfig;
  private queryInterface: QueryInterface;
  private debug: boolean;
  private dialect: string;
  private dialectHandler: DatabaseDialectHandler;

  constructor(config: SchemaSyncConfig, debug = false) {
    this.sequelize = config.sequelize;
    this.config = config;
    this.queryInterface = this.sequelize.getQueryInterface();
    this.debug = debug;
    this.dialect = this.sequelize.getDialect();
    this.dialectHandler = this.createDialectHandler();
  }

  private createDialectHandler(): DatabaseDialectHandler {
    switch (this.dialect) {
      case 'postgres':
        return new PostgreSQLHandler();
      case 'mysql':
      case 'mariadb':
        return new MySQLHandler();
      case 'sqlite':
        return new SQLiteHandler();
      default:
        return new GenericHandler();
    }
  }

  private log(...args: any[]) {
    if (this.debug) {
      console.log(`[${this.dialect.toUpperCase()}]`, ...args);
    }
  }

  // Type-safe helper to get table name from model
  private getTableName(model: ModelStatic<Model>): string {
    const modelAny = model as any;
    return modelAny.tableName || modelAny.getTableName?.() || model.name;
  }

  // Type-safe helper to get raw attributes from model
  private getRawAttributes(model: ModelStatic<Model>): any {
    const modelAny = model as any;
    return modelAny.rawAttributes || modelAny.attributes || {};
  }

  async generateDiff(): Promise<SchemaDiff> {
    const differences: TableDifference[] = [];
    
    // Load models using the new loader
    const models = await loadModelsFromConfig(this.config);
    this.log(`Loaded ${models.length} models:`, models.map(m => (m as any).tableName || m.name));
    
    // Get current database schema
    const existingTables = await this.getExistingTables();
    this.log(`Found ${existingTables.length} existing tables:`, existingTables);
    
    const modelTableNames = models.map(model => (model as any).tableName || model.name);
    this.log(`Model table names:`, modelTableNames);
    
    // Debug: Show table name comparison
    for (const modelTable of modelTableNames) {
      const exists = existingTables.includes(modelTable);
      this.log(`Table ${modelTable} exists in DB: ${exists}`);
    }
    
    // Check for new tables (models that don't exist in DB)
    for (const model of models) {
      const tableName = (model as any).tableName || model.name;
      
      if (!existingTables.includes(tableName)) {
        this.log(`Table ${tableName} does not exist, will create`);
        differences.push({
          table: tableName,
          action: 'create',
          definition: await this.getModelTableDefinition(model)
        });
      } else {
        this.log(`Comparing table ${tableName} for changes...`);
        const columnDiffs = await this.compareTableColumns(model);
        
        if (columnDiffs.length > 0) {
          this.log(`Found ${columnDiffs.length} column differences for table ${tableName}`);
          differences.push({
            table: tableName,
            action: 'alter',
            columns: columnDiffs
          });
        } else {
          this.log(`No changes detected for table ${tableName}`);
        }
      }
    }
    
    // Check for tables to drop (tables that exist in DB but not in models)
    for (const existingTable of existingTables) {
      if (!modelTableNames.includes(existingTable)) {
        this.log(`Table ${existingTable} exists in DB but not in models, will drop`);
        differences.push({
          table: existingTable,
          action: 'drop'
        });
      }
    }
    
    this.log(`Schema diff complete: ${differences.length} total differences found`);
    
    return {
      tables: differences,
      hasChanges: differences.length > 0
    };
  }

  private async getExistingTables(): Promise<string[]> {
    try {
      console.log(`[DEBUG] Checking existing tables for ${this.dialect}...`);
      
      let tables: string[] = [];
      
      // Try multiple approaches to get table names
      if (this.dialect === 'postgres') {
        // Direct PostgreSQL query - most reliable
        try {
          const [results] = await this.sequelize.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_type = 'BASE TABLE'
            ORDER BY table_name;
          `);
          tables = (results as any[]).map(row => row.table_name);
          console.log(`[DEBUG] PostgreSQL direct query found ${tables.length} tables:`, tables);
        } catch (error) {
          console.log(`[DEBUG] PostgreSQL direct query failed:`, typeof error === 'object' && error !== null && 'message' in error ? (error as any).message : error);
        }
      }
      
      // Fallback to showAllTables if direct query didn't work or for other databases
      if (tables.length === 0) {
        try {
          const rawTables = await this.queryInterface.showAllTables();
          console.log(`[DEBUG] showAllTables() returned:`, rawTables);
          console.log(`[DEBUG] Type: ${typeof rawTables}, IsArray: ${Array.isArray(rawTables)}`);
          
          if (Array.isArray(rawTables)) {
            tables = rawTables.map(table => {
              if (typeof table === 'string') return table;
              if (typeof table === 'object' && table !== null) {
                if (typeof table === 'object' && table !== null) {
                  return (table as any).tableName || (table as any).table_name || (table as any).name || String(table);
                }
                return String(table);
              }
              return String(table);
            });
          }
          console.log(`[DEBUG] Processed showAllTables result:`, tables);
        } catch (error) {
          console.log(`[DEBUG] showAllTables() failed:`, typeof error === 'object' && error !== null && 'message' in error ? (error as any).message : error);
        }
      }
      
      // Filter system tables
      const filteredTables = this.dialectHandler.filterSystemTables(tables);
      console.log(`[DEBUG] After filtering system tables:`, filteredTables);
      
      // Final validation - check if we can describe at least one table
      if (filteredTables.length > 0) {
        try {
          const testTable = filteredTables[0];
          const description = await this.queryInterface.describeTable(testTable);
          console.log(`[DEBUG] Successfully described table ${testTable}:`, Object.keys(description));
        } catch (error) {
          console.log(`[DEBUG] Warning: Could not describe table ${filteredTables[0]}:`, typeof error === 'object' && error !== null && 'message' in error ? (error as any).message : error);
          // If we can't describe any table, maybe they don't exist
          if (typeof error === 'object' && error !== null && 'message' in error && typeof (error as any).message === 'string') {
            const errMsg = (error as any).message;
            if (errMsg.includes('does not exist') || errMsg.includes('doesn\'t exist')) {
              console.log(`[DEBUG] Tables don't seem to exist, returning empty array`);
              return [];
            }
          }
        }
      }
      
      return filteredTables;
      
    } catch (error) {
      console.warn('Could not retrieve existing tables:', error);
      return [];
    }
  }

  private async getModelTableDefinition(model: ModelStatic<Model>): Promise<any> {
    const attributes = (model as any).rawAttributes;
    const tableDefinition: Record<string, any> = {};
    
    for (const [columnName, attribute] of Object.entries(attributes)) {
      tableDefinition[columnName] = this.convertAttributeToQueryInterface(attribute as any);
    }
    
    return tableDefinition;
  }

  private async compareTableColumns(model: ModelStatic<Model>): Promise<ColumnDifference[]> {
    const tableName = (model as any).tableName || model.name;
    const differences: ColumnDifference[] = [];
    
    try {
      const existingColumns = await this.queryInterface.describeTable(tableName);
      const modelAttributes = (model as any).rawAttributes;
      
      this.log(`Comparing columns for table ${tableName}`);
      this.log(`DB columns:`, Object.keys(existingColumns));
      this.log(`Model columns:`, Object.keys(modelAttributes));
      
      const existingColumnNames = Object.keys(existingColumns);
      const modelColumnNames = Object.keys(modelAttributes);
      
      // Check for new columns
      for (const columnName of modelColumnNames) {
        if (!existingColumnNames.includes(columnName)) {
          this.log(`Column ${columnName} is new (not in DB)`);
          differences.push({
            column: columnName,
            action: 'add',
            to: this.convertAttributeToQueryInterface(modelAttributes[columnName])
          });
        } else {
          const existingColumn = existingColumns[columnName];
          const modelColumn = modelAttributes[columnName];
          
          this.log(`Checking column ${columnName} for changes...`);
          
          if (this.hasColumnChanged(existingColumn, modelColumn)) {
            this.log(`Column ${columnName} has changed`);
            differences.push({
              column: columnName,
              action: 'change',
              from: existingColumn,
              to: this.convertAttributeToQueryInterface(modelColumn)
            });
          }
        }
      }
      
      // Check for columns to remove
      for (const columnName of existingColumnNames) {
        if (!modelColumnNames.includes(columnName)) {
          this.log(`Column ${columnName} should be removed (not in model)`);
          differences.push({
            column: columnName,
            action: 'remove',
            from: existingColumns[columnName]
          });
        }
      }
      
    } catch (error) {
      console.warn(`Could not describe table ${tableName}:`, error);
    }
    
    return differences;
  }

  private convertAttributeToQueryInterface(attribute: any): any {
    const converted: any = {
      type: attribute.type,
      allowNull: attribute.allowNull !== false
    };
    
    if (attribute.primaryKey) converted.primaryKey = true;
    if (attribute.autoIncrement) converted.autoIncrement = true;
    if (attribute.defaultValue !== undefined) converted.defaultValue = attribute.defaultValue;
    if (attribute.unique) converted.unique = true;
    if (attribute.references) converted.references = attribute.references;
    
    return converted;
  }

  private hasColumnChanged(existingColumn: any, modelColumn: any): boolean {
    // Enhanced type comparison with special handling for common mismatches
    const existingType = this.dialectHandler.normalizeType(this.getTypeString(existingColumn.type));
    const modelType = this.dialectHandler.normalizeType(this.getTypeString(modelColumn.type));
    
    // Special handling for common PostgreSQL vs Sequelize type mismatches
    if (!this.areTypesEquivalent(existingType, modelType, existingColumn, modelColumn)) {
      this.log(`Type difference: existing=${existingType}, model=${modelType}`);
      return true;
    }

    // Nullability comparison
    const existingAllowNull = this.getNullability(existingColumn);
    const modelAllowNull = this.getNullability(modelColumn);
    
    if (existingAllowNull !== modelAllowNull) {
      this.log(`Nullability difference: existing=${existingAllowNull}, model=${modelAllowNull}`);
      return true;
    }

    // Primary key comparison
    const existingPK = !!existingColumn.primaryKey;
    const modelPK = !!modelColumn.primaryKey;
    if (existingPK !== modelPK) {
      this.log(`Primary key difference: existing=${existingPK}, model=${modelPK}`);
      return true;
    }

    // Auto increment comparison
    const existingAI = this.dialectHandler.isAutoIncrement(existingColumn);
    const modelAI = !!modelColumn.autoIncrement;
    if (existingAI !== modelAI) {
      this.log(`Auto increment difference: existing=${existingAI}, model=${modelAI}`);
      return true;
    }

    // Unique constraint comparison
    const existingUnique = !!existingColumn.unique;
    const modelUnique = !!modelColumn.unique;
    if (existingUnique !== modelUnique) {
      this.log(`Unique constraint difference: existing=${existingUnique}, model=${modelUnique}`);
      return true;
    }

    // Default value comparison - skip for auto-increment and primary key columns
    if (!existingAI && !modelAI && !existingPK) {
      const existingDefault = this.dialectHandler.normalizeDefaultValue(existingColumn.defaultValue);
      const modelDefault = this.dialectHandler.normalizeDefaultValue(modelColumn.defaultValue);
      
      if (existingDefault !== modelDefault) {
        this.log(`Default value difference: existing=${JSON.stringify(existingDefault)}, model=${JSON.stringify(modelDefault)}`);
        return true;
      }
    }

    return false;
  }

  private areTypesEquivalent(existingType: string, modelType: string, existingColumn: any, modelColumn: any): boolean {
    // Direct match
    if (existingType === modelType) return true;
    
    // Handle double vs float equivalence
    if ((existingType === 'double' && modelType === 'float') || 
        (existingType === 'float' && modelType === 'double')) {
      return true;
    }
    
    // Handle PostgreSQL time vs timestamptz equivalence
    if ((existingType === 'time' && modelType === 'timestamptz') ||
        (existingType === 'timestamptz' && modelType === 'timestamptz')) {
      return true;
    }
    
    // Handle enum vs varchar equivalence for PostgreSQL
    if ((existingType === 'enum_or_varchar' && modelType === 'enum_or_varchar') ||
        (existingType === 'varchar' && modelType === 'enum') ||
        (existingType === 'enum' && modelType === 'varchar')) {
      return true;
    }
    
    // Handle array type equivalence (e.g., varchar vs varchar[])
    if (existingType.includes('[]') !== modelType.includes('[]')) {
      // One is array, one is not - check if this is intentional
      const baseExisting = existingType.replace('[]', '');
      const baseModel = modelType.replace('[]', '');
      
      // If base types match but array status differs, it's a real change
      if (baseExisting === baseModel) {
        return false; // This is a legitimate change
      }
    }
    
    return false;
  }

  private getTypeString(type: any): string {
    if (typeof type === 'string') return type;
    if (type && typeof type.toString === 'function') {
      const typeStr = type.toString();
      // Handle Sequelize DataTypes.ARRAY(DataTypes.STRING) format
      if (typeStr.includes('ARRAY') && typeStr.includes('STRING')) {
        return 'varchar[]';
      }
      if (typeStr.includes('ARRAY') && typeStr.includes('TEXT')) {
        return 'text[]';
      }
      if (typeStr.includes('ENUM')) {
        return 'enum';
      }
      if (typeStr.includes('FLOAT') || typeStr.includes('REAL')) {
        return 'float';
      }
      if (typeStr.includes('DOUBLE')) {
        return 'double';
      }
      if (typeStr.includes('DATE') || typeStr.includes('TIMESTAMP')) {
        return 'timestamptz';
      }
      return typeStr;
    }
    return String(type);
  }

  private getNullability(column: any): boolean {
    // Primary keys and auto-increment columns are never nullable
    if (column.primaryKey || column.autoIncrement) return false;
    return column.allowNull !== false;
  }
}

// Database-specific handlers
class PostgreSQLHandler implements DatabaseDialectHandler {
  normalizeType(type: string): string {
    const typeStr = type.toLowerCase().trim();
    
    const typeMap: Record<string, string> = {
      'character varying': 'varchar',
      'character varying(255)': 'varchar',
      'double precision': 'double',
      'timestamp without time zone': 'timestamptz',
      'timestamp with time zone': 'timestamptz',
      'time without time zone': 'timestamptz',
      'time': 'timestamptz', // Fix: PostgreSQL 'time' should match Sequelize TIMESTAMPTZ
      'integer': 'integer',
      'bigint': 'bigint',
      'smallint': 'smallint',
      'real': 'float',
      'float': 'float', // Add explicit float mapping
      'double': 'double',
      'numeric': 'decimal',
      'boolean': 'boolean',
      'text': 'text',
      'json': 'json',
      'jsonb': 'jsonb',
      'uuid': 'uuid',
      'varchar[]': 'varchar[]', // Handle array types
      'text[]': 'text[]'
    };

    for (const [pgType, normalized] of Object.entries(typeMap)) {
      if (typeStr.includes(pgType)) return normalized;
    }

    // Handle ENUM vs VARCHAR comparison - treat as equivalent
    if (typeStr.includes('enum') || typeStr.includes('varchar')) {
      return 'enum_or_varchar'; // Unified type for comparison
    }

    return typeStr.replace(/\(\d+(\,\s*\d+)?\)/g, '');
  }

  isAutoIncrement(column: any): boolean {
    return !!(column.autoIncrement || 
             (column.defaultValue && 
              typeof column.defaultValue === 'string' && 
              column.defaultValue.includes('nextval')));
  }

  normalizeDefaultValue(value: any): any {
    if (value === undefined || value === null) return null;
    
    if (typeof value === 'string') {
      const lowerValue = value.toLowerCase().trim();
      
      if (lowerValue === 'now()' || lowerValue === 'current_timestamp' || 
          lowerValue.includes('now()')) {
        return 'CURRENT_TIMESTAMP';
      }
      
      if (lowerValue === 'true' || lowerValue === 't') return true;
      if (lowerValue === 'false' || lowerValue === 'f') return false;
      
      // Handle quoted numeric strings - normalize "0" to 0
      if ((value.startsWith("'") && value.endsWith("'")) ||
          (value.startsWith('"') && value.endsWith('"'))) {
        const unquoted = value.slice(1, -1);
        // Convert numeric strings to numbers for comparison
        if (/^\d+$/.test(unquoted)) return parseInt(unquoted, 10);
        if (/^\d+\.\d+$/.test(unquoted)) return parseFloat(unquoted);
        return unquoted;
      }
      
      // Parse numeric strings
      if (/^\d+$/.test(value)) return parseInt(value, 10);
      if (/^\d+\.\d+$/.test(value)) return parseFloat(value);
    }
    
    // Handle numeric values
    if (typeof value === 'number') return value;
    
    return value;
  }

  filterSystemTables(tables: string[]): string[] {
    return tables.filter(table => {
      const lowerTable = table.toLowerCase();
      return !lowerTable.startsWith('pg_') &&
             lowerTable !== 'information_schema' &&
             !lowerTable.includes('sequelizemeta') &&
             !lowerTable.startsWith('sql_') && // Additional PostgreSQL system tables
             lowerTable !== 'dual'; // Oracle dual table sometimes appears
    });
  }

  compareBooleans(existing: any, model: any): boolean {
    return existing === model;
  }
}

class MySQLHandler implements DatabaseDialectHandler {
  normalizeType(type: string): string {
    const typeStr = type.toLowerCase().trim();
    
    const typeMap: Record<string, string> = {
      'tinyint(1)': 'boolean',
      'tinyint': 'tinyint',
      'smallint': 'smallint',
      'mediumint': 'mediumint',
      'int': 'integer',
      'integer': 'integer',
      'bigint': 'bigint',
      'decimal': 'decimal',
      'numeric': 'decimal',
      'float': 'float',
      'double': 'double',
      'real': 'double',
      'bit': 'bit',
      'boolean': 'boolean',
      'serial': 'bigint',
      'char': 'char',
      'varchar': 'varchar',
      'binary': 'binary',
      'varbinary': 'varbinary',
      'tinyblob': 'blob',
      'tinytext': 'text',
      'text': 'text',
      'blob': 'blob',
      'mediumtext': 'mediumtext',
      'mediumblob': 'mediumblob',
      'longtext': 'longtext',
      'longblob': 'longblob',
      'enum': 'enum',
      'set': 'set',
      'date': 'date',
      'datetime': 'datetime',
      'timestamp': 'timestamp',
      'time': 'time',
      'year': 'year',
      'json': 'json'
    };

    for (const [mysqlType, normalized] of Object.entries(typeMap)) {
      if (typeStr.includes(mysqlType)) return normalized;
    }

    return typeStr.replace(/\(\d+(\,\s*\d+)?\)/g, '');
  }

  isAutoIncrement(column: any): boolean {
    return !!(column.autoIncrement || 
             (column.extra && column.extra.toLowerCase().includes('auto_increment')));
  }

  normalizeDefaultValue(value: any): any {
    if (value === undefined || value === null) return null;
    
    if (typeof value === 'string') {
      const lowerValue = value.toLowerCase().trim();
      
      if (lowerValue === 'current_timestamp' || lowerValue === 'current_timestamp()' || 
          lowerValue === 'now()') {
        return 'CURRENT_TIMESTAMP';
      }
      
      if (lowerValue === '1') return true;
      if (lowerValue === '0') return false;
      
      // Remove quotes
      if ((value.startsWith("'") && value.endsWith("'")) ||
          (value.startsWith('"') && value.endsWith('"'))) {
        return value.slice(1, -1);
      }
      
      // Parse numbers
      if (/^\d+$/.test(value)) return parseInt(value, 10);
      if (/^\d+\.\d+$/.test(value)) return parseFloat(value);
    }
    
    return value;
  }

  filterSystemTables(tables: string[]): string[] {
    return tables.filter(table => {
      const lowerTable = table.toLowerCase();
      return lowerTable !== 'information_schema' &&
             lowerTable !== 'performance_schema' &&
             lowerTable !== 'mysql' &&
             lowerTable !== 'sys' &&
             !lowerTable.includes('sequelizemeta');
    });
  }

  compareBooleans(existing: any, model: any): boolean {
    const existingBool = existing === 1 || existing === '1' || existing === true;
    const modelBool = model === 1 || model === '1' || model === true;
    return existingBool === modelBool;
  }
}

class SQLiteHandler implements DatabaseDialectHandler {
  normalizeType(type: string): string {
    const typeStr = type.toLowerCase().trim();
    
    const typeMap: Record<string, string> = {
      'integer': 'integer',
      'real': 'real',
      'text': 'text',
      'blob': 'blob',
      'numeric': 'numeric',
      'boolean': 'boolean',
      'datetime': 'datetime',
      'date': 'date',
      'time': 'time',
      'varchar': 'varchar',
      'char': 'char',
      'decimal': 'decimal',
      'float': 'real',
      'double': 'real'
    };

    for (const [sqliteType, normalized] of Object.entries(typeMap)) {
      if (typeStr.includes(sqliteType)) return normalized;
    }

    return typeStr.replace(/\(\d+(\,\s*\d+)?\)/g, '');
  }

  isAutoIncrement(column: any): boolean {
    // In SQLite, only INTEGER PRIMARY KEY is auto-increment
    return !!(column.autoIncrement || 
             (column.primaryKey && this.normalizeType(String(column.type)) === 'integer'));
  }

  normalizeDefaultValue(value: any): any {
    if (value === undefined || value === null) return null;
    
    if (typeof value === 'string') {
      const lowerValue = value.toLowerCase().trim();
      
      if (lowerValue === 'current_timestamp' || lowerValue === "datetime('now')") {
        return 'CURRENT_TIMESTAMP';
      }
      
      if (lowerValue === '1') return 1;
      if (lowerValue === '0') return 0;
      
      // Remove quotes
      if ((value.startsWith("'") && value.endsWith("'")) ||
          (value.startsWith('"') && value.endsWith('"'))) {
        return value.slice(1, -1);
      }
      
      // Parse numbers
      if (/^\d+$/.test(value)) return parseInt(value, 10);
      if (/^\d+\.\d+$/.test(value)) return parseFloat(value);
    }
    
    return value;
  }

  filterSystemTables(tables: string[]): string[] {
    return tables.filter(table => {
      const lowerTable = table.toLowerCase();
      return !lowerTable.startsWith('sqlite_') &&
             lowerTable !== 'sqlite_sequence' &&
             !lowerTable.includes('sequelizemeta');
    });
  }

  compareBooleans(existing: any, model: any): boolean {
    // SQLite stores booleans as integers
    const existingBool = existing === 1 || existing === '1';
    const modelBool = model === 1 || model === '1' || model === true;
    return existingBool === modelBool;
  }
}

class GenericHandler implements DatabaseDialectHandler {
  normalizeType(type: string): string {
    return type.toLowerCase().replace(/\(\d+(\,\s*\d+)?\)/g, '');
  }

  isAutoIncrement(column: any): boolean {
    return !!column.autoIncrement;
  }

  normalizeDefaultValue(value: any): any {
    return value;
  }

  filterSystemTables(tables: string[]): string[] {
    return tables.filter(table => 
      !table.toLowerCase().includes('sequelizemeta')
    );
  }

  compareBooleans(existing: any, model: any): boolean {
    return existing === model;
  }
}

export async function generateSchemaDiff(config: SchemaSyncConfig, debug = false): Promise<SchemaDiff> {
  const differ = new SchemaDiffer(config, debug);
  return await differ.generateDiff();
}