import { UserRole, StaffRole } from '../types';

export const STAFF_ROLES: StaffRole[] = ['moderator', 'support_agent', 'operations_staff'];

export function isAdmin(role?: UserRole | string | null): boolean {
  return role === 'admin';
}

export function isStaff(role?: UserRole | string | null): boolean {
  if (!role) return false;
  return STAFF_ROLES.includes(role as StaffRole);
}

export function isAdminOrStaff(role?: UserRole | string | null): boolean {
  return isAdmin(role) || isStaff(role);
}

export function isValidStaffRole(role?: string | null): role is StaffRole {
  if (!role) return false;
  return STAFF_ROLES.includes(role as StaffRole);
}

export function getStaffRoleLabel(role?: StaffRole | string | null): string {
  switch (role) {
    case 'moderator':
      return 'Moderator';
    case 'support_agent':
      return 'Support Agent';
    case 'operations_staff':
      return 'Operations Staff';
    default:
      return role ?? 'Unknown';
  }
}

// Revenue / financials — admin only
export function canAccessFinancials(role?: UserRole | string | null): boolean {
  return isAdmin(role);
}

// Staff management / role assignment — admin only
export function canManageStaff(role?: UserRole | string | null): boolean {
  return isAdmin(role);
}

// Provider application review and documents
export function canReviewProviders(role?: UserRole | string | null): boolean {
  return isAdmin(role) || role === 'moderator';
}

// View and handle user reports / concerns
export function canHandleReports(role?: UserRole | string | null): boolean {
  return isAdmin(role) || role === 'moderator' || role === 'support_agent';
}

// View and manage disputes and escalated cases
export function canManageDisputes(role?: UserRole | string | null): boolean {
  return isAdmin(role) || role === 'moderator' || role === 'support_agent';
}

// Monitor active bookings and timelines
export function canMonitorBookings(role?: UserRole | string | null): boolean {
  return isAdmin(role) || role === 'moderator' || role === 'operations_staff';
}

// View basic user profiles for support
export function canViewUserProfiles(role?: UserRole | string | null): boolean {
  return isAdmin(role) || role === 'moderator' || role === 'support_agent' || role === 'operations_staff';
}

// View booking incident reports
export function canViewIncidentReports(role?: UserRole | string | null): boolean {
  return isAdmin(role) || role === 'moderator' || role === 'operations_staff';
}

// Close / dismiss simple reports (moderator + admin)
export function canCloseReports(role?: UserRole | string | null): boolean {
  return isAdmin(role) || role === 'moderator';
}

// Respond to / update support cases (support agent + moderator + admin)
export function canUpdateSupportCases(role?: UserRole | string | null): boolean {
  return isAdmin(role) || role === 'moderator' || role === 'support_agent';
}
