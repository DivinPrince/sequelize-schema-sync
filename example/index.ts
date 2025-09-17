import { Sequelize } from 'sequelize';
import { initializeModels } from './models';

async function main() {
  // Initialize Sequelize with SQLite
  const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: './example.sqlite',
    logging: console.log, // Enable SQL logging
  });

  try {
    // Test the connection
    await sequelize.authenticate();
    console.log('✅ Database connection established successfully.');

    // Initialize models
    const models = initializeModels(sequelize);

    console.log('📝 Models initialized:');
    console.log('  - User');
    console.log('  - Post');

    console.log('\n🚀 Example setup complete!');
    console.log('\nNext steps:');
    console.log('1. Run: npm run generate   (to generate initial migration)');
    console.log('2. Run: npm run migrate    (to apply migrations)');
    console.log('3. Modify models and repeat steps 1-2 to see schema sync in action');

  } catch (error) {
    console.error('❌ Unable to connect to the database:', error);
  } finally {
    await sequelize.close();
  }
}

if (require.main === module) {
  main();
}