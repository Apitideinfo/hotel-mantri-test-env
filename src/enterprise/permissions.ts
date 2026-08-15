// Enterprise HQ — centralized permission engine

import type { CompanyRole } from './types';

export type Permission =
  | 'dashboard' | 'hotels.read' | 'hotels.write' | 'hotels.impersonate'
  | 'hotels.archive' | 'hotels.delete' | 'hotels.reset' | 'subscriptions.read' | 'subscriptions.write'
  | 'payments.read' | 'payments.write' | 'crm.read' | 'crm.write'
  | 'crm.assigned' | 'tickets.read' | 'tickets.write' | 'tickets.assigned'
  | 'users.read' | 'users.write' | 'features.read' | 'features.write'
  | 'audit.read' | 'notifications.read' | 'notifications.write'
  | 'settings.read' | 'settings.write'
  | 'invoices.read' | 'invoices.write' | 'invoices.issue'
  | 'invoices.payment' | 'invoices.cancel' | 'invoices.credit_note'
  | 'billing.read' | 'billing.write';

const ROLE_PERMISSIONS: Record<CompanyRole, Set<Permission>> = {
  founder: new Set<Permission>([
    'dashboard', 'hotels.read', 'hotels.write', 'hotels.impersonate', 'hotels.archive',
    'hotels.delete', 'hotels.reset',
    'subscriptions.read', 'subscriptions.write', 'payments.read', 'payments.write',
    'crm.read', 'crm.write', 'tickets.read', 'tickets.write',
    'users.read', 'users.write', 'features.read', 'features.write',
    'audit.read', 'notifications.read', 'notifications.write',
    'settings.read', 'settings.write',
    'invoices.read', 'invoices.write', 'invoices.issue',
    'invoices.payment', 'invoices.cancel', 'invoices.credit_note',
    'billing.read', 'billing.write',
  ]),
  company_admin: new Set<Permission>([
    'dashboard', 'hotels.read', 'hotels.write', 'hotels.impersonate', 'hotels.archive',
    'hotels.reset',
    'subscriptions.read', 'subscriptions.write', 'payments.read', 'payments.write',
    'crm.read', 'crm.write', 'tickets.read', 'tickets.write',
    'users.read', 'users.write', 'features.read', 'features.write',
    'audit.read', 'notifications.read', 'notifications.write',
    'settings.read',
    'invoices.read', 'invoices.write', 'invoices.issue',
    'invoices.payment', 'invoices.cancel', 'invoices.credit_note',
    'billing.read', 'billing.write',
  ]),
  sales_manager: new Set<Permission>([
    'dashboard', 'hotels.read',
    'subscriptions.read',
    'invoices.read',
    'crm.read', 'crm.write',
    'tickets.read',
    'users.read',
    'notifications.read',
  ]),
  sales_executive: new Set<Permission>([
    'dashboard', 'hotels.read',
    'invoices.read',
    'crm.read', 'crm.write', 'crm.assigned',
    'notifications.read',
  ]),
  support_manager: new Set<Permission>([
    'dashboard', 'hotels.read', 'hotels.impersonate',
    'tickets.read', 'tickets.write',
    'users.read',
    'notifications.read',
  ]),
  support_executive: new Set<Permission>([
    'dashboard', 'hotels.read', 'hotels.impersonate',
    'tickets.read', 'tickets.write', 'tickets.assigned',
    'notifications.read',
  ]),
  finance_manager: new Set<Permission>([
    'dashboard', 'hotels.read',
    'subscriptions.read', 'subscriptions.write',
    'payments.read', 'payments.write',
    'invoices.read', 'invoices.write', 'invoices.issue',
    'invoices.payment', 'invoices.cancel', 'invoices.credit_note',
    'billing.read',
    'notifications.read',
  ]),
  finance_executive: new Set<Permission>([
    'dashboard',
    'payments.read', 'payments.write',
    'subscriptions.read',
    'invoices.read', 'invoices.write', 'invoices.payment',
    'billing.read',
    'notifications.read',
  ]),
};

export const hasPermission = (role: CompanyRole | null, perm: Permission): boolean => {
  if (!role) return false;
  const perms = ROLE_PERMISSIONS[role];
  if (!perms) return false;
  return perms.has(perm);
};

export const hasAnyPermission = (role: CompanyRole | null, perms: Permission[]): boolean => {
  if (!role) return false;
  return perms.some((p) => hasPermission(role, p));
};

export const ROLE_LABELS: Record<CompanyRole, string> = {
  founder: 'Founder / Super Admin',
  company_admin: 'Company Admin',
  sales_manager: 'Sales Manager',
  sales_executive: 'Sales Executive',
  support_manager: 'Support Manager',
  support_executive: 'Support Executive',
  finance_manager: 'Finance Manager',
  finance_executive: 'Finance Executive',
};

export const ROLE_BADGE_COLORS: Record<CompanyRole, string> = {
  founder: 'bg-amber-100 text-amber-800 border-amber-200',
  company_admin: 'bg-sky-100 text-sky-800 border-sky-200',
  sales_manager: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  sales_executive: 'bg-teal-100 text-teal-800 border-teal-200',
  support_manager: 'bg-violet-100 text-violet-800 border-violet-200',
  support_executive: 'bg-purple-100 text-purple-800 border-purple-200',
  finance_manager: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  finance_executive: 'bg-cyan-100 text-cyan-800 border-cyan-200',
};

export const ALL_ROLES: CompanyRole[] = [
  'founder', 'company_admin',
  'sales_manager', 'sales_executive',
  'support_manager', 'support_executive',
  'finance_manager', 'finance_executive',
];
