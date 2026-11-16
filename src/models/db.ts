import { createSequelize } from '../config/database';

// A shared Sequelize instance. Importing this does not open a connection.
export const sequelize = createSequelize();
