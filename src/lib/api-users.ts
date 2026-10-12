import { apiFetch } from './api-fetch';

export interface StaffUserPermissions {
  canLaundry?: boolean;
  canMaintenance?: boolean;
  canApproveInspection?: boolean;
}

export interface StaffUser {
  id: string;
  userId?: string | null;
  hotelId: string;
  email: string;
  username: string;
  role: 'Housekeeping' | 'Reception' | 'Accounts' | 'Manager' | 'Owner' | string;
  systemRole: string;
  status: 'Active' | 'Inactive' | string;
  name: string;
  mobile: string;
  shift: string;
  assignedFloor?: string;
  assignedCategoryId?: string;
  permissions: StaffUserPermissions;
  createdAt?: string;
}

export interface CreateStaffUserInput {
  name: string;
  mobile?: string;
  username: string;
  password?: string;
  role: string;
  assignedFloor?: string;
  assignedCategoryId?: string;
  shift?: string;
  status?: string;
  permissions?: StaffUserPermissions;
}

export interface UpdateStaffUserInput {
  name?: string;
  mobile?: string;
  role?: string;
  shift?: string;
  assignedFloor?: string;
  assignedCategoryId?: string;
  status?: string;
  permissions?: StaffUserPermissions;
  password?: string;
}

export const fetchStaffUsers = async (): Promise<StaffUser[]> => {
  const res = await apiFetch('/api/users');
  return res.users || [];
};

export const createStaffUser = async (input: CreateStaffUserInput): Promise<StaffUser> => {
  const res = await apiFetch('/api/users', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return res.user;
};

export const updateStaffUser = async (id: string, input: UpdateStaffUserInput): Promise<void> => {
  await apiFetch(`/api/users/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
};

export const deleteStaffUser = async (id: string): Promise<void> => {
  await apiFetch(`/api/users/${id}`, {
    method: 'DELETE',
  });
};
