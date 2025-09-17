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
  database: 'myapp',
  username: 'user',
  password: 'password',
  host: 'localhost',
});

const config: SchemaSyncConfig = {
  sequelize,
  models: [User, Post],
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
```

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
Show migration status (coming soon)
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
  await queryInterface.createTable('Users', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false },
    email: { type: DataTypes.STRING, allowNull: false, unique: true },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false }
  });

  await queryInterface.addColumn('Posts', 'userId', {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'Users', key: 'id' }
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.removeColumn('Posts', 'userId');
  await queryInterface.dropTable('Users');
}
```

## ⚙️ Configuration

### SchemaSyncConfig

```typescript
interface SchemaSyncConfig {
  sequelize: Sequelize;           // Your Sequelize instance
  models: ModelStatic<Model>[];   // Array of your models
  migrationsPath?: string;        // Path to migrations folder (default: './migrations')
  configPath?: string;            // Custom config path
}
```

## 🎯 Supported Operations

- ✅ **Create tables** - When you add new models
- ✅ **Drop tables** - When you remove models
- ✅ **Add columns** - When you add new fields to models
- ✅ **Remove columns** - When you remove fields from models
- ✅ **Change columns** - When you modify field types, constraints, etc.
- ✅ **Foreign keys** - Automatic handling of references
- ✅ **Indexes and constraints** - Primary keys, unique constraints, etc.

## 🔧 Advanced Usage

### Custom Migration Names

```bash
npx sequelize-schema-sync generate --name "add_user_preferences"
```

### Different Environments

You can have different config files for different environments:

```bash
# Development
npx sequelize-schema-sync generate --config schema-sync.dev.config.ts

# Production  
npx sequelize-schema-sync migrate --config schema-sync.prod.config.ts
```

## 📁 Project Structure

```
your-project/
├── models/
│   ├── User.ts
│   └── Post.ts
├── migrations/           # Auto-generated migrations
│   ├── 20231201120000_initial_migration.ts
│   └── 20231201130000_add_user_avatar.ts
├── schema-sync.config.ts # Your configuration
└── package.json
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

MIT License - see the [LICENSE](LICENSE) file for details.

## 🙋‍♂️ Support

- 📚 [Full Documentation](https://github.com/yourusername/sequelize-schema-sync#readme)
- 🐛 [Bug Reports](https://github.com/yourusername/sequelize-schema-sync/issues)
- 💬 [Discussions](https://github.com/yourusername/sequelize-schema-sync/discussions)

---

**Made with ❤️ for the Sequelize community**
