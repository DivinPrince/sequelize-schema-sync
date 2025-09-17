import { Sequelize, ModelStatic, Model, QueryInterface, DataTypes } from 'sequelize';
import { SchemaSyncConfig, SchemaDiff, TableDifference, ColumnDifference } from './types';

export class SchemaDiffer {
  private sequelize: Sequelize;
  private models: ModelStatic<Model>[];
  private queryInterface: QueryInterface;

  constructor(config: SchemaSyncConfig) {
    this.sequelize = config.sequelize;
    this.models = config.models;
    this.queryInterface = this.sequelize.getQueryInterface();
  }

  async generateDiff(): Promise<SchemaDiff> {
    const differences: TableDifference[] = [];
    
    // Get current database schema
    const existingTables = await this.getExistingTables();
    const modelTableNames = this.models.map(model => model.tableName);
    
    // Check for new tables (models that don't exist in DB)
    for (const model of this.models) {
      const tableName = model.tableName;
      
      if (!existingTables.includes(tableName)) {
        // Table doesn't exist, need to create it
        differences.push({
          table: tableName,
          action: 'create',
          definition: await this.getModelTableDefinition(model)
        });
      } else {
        // Table exists, check for column differences
        const columnDiffs = await this.compareTableColumns(model);
        
        if (columnDiffs.length > 0) {
          differences.push({
            table: tableName,
            action: 'alter',
            columns: columnDiffs
          });
        }
      }
    }
    
    // Check for tables to drop (tables that exist in DB but not in models)
    for (const existingTable of existingTables) {
      if (!modelTableNames.includes(existingTable)) {
        differences.push({
          table: existingTable,
          action: 'drop'
        });
      }
    }
    
    return {
      tables: differences,
      hasChanges: differences.length > 0
    };
  }

  private async getExistingTables(): Promise<string[]> {
    try {
      const tables = await this.queryInterface.showAllTables();
      return tables;
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
      
      const existingColumnNames = Object.keys(existingColumns);
      const modelColumnNames = Object.keys(modelAttributes);
      
      // Check for new columns (in model but not in DB)
      for (const columnName of modelColumnNames) {
        if (!existingColumnNames.includes(columnName)) {
          differences.push({
            column: columnName,
            action: 'add',
            to: this.convertAttributeToQueryInterface(modelAttributes[columnName])
          });
        } else {
          // Column exists, check for changes
          const existingColumn = existingColumns[columnName];
          const modelColumn = modelAttributes[columnName];
          
          if (this.hasColumnChanged(existingColumn, modelColumn)) {
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
    // Compare type
    const existingType = this.normalizeDataType(existingColumn.type);
    const modelType = this.normalizeDataType(modelColumn.type);
    
    if (existingType !== modelType) {
      return true;
    }
    
    // Compare nullability
    if (existingColumn.allowNull !== (modelColumn.allowNull !== false)) {
      return true;
    }
    
    // Compare default values
    if (existingColumn.defaultValue !== modelColumn.defaultValue) {
      return true;
    }
    
    return false;
  }

  private normalizeDataType(type: any): string {
    if (typeof type === 'string') {
      return type.toLowerCase();
    }
    
    if (type && typeof type.toString === 'function') {
      return type.toString().toLowerCase();
    }
    
    return String(type).toLowerCase();
  }
}

export async function generateSchemaDiff(config: SchemaSyncConfig): Promise<SchemaDiff> {
  const differ = new SchemaDiffer(config);
  return await differ.generateDiff();
}