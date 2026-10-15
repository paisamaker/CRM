export const ROLES = ['ceo', 'manager', 'finance', 'employee'] as const;
export type Role = (typeof ROLES)[number];

export type Action =
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'approve'
  | 'export'
  | 'manage'
  | 'submit';

export type Resource =
  | 'dashboard_ceo'
  | 'dashboard_employee'
  | 'users'
  | 'settings'
  | 'audit'
  | 'clients'
  | 'leads'
  | 'projects'
  | 'tasks'
  | 'tasks_monitoring'
  | 'time_logs'
  | 'transactions'
  | 'invoices'
  | 'vendors'
  | 'contracts'
  | 'bank_accounts'
  | 'payroll'
  | 'finance_overview'
  | 'approvals'
  | 'alerts'
  | 'analytics'
  | 'notifications'
  | 'files'
  | 'chat'
  | 'budgets'
  | 'attendance'
  | 'teams';

type PermissionMap = Record<Role, Partial<Record<Resource, Action[]>>>;

const ALL: Action[] = ['create', 'read', 'update', 'delete', 'approve', 'export', 'manage', 'submit'];
const CRUD: Action[] = ['create', 'read', 'update', 'delete'];
const READ: Action[] = ['read'];
const CRU: Action[] = ['create', 'read', 'update'];

export const PERMISSIONS: PermissionMap = {
  ceo: {
    dashboard_ceo: READ,
    dashboard_employee: READ,
    users: ALL,
    settings: ALL,
    audit: READ,
    clients: CRUD,
    leads: CRUD,
    projects: CRUD,
    tasks: CRUD,
    tasks_monitoring: READ,
    time_logs: CRUD,
    transactions: [...CRUD, 'export', 'submit'],
    invoices: [...CRUD, 'export', 'submit'],
    vendors: CRUD,
    contracts: CRUD,
    bank_accounts: CRUD,
    payroll: [...CRUD, 'approve', 'manage'],
    finance_overview: ['read', 'export'],
    approvals: ['read', 'approve', 'create'],
    alerts: ['read', 'update', 'manage'],
    analytics: ['read', 'export'],
    notifications: ['read', 'update'],
    files: CRUD,
    chat: CRUD,
    budgets: [...CRUD, 'approve'],
    attendance: [...CRUD, 'manage'],
    teams: ALL,
  },
  /**
   * Manager ≈ employee + bill/invoice drafting.
   * Extra vs employee: create invoices and submit bill approvals to CEO.
   * No user admin, payroll, analytics, or CEO dashboard.
   */
  manager: {
    dashboard_employee: READ,
    clients: READ,
    leads: READ,
    projects: READ,
    tasks: ['create', 'read', 'update'],
    time_logs: CRUD,
    transactions: ['submit', 'read'],
    invoices: ['create', 'read', 'update', 'submit'],
    finance_overview: READ,
    approvals: ['create', 'read'],
    alerts: ['read', 'update'],
    notifications: ['read', 'update'],
    files: ['create', 'read'],
    chat: CRUD,
    attendance: ['create', 'read', 'update'],
    teams: CRUD,
  },
  finance: {
    dashboard_employee: READ,
    clients: READ,
    leads: READ,
    projects: READ,
    tasks: READ,
    time_logs: CRUD,
    transactions: [...CRUD, 'export', 'submit'],
    invoices: [...CRUD, 'export', 'submit'],
    vendors: CRUD,
    contracts: CRUD,
    bank_accounts: CRUD,
    payroll: [...CRUD, 'submit', 'manage'],
    finance_overview: ['read', 'export'],
    approvals: ['create', 'read'],
    alerts: ['read', 'update'],
    analytics: ['read', 'export'],
    notifications: ['read', 'update'],
    files: ['create', 'read'],
    chat: CRUD,
    budgets: CRU,
    attendance: ['create', 'read', 'update'],
    teams: READ,
  },
  employee: {
    dashboard_employee: READ,
    clients: READ,
    leads: READ,
    projects: READ,
    tasks: ['create', 'read', 'update'],
    time_logs: CRUD,
    transactions: ['submit', 'read'],
    approvals: ['create', 'read'],
    alerts: ['read', 'update'],
    notifications: ['read', 'update'],
    files: ['create', 'read'],
    chat: CRUD,
    attendance: ['create', 'read', 'update'],
    teams: READ,
  },
};

export function can(role: Role, resource: Resource, action: Action): boolean {
  const actions = PERMISSIONS[role]?.[resource];
  return !!actions?.includes(action);
}

export const MFA_REQUIRED_ROLES: Role[] = ['ceo', 'manager', 'finance'];
