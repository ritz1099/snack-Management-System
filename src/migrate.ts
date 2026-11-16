import { Umzug, SequelizeStorage } from 'umzug';
import { createSequelize } from './config/database';

/**
 * Migration runner (Umzug + Sequelize). Migrations live in src/migrations and
 * are run with ts-node:
 *   npm run migrate         -> up
 *   npm run migrate:undo    -> down (last migration)
 *   npm run migrate:status  -> pending/executed
 */
const run = async (): Promise<void> => {
  const sequelize = createSequelize();

  const umzug = new Umzug({
    migrations: {
      glob: ['migrations/*.ts', { cwd: __dirname }],
    },
    context: { queryInterface: sequelize.getQueryInterface(), sequelize },
    storage: new SequelizeStorage({ sequelize, modelName: '_migrations' }),
    logger: console,
  });

  const cmd = process.argv[2] ?? 'up';

  try {
    if (cmd === 'up') {
      await umzug.up();
    } else if (cmd === 'down') {
      await umzug.down();
    } else if (cmd === 'status') {
      const executed = await umzug.executed();
      const pending = await umzug.pending();
      console.log('Executed:', executed.map((m) => m.name));
      console.log('Pending:', pending.map((m) => m.name));
    } else {
      console.error('Usage: npm run migrate [up|down|status]');
      process.exit(1);
    }
  } finally {
    await sequelize.close();
  }
};

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
