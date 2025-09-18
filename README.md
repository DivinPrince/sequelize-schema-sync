# sequelize-schema-sync

🔥 **Drizzle-like migrations for Sequelize** - Automatically generate migrations from your Sequelize models, just like Drizzle ORM but for Sequelize!

[![npm version](https://badge.fury.io/js/sequelize-schema-sync.svg)](https://badge.fury.io/js/sequelize-schema-sync)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## ✨ Features

- 📦 **Models as Source of Truth** - Define your schema using Sequelize models
- 🔄 **Automatic Migration Generation** - Compare models vs database and generate migrations
- 🚀 **CLI Commands** - Simple commands for generate, migrate, and rollback
- 📝 **TypeScript Support** - Full TypeScript support with type definitions
- 🎯 **Powered by Umzug** - Built on the reliable Umzug migration framework
- 🛠️ **Production Ready** - Handles complex schema changes, foreign keys, and more
- 📁 **Directory-based Loading** - Auto-discover models from directories
- 🔍 **Dry-run Mode** - Preview changes before generating migrations
- 🎲 **Smart Naming** - Auto-generates migration names when not provided

## 🚀 Quick Start

### Installation

```bash
npm install sequelize-schema-sync
# or
yarn add sequelize-schema-sync
```

### Basic Setup

1. **Initialize configuration**:
```bash
npx sequelize-schema-sync init
```

2. **Configure your models in `schema-sync.config.ts`**:
```typescript
import { Sequelize } from 'sequelize';
import { SchemaSyncConfig } from 'sequelize-schema-sync';
import { User } from './models/User';
import { Post } from './models/Post';

const sequelize = new Sequelize({
  dialect: 'postgres', // or 'mysql', 'sqlite', etc.
  host: 'localhost',
  database: 'myapp',
  username: 'user',
  password: 'password',
});

const config: SchemaSyncConfig = {
  sequelize,
  // Option 1: Provide models array directly
  models: [User, Post],
  // Option 2: Auto-discover from directory (recommended)
  // modelsPath: './models',
  migrationsPath: './migrations',
};

export default config;
```

3. **Generate your first migration**:
```bash
npx sequelize-schema-sync generate
```

4. **Apply migrations**:
```bash
npx sequelize-schema-sync migrate
```

## 📋 CLI Commands

### `generate`
Generate a new migration based on model changes
```bash
npx sequelize-schema-sync generate
npx sequelize-schema-sync generate --name "add_user_avatar"
npx sequelize-schema-sync generate --dry-run
```

**Options:**
- `-n, --name <name>` - Custom migration name
- `--dry-run` - Preview changes without generating files

### `migrate`
Run all pending migrations
```bash
npx sequelize-schema-sync migrate
```

### `rollback`
Rollback the last applied migration
```bash
npx sequelize-schema-sync rollback
```

### `status`
Show migration status
```bash
npx sequelize-schema-sync status
```

### `init`
Initialize a new `schema-sync.config.ts` file
```bash
npx sequelize-schema-sync init
```

## 📖 How It Works

1. **Define Models**: Create your Sequelize models as usual
2. **Run Generate**: The tool compares your models against the current database schema
3. **Automatic Diff**: Detects changes like new tables, columns, type changes, etc.
4. **Generate Migration**: Creates a timestamped migration file with `up` and `down` functions
5. **Apply Changes**: Use the migrate command to apply changes to your database

## 🏗️ Example Migration

When you change your models, the tool generates migrations like this:

```typescript
import { QueryInterface, DataTypes } from 'sequelize';

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable('users', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false
    }
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('users');
}
```

## 📁 Model Loading Options

### Option 1: Direct Model Array (Simple)
```typescript
const config: SchemaSyncConfig = {
  sequelize,
  models: [User, Post, Comment], // Import and list your models
  migrationsPath: './migrations',
};
```

### Option 2: Directory-based Loading (Recommended)
```typescript
const config: SchemaSyncConfig = {
  sequelize,
  modelsPath: './models', // Auto-discover models from directory
  migrationsPath: './migrations',
};
```

**Model Factory Pattern:**
```typescript
// models/User.ts
export const UserModel = (sequelize: Sequelize) => {
  const User = sequelize.define('User', {
    email: DataTypes.STRING,
    name: DataTypes.STRING,
  });

  return User;
};
```

## 🔍 Dry-run Mode

Preview what changes will be made before generating migrations:

```bash
npx sequelize-schema-sync generate --dry-run
```

**Example Output:**
```
📊 Schema Analysis Results:
==================================================
Found 2 table(s) with changes:

📄 Table: users
   Action: alter
   → Will modify 2 column(s):
     - email: change
     - avatar: add

📄 Table: posts
   Action: create
   → Will create table with 5 columns: id, title, content, userId, createdAt

💡 To generate the migration file, run without --dry-run flag
```

## 🎯 Supported Schema Changes

- ✅ Create new tables
- ✅ Drop tables
- ✅ Add columns
- ✅ Remove columns
- ✅ Change column types
- ✅ Add/remove primary keys
- ✅ Add/remove auto-increment
- ✅ Add/remove unique constraints
- ✅ Change default values
- ✅ Add/remove foreign keys

## 🛠️ Advanced Configuration

```typescript
const config: SchemaSyncConfig = {
  sequelize,
  modelsPath: './models',
  migrationsPath: './migrations',
  // Optional: Custom config path
  configPath: './custom-config.ts',
};
```

## ⚙️ Sequelize Define Options

Configure global options for all your models using Sequelize's `define` option:

### Basic Configuration

```typescript
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: './database.sqlite',
  
  // Global define options for all models
  define: {
    charset: 'utf8mb4',
    collate: 'utf8mb4_general_ci',
    // Use snake_case for all auto-generated fields (timestamps, foreign keys, etc.)
    underscored: true,
    // Prevent table name pluralization
    freezeTableName: true,
    timestamps: true,
  },
});
```

### MySQL/MariaDB Configuration

For MySQL and MariaDB, set charset and collation in both `define` and `dialectOptions`:

```typescript
const sequelize = new Sequelize({
  dialect: 'mysql',
  host: 'localhost',
  database: 'myapp',
  username: 'user',
  password: 'password',
  
  // MySQL-specific options
  dialectOptions: {
    charset: 'utf8mb4',
    collate: 'utf8mb4_general_ci',
  },
  
  // Global define options
  define: {
    charset: 'utf8mb4',
    collate: 'utf8mb4_general_ci',
    // Use snake_case for all auto-generated fields (timestamps, foreign keys, etc.)
    underscored: true,
    freezeTableName: true,
    timestamps: true,
  },
});
```

### Define Options Explained

| Option | Description | Example |
|--------|-------------|---------|
| `charset` | Character set for tables | `'utf8mb4'` |
| `collate` | Collation for string comparisons | `'utf8mb4_general_ci'` |
| `underscored` | Use snake_case for all auto-generated fields | `true` → `createdAt` becomes `created_at`, `userId` becomes `user_id` |
| `freezeTableName` | Prevent table name pluralization | `true` → `User` table stays `User`, not `Users` |
| `timestamps` | Add createdAt/updatedAt automatically | `true` |

### Model Override Example

Individual models can override global define options:

```typescript
// models/User.ts
export const UserModel = (sequelize: Sequelize) => {
  return User.init({
    email: DataTypes.STRING,
    firstName: DataTypes.STRING, // Will be first_name in DB with underscored: true
  }, {
    sequelize,
    modelName: 'User',
    // Global options apply, but you can override:
    // freezeTableName: false, // Would override global setting
    // underscored: false,     // Would override global setting
  });
};
```

## 📚 Examples

Check out the [`example/`](./example) directory for complete working examples:

- Directory-based model loading
- Factory function patterns
- TypeScript migration generation
- Migration execution and rollback

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## � Acknowledgments

- Built on top of [Umzug](https://github.com/sequelize/umzug) for migration management
- Inspired by [Drizzle ORM](https://orm.drizzle.team/) migration approach
- Powered by [Sequelize](https://sequelize.org/)
