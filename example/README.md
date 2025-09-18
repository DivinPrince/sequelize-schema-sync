# Sequelize Schema Sync - Example

This example demonstrates how to use `sequelize-schema-sync` with directory-based model loading.

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Generate initial migration:**
   ```bash
   npm run generate
   ```

3. **Run migrations:**
   ```bash
   npm run migrate
   ```

4. **Test the models directory example:**
   ```bash
   npm run models-dir
   ```

## Configuration

The example uses directory-based model loading with the configuration in `schema-sync.config.ts`:

```typescript
const config: SchemaSyncConfig = {
  sequelize,
  modelsPath: './models',     // Auto-discover models from directory
  migrationsPath: './migrations',
};
```

## Model Pattern

Models in the `./models` directory use factory functions that take a `sequelize` instance:

```typescript
// models/AnimationView.ts
export const AnimationViewModel = (sequelize: Sequelize) => {
  AnimationView.init({
    // model definition
  }, {
    sequelize,
    modelName: 'AnimationView',
    tableName: 'animation_views'
  });
  
  return AnimationView;
};
```

## Available Scripts

- `npm run generate` - Generate migrations based on model changes
- `npm run migrate` - Run pending migrations  
- `npm run rollback` - Rollback the last migration
- `npm run models-dir` - Run example with models directory loading
- `npm run dev` - Run the basic example

## Features Demonstrated

✅ Directory-based model loading  
✅ Factory function pattern support  
✅ Sequelize define options (underscored, freezeTableName, charset, collate)  
✅ Automatic schema diffing  
✅ TypeScript migration generation  
✅ Migration execution and rollback