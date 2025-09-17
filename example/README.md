# Sequelize Schema Sync Example

This example demonstrates how to use `sequelize-schema-sync` to automatically generate migrations from your Sequelize models.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Initialize the schema sync:
```bash
npm run init-schema
```

3. Generate your first migration based on the current models:
```bash
npm run generate
```

4. Apply the migrations:
```bash
npm run migrate
```

5. Run the example:
```bash
npm run dev
```

## Models

The example includes two models:

- **User**: Basic user model with id, name, email, and age
- **Post**: Blog post model with title, content, and foreign key to User

## Schema Evolution Example

Try making changes to the models and see how the tool generates migrations:

1. **Add a new field to User model**:
   ```typescript
   // In models/User.ts, add:
   phoneNumber: {
     type: DataTypes.STRING(20),
     allowNull: true,
   }
   ```

2. **Generate migration**:
   ```bash
   npm run generate -- --name "add_phone_to_users"
   ```

3. **Apply migration**:
   ```bash
   npm run migrate
   ```

## Available Commands

- `npm run dev` - Run the example application
- `npm run generate` - Generate new migration
- `npm run migrate` - Apply pending migrations
- `npm run rollback` - Rollback last migration
- `npm run init-schema` - Initialize schema-sync.config.ts