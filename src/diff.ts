import { Sequelize, ModelStatic, Model, QueryInterface, DataTypes } from 'sequelize';
import { SchemaSyncConfig, SchemaDiff, TableDifference, ColumnDifference } from './types';
import { loadModelsFromConfig } from './model-loader';

export class SchemaDiffer {
  private sequelize: Sequelize;
  private config: SchemaSyncConfig;
  private queryInterface: QueryInterface;
  private debug: boolean;

  constructor(config: SchemaSyncConfig, debug = false) {
    this.sequelize = config.sequelize;
    this.config = config;
    this.queryInterface = this.sequelize.getQueryInterface();
    this.debug = debug;
  }

  private log(...args: any[]) {
    if (this.debug) {
      console.log(...args);
    }
  }

  async generateDiff(): Promise<SchemaDiff> {
    const differences: TableDifference[] = [];
    
    // Load models using the new loader
    const models = await loadModelsFromConfig(this.config);
    this.log(`Loaded ${models.length} models:`, models.map(m => m.tableName));
    
    // Get current database schema
    const existingTables = await this.getExistingTables();
    this.log(`Found ${existingTables.length} existing tables:`, existingTables);
    
    const modelTableNames = models.map(model => model.tableName);
    
    // Check for new tables (models that don't exist in DB)
    for (const model of models) {
      const tableName = model.tableName;
      
      if (!existingTables.includes(tableName)) {
        this.log(`Table ${tableName} does not exist, will create`);
        // Table doesn't exist, need to create it
        differences.push({
          table: tableName,
          action: 'create',
          definition: await this.getModelTableDefinition(model)
        });
      } else {
        this.log(`Comparing table ${tableName} for changes...`);
        // Table exists, check for column differences
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
      const tables = await this.queryInterface.showAllTables();
      // Filter out system/migration tables that should be ignored
      return tables.filter(table => {
        const tableName = table.toLowerCase();
        return !tableName.includes('sequelizemeta') && 
               !tableName.includes('sqlite_sequence') &&
               !tableName.startsWith('sqlite_');
      });
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
    const tableName = model.tableName;
    const differences: ColumnDifference[] = [];
    
    try {
      // Get existing columns from database
      const existingColumns = await this.queryInterface.describeTable(tableName);
      const modelAttributes = model.rawAttributes;
      
      this.log(`Comparing columns for table ${tableName}`);
      this.log(`DB columns:`, Object.keys(existingColumns));
      this.log(`Model columns:`, Object.keys(modelAttributes));
      
      const existingColumnNames = Object.keys(existingColumns);
      const modelColumnNames = Object.keys(modelAttributes);
      
      // Check for new columns (in model but not in DB)
      for (const columnName of modelColumnNames) {
        if (!existingColumnNames.includes(columnName)) {
          this.log(`Column ${columnName} is new (not in DB)`);
          differences.push({
            column: columnName,
            action: 'add',
            to: this.convertAttributeToQueryInterface(modelAttributes[columnName])
          });
        } else {
          // Column exists, check for changes
          const existingColumn = existingColumns[columnName];
          const modelColumn = modelAttributes[columnName];
          
          this.log(`Checking column ${columnName} for changes...`);
          this.log(`DB column:`, JSON.stringify(existingColumn, null, 2));
          this.log(`Model column:`, JSON.stringify(modelColumn, null, 2));
          
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
      
      // Check for columns to remove (in DB but not in model)
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
    
    if (attribute.primaryKey) {
      converted.primaryKey = true;
    }
    
    if (attribute.autoIncrement) {
      converted.autoIncrement = true;
    }
    
    if (attribute.defaultValue !== undefined) {
      converted.defaultValue = attribute.defaultValue;
    }
    
    if (attribute.unique) {
      converted.unique = true;
    }
    
    if (attribute.references) {
      converted.references = attribute.references;
    }
    
    return converted;
  }

  private hasColumnChanged(existingColumn: any, modelColumn: any): boolean {
    // Normalize type for enums: treat varchar and enum as equivalent if values match
    let existingType = this.normalizeDataType(existingColumn.type);
    let modelType = this.normalizeDataType(modelColumn.type);

    // If model is ENUM and DB is VARCHAR, treat as equal if values match
    if (modelType === 'enum' && (existingType === 'varchar' || existingType === 'varchar(255)')) {
      if (modelColumn.values && Array.isArray(modelColumn.values)) {
        // Optionally, check DB for enum values if available
        // If not, treat as equivalent
        existingType = 'enum';
      }
    }

    // Normalize timestamp types
    if ((existingType === 'time' || existingType === 'timestamp' || existingType === 'timestamptz') &&
        (modelType === 'date' || modelType === 'timestamptz')) {
      existingType = modelType = 'date';
    }

    if (existingType !== modelType) {
      this.log(`Type difference for column: existing=${existingType}, model=${modelType}`);
      return true;
    }

    // Nullability: treat PK and autoIncrement as always NOT NULL
    let existingAllowNull = existingColumn.allowNull;
    let modelAllowNull = modelColumn.allowNull !== false;
    if (modelColumn.primaryKey || modelColumn.autoIncrement) {
      modelAllowNull = false;
    }
    if (existingColumn.primaryKey || existingColumn.autoIncrement) {
      existingAllowNull = false;
    }
    if (existingAllowNull !== modelAllowNull) {
      this.log(`Nullability difference: existing=${existingAllowNull}, model=${modelAllowNull}`);
      return true;
    }

    // Primary key
    const existingPK = !!existingColumn.primaryKey;
    const modelPK = !!modelColumn.primaryKey;
    if (existingPK !== modelPK) {
      this.log(`Primary key difference: existing=${existingPK}, model=${modelPK}`);
      return true;
    }

    // Auto increment: treat DB nextval as equivalent to model autoIncrement
    let existingAI = !!existingColumn.autoIncrement;
    let modelAI = !!modelColumn.autoIncrement;
    if (!existingAI && typeof existingColumn.defaultValue === 'string' && existingColumn.defaultValue.includes('nextval')) {
      existingAI = true;
    }
    if (existingAI !== modelAI) {
      this.log(`Auto increment difference: existing=${existingAI}, model=${modelAI}`);
      return true;
    }

    // Unique constraint
    const existingUnique = !!existingColumn.unique;
    const modelUnique = !!modelColumn.unique;
    if (existingUnique !== modelUnique) {
      this.log(`Unique constraint difference: existing=${existingUnique}, model=${modelUnique}`);
      return true;
    }

    // Default values: treat DB nextval and model autoIncrement as equivalent
    let existingDefault = this.normalizeDefaultValue(existingColumn.defaultValue);
    let modelDefault = this.normalizeDefaultValue(modelColumn.defaultValue);
    if (modelAI && typeof existingColumn.defaultValue === 'string' && existingColumn.defaultValue.includes('nextval')) {
      existingDefault = modelDefault;
    }
    if (existingDefault !== modelDefault) {
      this.log(`Default value difference: existing=${JSON.stringify(existingDefault)}, model=${JSON.stringify(modelDefault)}`);
      return true;
    }

    return false;
  }

  private normalizeDataType(type: any): string {
    let typeStr = '';
    
    if (typeof type === 'string') {
      typeStr = type.toLowerCase();
    } else if (type && typeof type.toString === 'function') {
      typeStr = type.toString().toLowerCase();
    } else {
      typeStr = String(type).toLowerCase();
    }
    
    // Normalize common PostgreSQL/database types to standard forms
    const typeMap: Record<string, string> = {
      'character varying': 'varchar',
      'character varying(255)': 'varchar(255)',
      'integer': 'integer',
      'bigint': 'bigint',
      'double precision': 'double',
      'real': 'float',
      'boolean': 'boolean',
      'timestamp without time zone': 'timestamp',
      'timestamp with time zone': 'timestamptz',
      'time without time zone': 'time',
      'text': 'text',
      'json': 'json',
      'jsonb': 'jsonb',
      'decimal': 'decimal',
      'numeric': 'decimal',
      'uuid': 'uuid'
    };
    
    // Apply normalization
    for (const [pgType, normalized] of Object.entries(typeMap)) {
      if (typeStr.includes(pgType)) {
        typeStr = normalized;
        break;
      }
    }
    
    // Remove precision/scale for comparison purposes
    typeStr = typeStr.replace(/\(\d+(\,\d+)?\)/g, '');
    
    return typeStr;
  }

  private normalizeDefaultValue(value: any): any {
    // Handle undefined/null
    if (value === undefined || value === null) {
      return null;
    }
    
    // Handle DataTypes.NOW
    if (value && value.toString && value.toString() === 'DataTypes.NOW') {
      return 'now()';
    }
    
    // Convert string values
    if (typeof value === 'string') {
      const lowerValue = value.toLowerCase().trim();
      
      // PostgreSQL specific default value normalization
      if (lowerValue === 'now()' || lowerValue === 'current_timestamp' || 
          lowerValue.includes('now()') || lowerValue.includes('current_timestamp')) {
        return 'now()';
      }
      
      // Handle quoted strings - remove quotes for comparison
      if ((value.startsWith("'") && value.endsWith("'")) ||
          (value.startsWith('"') && value.endsWith('"'))) {
        return value.slice(1, -1);
      }
      
      // Handle boolean strings
      if (lowerValue === 'true' || lowerValue === 't') return true;
      if (lowerValue === 'false' || lowerValue === 'f') return false;
      
      // Handle numeric strings
      if (/^\d+$/.test(value)) {
        return parseInt(value, 10);
      }
      
      if (/^\d+\.\d+$/.test(value)) {
        return parseFloat(value);
      }
      
      // Handle array/object defaults (PostgreSQL)
      if (lowerValue === '[]' || lowerValue === '{}') {
        return lowerValue === '[]' ? [] : null; // Convert {} to null for PostgreSQL compatibility
      }
    }
    
    // Handle boolean/numeric values
    if (typeof value === 'boolean' || typeof value === 'number') {
      return value;
    }
    
    return value;
  }
}

export async function generateSchemaDiff(config: SchemaSyncConfig, debug = false): Promise<SchemaDiff> {
  const differ = new SchemaDiffer(config, debug);
  return await differ.generateDiff();
}