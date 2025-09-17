import { Sequelize, ModelStatic, Model } from 'sequelize';
import { readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { SchemaSyncConfig } from './types';

export class ModelLoader {
  private sequelize: Sequelize;
  private modelsPath?: string;

  constructor(sequelize: Sequelize, modelsPath?: string) {
    this.sequelize = sequelize;
    this.modelsPath = modelsPath;
  }

  /**
   * Load models from configuration
   */
  async loadModels(config: SchemaSyncConfig): Promise<ModelStatic<Model>[]> {
    // If models are provided directly, return them
    if (config.models && config.models.length > 0) {
      return config.models;
    }

    // Otherwise, load from directory
    if (config.modelsPath) {
      return this.loadModelsFromDirectory(config.modelsPath);
    }

    throw new Error('Either models array or modelsPath must be provided in config');
  }

  /**
   * Load models from directory
   */
  async loadModelsFromDirectory(modelsPath: string): Promise<ModelStatic<Model>[]> {
    const resolvedPath = resolve(modelsPath);
    console.log(`🔍 Loading models from: ${resolvedPath}`);

    const models: ModelStatic<Model>[] = [];

    try {
      // Register ts-node for TypeScript files
      try {
        require('ts-node').register({
          compilerOptions: {
            module: 'commonjs',
            esModuleInterop: true,
            allowSyntheticDefaultImports: true,
            strict: false, // Allow implicit any types for dynamic loading
            skipLibCheck: true
          },
          transpileOnly: true, // Skip type checking for faster compilation
        });
      } catch {
        // ts-node not available, that's okay for JS files
        console.warn('⚠️  ts-node not available, TypeScript model files may not load correctly');
      }

      const files = this.getModelFiles(resolvedPath);
      console.log(`📂 Found ${files.length} model file(s)`);
      
      for (const file of files) {
        try {
          // Clear require cache to ensure fresh loading
          delete require.cache[file];
          
          const moduleExports = require(file);
          const model = this.extractModelFromModule(moduleExports, file);
          
          if (model) {
            models.push(model);
            console.log(`  ✅ Loaded model: ${model.name} from ${file}`);
          }
        } catch (error) {
          console.warn(`  ❌ Failed to load model from ${file}:`, error);
        }
      }

      console.log(`📦 Successfully loaded ${models.length} models`);
      return models;

    } catch (error) {
      throw new Error(`Failed to load models from directory ${resolvedPath}: ${error}`);
    }
  }

  /**
   * Get all model files from directory (recursive)
   */
  private getModelFiles(dirPath: string): string[] {
    const files: string[] = [];
    const entries = readdirSync(dirPath);

    for (const entry of entries) {
      const fullPath = join(dirPath, entry);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        // Recursively search subdirectories
        files.push(...this.getModelFiles(fullPath));
      } else if (stat.isFile() && this.isModelFile(entry)) {
        files.push(fullPath);
      }
    }

    return files;
  }

  /**
   * Check if file is a model file
   */
  private isModelFile(filename: string): boolean {
    // Skip index files and test files
    if (filename.toLowerCase().includes('index') || filename.toLowerCase().includes('test')) {
      return false;
    }

    // Only include TypeScript and JavaScript files
    return filename.endsWith('.ts') || filename.endsWith('.js');
  }

  /**
   * Extract model from module exports
   */
  private extractModelFromModule(moduleExports: any, filePath: string): ModelStatic<Model> | null {
    // Try different export patterns
    
    // 1. Default export that's a function (like your AnimationViewModel)
    if (typeof moduleExports.default === 'function') {
      try {
        const modelInstance = moduleExports.default(this.sequelize);
        if (this.isValidModel(modelInstance)) {
          return modelInstance;
        }
      } catch (error) {
        console.warn(`Failed to initialize model from default export in ${filePath}:`, error);
      }
    }

    // 2. Named export that's a function (like AnimationViewModel)
    for (const exportName of Object.keys(moduleExports)) {
      if (typeof moduleExports[exportName] === 'function' && exportName.toLowerCase().includes('model')) {
        try {
          const modelInstance = moduleExports[exportName](this.sequelize);
          if (this.isValidModel(modelInstance)) {
            return modelInstance;
          }
        } catch (error) {
          console.warn(`    ⚠️  Failed to initialize model from ${exportName}:`, error);
        }
      }
    }

    // 3. Direct model class export (like AnimationView)
    for (const exportName of Object.keys(moduleExports)) {
      const exportValue = moduleExports[exportName];
      if (this.isValidModel(exportValue)) {
        return exportValue;
      }
    }

    // 4. Look for common naming patterns
    const commonNames = ['model', 'Model', 'default'];
    for (const name of commonNames) {
      if (moduleExports[name] && this.isValidModel(moduleExports[name])) {
        return moduleExports[name];
      }
    }

    return null;
  }

  /**
   * Check if object is a valid Sequelize model
   */
  private isValidModel(obj: any): obj is ModelStatic<Model> {
    return (
      obj &&
      typeof obj === 'function' &&
      obj.prototype &&
      typeof obj.init === 'function' &&
      // A Sequelize model should have these properties after init
      (typeof obj.tableName === 'string' || typeof obj.getTableName === 'function') &&
      // It should have a sequelize instance attached
      obj.sequelize &&
      // And model options
      obj.options
    );
  }

  /**
   * Validate model directory path
   */
  private validateModelsPath(modelsPath: string): void {
    const resolvedPath = resolve(modelsPath);
    try {
      const stat = statSync(resolvedPath);
      if (!stat.isDirectory()) {
        throw new Error(`Models path is not a directory: ${resolvedPath}`);
      }
    } catch (error) {
      throw new Error(`Invalid models path: ${resolvedPath} - ${error}`);
    }
  }
}

/**
 * Convenience function to load models from config
 */
export async function loadModelsFromConfig(config: SchemaSyncConfig): Promise<ModelStatic<Model>[]> {
  const loader = new ModelLoader(config.sequelize, config.modelsPath);
  return await loader.loadModels(config);
}