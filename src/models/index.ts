import { DataTypes, Sequelize } from 'sequelize';
import { sequelize } from './db';

// Models are defined with `sequelize.define` (no `class` keyword in our code).
// `define` returns a Model instance; column names are snake_cased in MySQL.

export const defineModels = (seq: Sequelize = sequelize) => {
  const Office = seq.define(
    'office',
    {
      id: { type: DataTypes.STRING(20), primaryKey: true },
      name: { type: DataTypes.STRING(50), allowNull: false },
      monthlyBudget: { type: DataTypes.DECIMAL(12, 2), allowNull: false, field: 'monthly_budget' },
      budgetCurrency: { type: DataTypes.CHAR(3), allowNull: false, field: 'budget_currency' },
      locationTag: { type: DataTypes.STRING(10), allowNull: false, field: 'location_tag' },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'), field: 'created_at' },
    },
    { tableName: 'office' },
  );

  const OfficeMonthlyBudget = seq.define(
    'office_monthly_budget',
    {
      officeId: { type: DataTypes.STRING(20), primaryKey: true, field: 'office_id' },
      periodMonth: { type: DataTypes.CHAR(7), primaryKey: true, field: 'period_month' },
      budgetAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, field: 'budget_amount' },
      currency: { type: DataTypes.CHAR(3), allowNull: false },
    },
    { tableName: 'office_monthly_budget' },
  );

  const Volunteer = seq.define(
    'volunteer',
    {
      id: { type: DataTypes.STRING(20), primaryKey: true },
      displayName: { type: DataTypes.STRING(100), allowNull: false, field: 'display_name' },
      homeOfficeId: { type: DataTypes.STRING(20), allowNull: false, field: 'home_office_id' },
      currentLocation: { type: DataTypes.STRING(10), allowNull: false, field: 'current_location' },
      refillsDone: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'refills_done' },
      lastRefillAt: { type: DataTypes.DATE, allowNull: true, field: 'last_refill_at' },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'), field: 'created_at' },
    },
    { tableName: 'volunteer' },
  );

  const Refill = seq.define(
    'refill',
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      officeId: { type: DataTypes.STRING(20), allowNull: false, field: 'office_id' },
      status: { type: DataTypes.STRING(12), allowNull: false },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'), field: 'created_at' },
      reportedBy: { type: DataTypes.STRING(20), allowNull: true, field: 'reported_by' },

      assignedVolunteerId: { type: DataTypes.STRING(20), allowNull: true, field: 'assigned_volunteer_id' },
      assignedAt: { type: DataTypes.DATE, allowNull: true, field: 'assigned_at' },
      commitDeadline: { type: DataTypes.DATE, allowNull: true, field: 'commit_deadline' },
      assignmentRound: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1, field: 'assignment_round' },

      committedVolunteerId: { type: DataTypes.STRING(20), allowNull: true, field: 'committed_volunteer_id' },
      committedAt: { type: DataTypes.DATE, allowNull: true, field: 'committed_at' },
      purchaseDeadline: { type: DataTypes.DATE, allowNull: true, field: 'purchase_deadline' },

      purchaseAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: true, field: 'purchase_amount' },
      purchaseCurrency: { type: DataTypes.CHAR(3), allowNull: true, field: 'purchase_currency' },
      snackDescription: { type: DataTypes.TEXT, allowNull: true, field: 'snack_description' },
      purchasedAt: { type: DataTypes.DATE, allowNull: true, field: 'purchased_at' },
      overBudget: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'over_budget' },
      overBudgetApprovedBy: { type: DataTypes.STRING(20), allowNull: true, field: 'over_budget_approved_by' },

      fxRate: { type: DataTypes.DECIMAL(10, 6), allowNull: true, field: 'fx_rate' },
      fxReportingCurrency: { type: DataTypes.CHAR(3), allowNull: false, defaultValue: 'INR', field: 'fx_reporting_currency' },

      approvedAt: { type: DataTypes.DATE, allowNull: true, field: 'approved_at' },
      reimbursedAt: { type: DataTypes.DATE, allowNull: true, field: 'reimbursed_at' },
    },
    { tableName: 'refill' },
  );

  const Claim = seq.define(
    'claim',
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      refillId: { type: DataTypes.UUID, allowNull: false, unique: true, field: 'refill_id' },
      employeeId: { type: DataTypes.STRING(20), allowNull: false, field: 'employee_id' },
      amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
      currency: { type: DataTypes.CHAR(3), allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: false },
      receiptRef: { type: DataTypes.STRING(255), allowNull: false, field: 'receipt_ref' },
      status: { type: DataTypes.STRING(12), allowNull: false },
      hrClaimRef: { type: DataTypes.STRING(64), allowNull: true, field: 'hr_claim_ref' },
      submittedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'), field: 'submitted_at' },
      approvedAt: { type: DataTypes.DATE, allowNull: true, field: 'approved_at' },
      paidAt: { type: DataTypes.DATE, allowNull: true, field: 'paid_at' },
    },
    { tableName: 'claim' },
  );

  const Receipt = seq.define(
    'receipt',
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      refillId: { type: DataTypes.UUID, allowNull: false, field: 'refill_id' },
      uploadedBy: { type: DataTypes.STRING(20), allowNull: false, field: 'uploaded_by' },
      storageUri: { type: DataTypes.STRING(255), allowNull: false, field: 'storage_uri' },
      contentType: { type: DataTypes.STRING(50), allowNull: true, field: 'content_type' },
      uploadedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'), field: 'uploaded_at' },
    },
    { tableName: 'receipt' },
  );

  const RefillEvent = seq.define(
    'refill_event',
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      refillId: { type: DataTypes.UUID, allowNull: false, field: 'refill_id' },
      fromStatus: { type: DataTypes.STRING(12), allowNull: true, field: 'from_status' },
      toStatus: { type: DataTypes.STRING(12), allowNull: false, field: 'to_status' },
      volunteerId: { type: DataTypes.STRING(20), allowNull: true, field: 'volunteer_id' },
      note: { type: DataTypes.TEXT, allowNull: true },
      occurredAt: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'), field: 'occurred_at' },
    },
    { tableName: 'refill_event' },
  );

  // ---- associations ----
  Office.hasMany(Volunteer, { foreignKey: 'home_office_id', as: 'volunteers' });
  Volunteer.belongsTo(Office, { foreignKey: 'home_office_id', as: 'homeOffice' });

  Office.hasMany(Refill, { foreignKey: 'office_id', as: 'refills' });
  Refill.belongsTo(Office, { foreignKey: 'office_id', as: 'office' });

  Office.hasMany(OfficeMonthlyBudget, { foreignKey: 'office_id', as: 'monthlyBudgets' });
  OfficeMonthlyBudget.belongsTo(Office, { foreignKey: 'office_id', as: 'office' });

  Refill.hasOne(Claim, { foreignKey: 'refill_id', as: 'claim' });
  Claim.belongsTo(Refill, { foreignKey: 'refill_id', as: 'refill' });

  Refill.hasMany(Receipt, { foreignKey: 'refill_id', as: 'receipts' });
  Receipt.belongsTo(Refill, { foreignKey: 'refill_id', as: 'refill' });

  Refill.hasMany(RefillEvent, { foreignKey: 'refill_id', as: 'events' });
  RefillEvent.belongsTo(Refill, { foreignKey: 'refill_id', as: 'refill' });

  return { Office, OfficeMonthlyBudget, Volunteer, Refill, Claim, Receipt, RefillEvent };
};

export const models = defineModels(sequelize);
