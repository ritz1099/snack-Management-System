import { DataTypes, QueryInterface, Sequelize } from 'sequelize';

// Umzug passes `{ queryInterface, sequelize }` as the context.
type Ctx = { queryInterface: QueryInterface; sequelize: Sequelize };

const tables = [
  // ---------- office ----------
  {
    name: 'office',
    up: async (q: QueryInterface) =>
      q.createTable('office', {
        id: { type: DataTypes.STRING(20), primaryKey: true },
        name: { type: DataTypes.STRING(50), allowNull: false },
        monthly_budget: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
        budget_currency: { type: DataTypes.CHAR(3), allowNull: false },
        location_tag: { type: DataTypes.STRING(10), allowNull: false },
        created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      }),
  },
  // ---------- office_monthly_budget ----------
  {
    name: 'office_monthly_budget',
    up: async (q: QueryInterface) =>
      q.createTable('office_monthly_budget', {
        office_id: { type: DataTypes.STRING(20), allowNull: false, primaryKey: true, references: { model: 'office', key: 'id' } },
        period_month: { type: DataTypes.CHAR(7), allowNull: false, primaryKey: true },
        budget_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
        currency: { type: DataTypes.CHAR(3), allowNull: false },
      }),
  },
  // ---------- volunteer ----------
  {
    name: 'volunteer',
    up: async (q: QueryInterface) =>
      q.createTable('volunteer', {
        id: { type: DataTypes.STRING(20), primaryKey: true },
        display_name: { type: DataTypes.STRING(100), allowNull: false },
        home_office_id: { type: DataTypes.STRING(20), allowNull: false, references: { model: 'office', key: 'id' } },
        current_location: { type: DataTypes.STRING(10), allowNull: false },
        refills_done: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        last_refill_at: { type: DataTypes.DATE, allowNull: true },
        created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      }),
  },
  // ---------- refill ----------
  {
    name: 'refill',
    up: async (q: QueryInterface) =>
      q.createTable('refill', {
        id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
        office_id: { type: DataTypes.STRING(20), allowNull: false, references: { model: 'office', key: 'id' } },
        status: { type: DataTypes.STRING(12), allowNull: false },
        created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        reported_by: { type: DataTypes.STRING(20), allowNull: true, references: { model: 'volunteer', key: 'id' } },
        assigned_volunteer_id: { type: DataTypes.STRING(20), allowNull: true, references: { model: 'volunteer', key: 'id' } },
        assigned_at: { type: DataTypes.DATE, allowNull: true },
        commit_deadline: { type: DataTypes.DATE, allowNull: true },
        assignment_round: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
        committed_volunteer_id: { type: DataTypes.STRING(20), allowNull: true, references: { model: 'volunteer', key: 'id' } },
        committed_at: { type: DataTypes.DATE, allowNull: true },
        purchase_deadline: { type: DataTypes.DATE, allowNull: true },
        purchase_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
        purchase_currency: { type: DataTypes.CHAR(3), allowNull: true },
        snack_description: { type: DataTypes.TEXT, allowNull: true },
        purchased_at: { type: DataTypes.DATE, allowNull: true },
        over_budget: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
        over_budget_approved_by: { type: DataTypes.STRING(20), allowNull: true, references: { model: 'volunteer', key: 'id' } },
        fx_rate: { type: DataTypes.DECIMAL(10, 6), allowNull: true },
        fx_reporting_currency: { type: DataTypes.CHAR(3), allowNull: false, defaultValue: 'INR' },
        approved_at: { type: DataTypes.DATE, allowNull: true },
        reimbursed_at: { type: DataTypes.DATE, allowNull: true },
      }),
  },
  // ---------- claim ----------
  {
    name: 'claim',
    up: async (q: QueryInterface) =>
      q.createTable('claim', {
        id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
        refill_id: { type: DataTypes.UUID, allowNull: false, unique: true, references: { model: 'refill', key: 'id' } },
        employee_id: { type: DataTypes.STRING(20), allowNull: false, references: { model: 'volunteer', key: 'id' } },
        amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
        currency: { type: DataTypes.CHAR(3), allowNull: false },
        description: { type: DataTypes.TEXT, allowNull: false },
        receipt_ref: { type: DataTypes.STRING(255), allowNull: false },
        status: { type: DataTypes.STRING(12), allowNull: false },
        hr_claim_ref: { type: DataTypes.STRING(64), allowNull: true },
        submitted_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        approved_at: { type: DataTypes.DATE, allowNull: true },
        paid_at: { type: DataTypes.DATE, allowNull: true },
      }),
  },
  // ---------- receipt ----------
  {
    name: 'receipt',
    up: async (q: QueryInterface) =>
      q.createTable('receipt', {
        id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
        refill_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'refill', key: 'id' } },
        uploaded_by: { type: DataTypes.STRING(20), allowNull: false, references: { model: 'volunteer', key: 'id' } },
        storage_uri: { type: DataTypes.STRING(255), allowNull: false },
        content_type: { type: DataTypes.STRING(50), allowNull: true },
        uploaded_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      }),
  },
  // ---------- refill_event ----------
  {
    name: 'refill_event',
    up: async (q: QueryInterface) =>
      q.createTable('refill_event', {
        id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
        refill_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'refill', key: 'id' } },
        from_status: { type: DataTypes.STRING(12), allowNull: true },
        to_status: { type: DataTypes.STRING(12), allowNull: false },
        volunteer_id: { type: DataTypes.STRING(20), allowNull: true, references: { model: 'volunteer', key: 'id' } },
        note: { type: DataTypes.TEXT, allowNull: true },
        occurred_at: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      }),
  },
];

const indexes: { table: string; name: string; fields: string[] }[] = [
  { table: 'refill', name: 'idx_refill_office_status', fields: ['office_id', 'status'] },
  { table: 'refill', name: 'idx_refill_active_owner', fields: ['assigned_volunteer_id'] },
  { table: 'refill', name: 'idx_refill_committed', fields: ['committed_volunteer_id'] },
  { table: 'refill', name: 'idx_refill_purchased', fields: ['office_id', 'purchased_at'] },
  { table: 'volunteer', name: 'idx_volunteer_location', fields: ['current_location'] },
  { table: 'claim', name: 'idx_claim_status', fields: ['status'] },
  { table: 'refill_event', name: 'idx_event_refill_time', fields: ['refill_id', 'occurred_at'] },
];

export const up = async ({ queryInterface }: Ctx): Promise<void> => {
  for (const t of tables) await t.up(queryInterface);
  for (const idx of indexes) {
    await queryInterface.addIndex(idx.table, { name: idx.name, fields: idx.fields });
  }
};

export const down = async ({ queryInterface }: Ctx): Promise<void> => {
  for (const idx of indexes) {
    await queryInterface.removeIndex(idx.table, idx.name).catch(() => undefined);
  }
  for (const t of [...tables].reverse()) {
    await queryInterface.dropTable(t.name);
  }
};
