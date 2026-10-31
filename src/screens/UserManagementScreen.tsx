import React, { useState, useEffect, useMemo } from 'react';
import {
  Users, UserPlus, Shield, Sparkles, UserCheck, Search, Filter,
  CheckCircle2, AlertCircle, X, Pencil, Trash2, KeyRound, Eye, EyeOff,
  Phone, Building2, Clock, Check, ArrowLeft, RefreshCw, ChevronRight, Lock
} from 'lucide-react';
import { fetchStaffUsers, createStaffUser, updateStaffUser, deleteStaffUser, type StaffUser } from '@/lib/api-users';
import { validatePasswordStrength } from '@/lib/passwordPolicy';
import { getRoomCategories } from '@/lib/api';
import type { RoomCategory } from '@/lib/types';

interface UserManagementScreenProps {
  onBack: () => void;
}

const ROLES = [
  {
    key: 'Housekeeping',
    label: 'Housekeeping',
    desc: 'Task-focused mobile board: Assigned rooms, cleaning workflow, maintenance reports',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    iconColor: 'text-emerald-600',
  },
  {
    key: 'Reception',
    label: 'Reception',
    desc: 'Front Desk & Operations: Room board, check-in, check-out, arrivals, guest register',
    badgeClass: 'bg-sky-50 text-sky-700 border-sky-200',
    iconColor: 'text-sky-600',
  },
  {
    key: 'Accounts',
    label: 'Accounts',
    desc: 'Finance Hub & Reports: Ledgers, day closing, vouchers, profit & loss',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
    iconColor: 'text-amber-600',
  },
  {
    key: 'Manager',
    label: 'Manager',
    desc: 'Full operational oversight: Operations, Housekeeping, Reports, and Staff Management',
    badgeClass: 'bg-purple-50 text-purple-700 border-purple-200',
    iconColor: 'text-purple-600',
  },
  {
    key: 'Owner',
    label: 'Owner',
    desc: 'Full administrative & financial control across all HotelMantri modules',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
    iconColor: 'text-blue-600',
  },
];

const SHIFTS = [
  'General',
  'Morning (7 AM - 3 PM)',
  'Evening (3 PM - 11 PM)',
  'Night (11 PM - 7 AM)',
];

const FLOORS = [
  'All Floors',
  'Ground Floor',
  '1st Floor',
  '2nd Floor',
  '3rd Floor',
  '4th Floor',
];

export const UserManagementScreen: React.FC<UserManagementScreenProps> = ({ onBack }) => {
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [categories, setCategories] = useState<RoomCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<StaffUser | null>(null);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // Form State
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('Housekeeping');
  const [assignedFloor, setAssignedFloor] = useState('');
  const [assignedCategoryId, setAssignedCategoryId] = useState('');
  const [shift, setShift] = useState('General');
  const [isActive, setIsActive] = useState(true);
  const [canLaundry, setCanLaundry] = useState(false);
  const [canMaintenance, setCanMaintenance] = useState(true);
  const [canApproveInspection, setCanApproveInspection] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [userList, catList] = await Promise.all([
        fetchStaffUsers(),
        getRoomCategories().catch(() => []),
      ]);
      setUsers(userList);
      setCategories(catList);
    } catch (err: any) {
      setError(err?.message || 'Failed to load staff users.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openCreateModal = () => {
    setEditingUser(null);
    setName('');
    setMobile('');
    setUsername('');
    setPassword('');
    setRole('Housekeeping');
    setAssignedFloor('All Floors');
    setAssignedCategoryId('');
    setShift('General');
    setIsActive(true);
    setCanLaundry(false);
    setCanMaintenance(true);
    setCanApproveInspection(false);
    setModalError(null);
    setShowPassword(false);
    setModalOpen(true);
  };

  const openEditModal = (u: StaffUser) => {
    setEditingUser(u);
    setName(u.name || '');
    setMobile(u.mobile || '');
    setUsername(u.username || '');
    setPassword('');
    setRole(u.role || 'Housekeeping');
    setAssignedFloor(u.assignedFloor || 'All Floors');
    setAssignedCategoryId(u.assignedCategoryId || '');
    setShift(u.shift || 'General');
    setIsActive(u.status !== 'Inactive');
    setCanLaundry(Boolean(u.permissions?.canLaundry));
    setCanMaintenance(u.permissions?.canMaintenance !== false);
    setCanApproveInspection(Boolean(u.permissions?.canApproveInspection));
    setModalError(null);
    setShowPassword(false);
    setModalOpen(true);
  };

  const handleNameChange = (val: string) => {
    setName(val);
    if (!editingUser && !username) {
      // Suggest a clean username slug if creating new
      const slug = val.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 15);
      if (slug) {
        setUsername(role === 'Housekeeping' ? `hk_${slug}` : slug);
      }
    }
  };

  const handleRoleChange = (newRole: string) => {
    setRole(newRole);
    if (!editingUser && username) {
      if (newRole === 'Housekeeping' && !username.startsWith('hk_')) {
        setUsername(`hk_${username.replace(/^[a-z]+_/, '')}`);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);

    if (!name.trim()) {
      setModalError('Please enter Staff Name.');
      return;
    }
    if (!username.trim()) {
      setModalError('Please enter Username / Login ID.');
      return;
    }
    if (!editingUser) {
      const pwErr = validatePasswordStrength(password);
      if (pwErr) {
        setModalError(pwErr);
        return;
      }
    } else if (password) {
      const pwErr = validatePasswordStrength(password);
      if (pwErr) {
        setModalError(pwErr);
        return;
      }
    }

    try {
      setSaving(true);
      if (editingUser) {
        await updateStaffUser(editingUser.id, {
          name: name.trim(),
          mobile: mobile.trim(),
          role,
          shift,
          assignedFloor,
          assignedCategoryId,
          status: isActive ? 'Active' : 'Inactive',
          permissions: {
            canLaundry,
            canMaintenance,
            canApproveInspection,
          },
          ...(password ? { password } : {}),
        });
        setSuccessMsg(`User "${name}" updated successfully.`);
      } else {
        await createStaffUser({
          name: name.trim(),
          mobile: mobile.trim(),
          username: username.trim().toLowerCase(),
          password,
          role,
          shift,
          assignedFloor,
          assignedCategoryId,
          status: isActive ? 'Active' : 'Inactive',
          permissions: {
            canLaundry,
            canMaintenance,
            canApproveInspection,
          },
        });
        setSuccessMsg(`User "${name}" created with role ${role}.`);
      }

      setModalOpen(false);
      await loadData();
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setModalError(err?.message || err?.error || 'Operation failed. Please check inputs.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (u: StaffUser) => {
    try {
      const newStatus = u.status === 'Inactive' ? 'Active' : 'Inactive';
      await updateStaffUser(u.id, { status: newStatus });
      setUsers((prev) =>
        prev.map((item) => (item.id === u.id ? { ...item, status: newStatus } : item))
      );
    } catch (err: any) {
      setError(err?.message || 'Failed to update user status.');
    }
  };

  const handleDelete = async (u: StaffUser) => {
    if (!confirm(`Are you sure you want to remove user "${u.name}" (${u.username})?`)) return;
    try {
      await deleteStaffUser(u.id);
      setUsers((prev) => prev.filter((item) => item.id !== u.id));
      setSuccessMsg(`User "${u.name}" removed successfully.`);
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setError(err?.message || 'Failed to delete user.');
    }
  };

  // Filtered staff list
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const q = search.toLowerCase().trim();
      const matchSearch =
        !q ||
        u.name?.toLowerCase().includes(q) ||
        u.username?.toLowerCase().includes(q) ||
        u.mobile?.includes(q) ||
        u.role?.toLowerCase().includes(q);

      const matchRole =
        roleFilter === 'All' || u.role?.toLowerCase() === roleFilter.toLowerCase();

      const matchStatus =
        statusFilter === 'All' ||
        (statusFilter === 'Active' && u.status !== 'Inactive') ||
        (statusFilter === 'Inactive' && u.status === 'Inactive');

      return matchSearch && matchRole && matchStatus;
    });
  }, [users, search, roleFilter, statusFilter]);

  // Quick stats
  const stats = useMemo(() => {
    const total = users.length;
    const hkCount = users.filter((u) => u.role?.toLowerCase() === 'housekeeping').length;
    const recCount = users.filter((u) => u.role?.toLowerCase() === 'reception').length;
    const mgmtCount = users.filter((u) => ['manager', 'owner', 'accounts'].includes(u.role?.toLowerCase())).length;
    const activeCount = users.filter((u) => u.status !== 'Inactive').length;
    return { total, hkCount, recCount, mgmtCount, activeCount };
  }, [users]);

  return (
    <div className="min-h-screen bg-slate-50 pb-28">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-gradient-to-r from-slate-950 via-slate-900 to-blue-950 text-white px-4 py-3.5 flex items-center justify-between shadow-md border-b border-slate-800">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-1.5 -ml-1.5 hover:bg-white/10 rounded-xl transition cursor-pointer"
            title="Back"
          >
            <ArrowLeft className="w-5 h-5 text-slate-300 hover:text-white" />
          </button>
          <div>
            <h1 className="text-base font-black leading-tight tracking-tight flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-400" />
              Staff & User Access Control
            </h1>
            <p className="text-blue-300 text-xs font-semibold">
              Role-Based Access Control · Single HotelMantri Authentication
            </p>
          </div>
        </div>

        <button
          onClick={openCreateModal}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-3.5 py-2 rounded-xl shadow transition cursor-pointer"
        >
          <UserPlus className="w-4 h-4" />
          <span>Add Staff Member</span>
        </button>
      </header>

      <main className="px-4 py-4 space-y-4 max-w-7xl mx-auto">
        {/* Global Messages */}
        {successMsg && (
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-xl p-3 shadow-sm animate-fadeIn">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span className="font-semibold">{successMsg}</span>
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-3 shadow-sm">
            <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Staff</p>
              <p className="text-xl font-black text-slate-900 mt-0.5">{stats.total}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <Users className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Housekeeping</p>
              <p className="text-xl font-black text-emerald-700 mt-0.5">{stats.hkCount}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              <Sparkles className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Reception / Desk</p>
              <p className="text-xl font-black text-sky-700 mt-0.5">{stats.recCount}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center font-bold">
              <UserCheck className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Active Staff</p>
              <p className="text-xl font-black text-indigo-700 mt-0.5">{stats.activeCount}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
              <Shield className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Search & Filters */}
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search staff, username, phone..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">Role:</span>
            {['All', 'Housekeeping', 'Reception', 'Manager', 'Accounts', 'Owner'].map((r) => (
              <button
                key={r}
                onClick={() => setRoleFilter(r)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                  roleFilter === r
                    ? 'bg-blue-900 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {r}
              </button>
            ))}

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none ml-2"
            >
              <option value="All">All Status</option>
              <option value="Active">Active Only</option>
              <option value="Inactive">Inactive Only</option>
            </select>
          </div>
        </div>

        {/* Staff Directory Cards */}
        {loading ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400 text-sm animate-pulse">
            <RefreshCw className="w-6 h-6 mx-auto mb-2 animate-spin text-blue-500" />
            Loading staff members…
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <Users className="w-12 h-12 mx-auto mb-3 text-slate-300" />
            <h3 className="text-base font-bold text-slate-700">No staff users found</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              {search || roleFilter !== 'All'
                ? 'Try adjusting your filters or search keywords.'
                : 'Click "Add Staff Member" to set up your first Housekeeping or Front Desk user.'}
            </p>
            <button
              onClick={openCreateModal}
              className="mt-4 inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-4 py-2 rounded-xl transition cursor-pointer"
            >
              <UserPlus className="w-4 h-4" /> Add Staff Member
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {filteredUsers.map((u) => {
              const roleMeta = ROLES.find(
                (r) => r.key.toLowerCase() === u.role?.toLowerCase()
              ) || ROLES[0];
              const isHk = u.role?.toLowerCase() === 'housekeeping';

              return (
                <div
                  key={u.id}
                  className={`bg-white rounded-2xl border transition shadow-sm hover:shadow-md flex flex-col justify-between p-4 ${
                    u.status === 'Inactive' ? 'opacity-65 border-slate-200 bg-slate-50/50' : 'border-slate-200'
                  }`}
                >
                  <div className="space-y-3">
                    {/* Top Row: Name, Status & Role Badge */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <h3 className="font-extrabold text-slate-900 text-sm truncate">{u.name}</h3>
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${
                              u.status === 'Inactive' ? 'bg-slate-400' : 'bg-emerald-500'
                            }`}
                            title={u.status}
                          />
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[11px] font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100">
                            ID: {u.username}
                          </span>
                          {u.mobile && (
                            <span className="text-slate-400 text-xs flex items-center gap-1">
                              <Phone className="w-3 h-3 text-slate-400" />
                              {u.mobile}
                            </span>
                          )}
                        </div>
                      </div>

                      <span
                        className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-lg border tracking-wider shrink-0 ${roleMeta.badgeClass}`}
                      >
                        {u.role}
                      </span>
                    </div>

                    {/* Role Description Note */}
                    <p className="text-[11px] text-slate-500 leading-relaxed bg-slate-50 p-2 rounded-xl border border-slate-100">
                      {roleMeta.desc}
                    </p>

                    {/* Housekeeping Specific Metadata */}
                    {isHk && (
                      <div className="space-y-1.5 pt-1 border-t border-slate-100">
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                          <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-semibold flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-400" />
                            {u.shift || 'General Shift'}
                          </span>
                          {u.assignedFloor && (
                            <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-semibold flex items-center gap-1">
                              <Building2 className="w-3 h-3 text-slate-400" />
                              {u.assignedFloor}
                            </span>
                          )}
                        </div>

                        {/* Permissions Chips */}
                        <div className="flex flex-wrap items-center gap-1 pt-1">
                          {u.permissions?.canApproveInspection && (
                            <span className="text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-md">
                              ★ Supervisor Approver
                            </span>
                          )}
                          {u.permissions?.canLaundry && (
                            <span className="text-[10px] font-bold bg-teal-50 text-teal-700 border border-teal-200 px-2 py-0.5 rounded-md">
                              ✓ Laundry Access
                            </span>
                          )}
                          {u.permissions?.canMaintenance !== false && (
                            <span className="text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-md">
                              ✓ Maintenance Reports
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Actions Bar */}
                  <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-100">
                    <button
                      onClick={() => handleToggleStatus(u)}
                      className={`text-xs font-bold px-2.5 py-1 rounded-lg transition cursor-pointer ${
                        u.status === 'Inactive'
                          ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {u.status === 'Inactive' ? 'Activate' : 'Deactivate'}
                    </button>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => openEditModal(u)}
                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition cursor-pointer"
                        title="Edit Staff Member"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(u)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition cursor-pointer"
                        title="Delete User"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Modal: Create or Edit Staff Member */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-4 my-8">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-blue-600" />
                  {editingUser ? 'Edit Staff Member' : 'Create Staff Member'}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Single HotelMantri login with role-based access control
                </p>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {modalError && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl p-3">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Basic Fields */}
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Staff Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    placeholder="e.g. Ramesh Kumar"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Mobile Number
                    </label>
                    <input
                      type="tel"
                      value={mobile}
                      onChange={(e) => setMobile(e.target.value)}
                      placeholder="e.g. 9876543210"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Username / Login ID *
                    </label>
                    <input
                      type="text"
                      required
                      disabled={Boolean(editingUser)}
                      value={username}
                      onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''))}
                      placeholder="e.g. hk_ramesh"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-mono font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:bg-slate-100 disabled:text-slate-500"
                    />
                    <p className="text-[10px] text-slate-400 mt-0.5">Staff can login using this ID.</p>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    {editingUser ? 'Password (Leave blank to keep unchanged)' : 'Password *'}
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={editingUser ? '••••••••' : 'Min 12 characters'}
                      className="w-full pl-3 pr-10 py-2 bg-white border border-slate-300 rounded-xl text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Role Selector */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    User Role *
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {ROLES.map((r) => (
                      <button
                        type="button"
                        key={r.key}
                        onClick={() => handleRoleChange(r.key)}
                        className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                          role === r.key
                            ? 'bg-blue-50 border-blue-600 text-blue-900 font-extrabold ring-1 ring-blue-600'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs">{r.label}</span>
                          {role === r.key && <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
                        </div>
                      </button>
                    ))}
                  </div>

                  {/* Active role security hint */}
                  <div className="mt-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-start gap-2">
                    <Shield className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <span>
                      {role === 'Housekeeping' &&
                        'Housekeeping role has strict security guards. All financial data, reservations, rates, and master modules are blocked at frontend and backend API.'}
                      {role === 'Reception' &&
                        'Reception role allows front office operations, arrivals, departures, and guest bookings, while blocking finance, rates, and settings.'}
                      {role === 'Accounts' &&
                        'Accounts role provides access to finance hub, ledgers, day closing, and financial reports.'}
                      {role === 'Manager' &&
                        'Manager role provides operational control, user management, reports, and housekeeping oversight.'}
                      {role === 'Owner' &&
                        'Owner role has full administrative, financial, and configuration authority.'}
                    </span>
                  </div>
                </div>

                {/* Housekeeping Specific Options */}
                {role === 'Housekeeping' && (
                  <div className="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-200 space-y-3">
                    <h3 className="text-xs font-black text-emerald-900 uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-emerald-600" />
                      Housekeeping Workspace Configuration
                    </h3>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-emerald-950 uppercase mb-1">
                          Assigned Floor
                        </label>
                        <select
                          value={assignedFloor}
                          onChange={(e) => setAssignedFloor(e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-white border border-emerald-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none"
                        >
                          {FLOORS.map((f) => (
                            <option key={f} value={f}>{f}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-emerald-950 uppercase mb-1">
                          Shift
                        </label>
                        <select
                          value={shift}
                          onChange={(e) => setShift(e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-white border border-emerald-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none"
                        >
                          {SHIFTS.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {categories.length > 0 && (
                      <div>
                        <label className="block text-[11px] font-bold text-emerald-950 uppercase mb-1">
                          Assigned Room Category (Optional)
                        </label>
                        <select
                          value={assignedCategoryId}
                          onChange={(e) => setAssignedCategoryId(e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-white border border-emerald-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none"
                        >
                          <option value="">All Categories</option>
                          {categories.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Optional Permissions */}
                    <div className="space-y-2 pt-1 border-t border-emerald-200">
                      <p className="text-[11px] font-bold text-emerald-950 uppercase tracking-wider">
                        Optional Permissions:
                      </p>

                      <label className="flex items-center gap-2.5 text-xs font-semibold text-emerald-950 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={canLaundry}
                          onChange={(e) => setCanLaundry(e.target.checked)}
                          className="w-4 h-4 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500"
                        />
                        <span>Enable Laundry & Linen Access</span>
                      </label>

                      <label className="flex items-center gap-2.5 text-xs font-semibold text-emerald-950 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={canMaintenance}
                          onChange={(e) => setCanMaintenance(e.target.checked)}
                          className="w-4 h-4 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500"
                        />
                        <span>Enable Maintenance Issue Reporting</span>
                      </label>

                      <label className="flex items-center gap-2.5 text-xs font-semibold text-emerald-950 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={canApproveInspection}
                          onChange={(e) => setCanApproveInspection(e.target.checked)}
                          className="w-4 h-4 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500"
                        />
                        <span>Enable Inspection Approval (Supervisor Role)</span>
                      </label>
                    </div>
                  </div>
                )}

                {/* Status Toggle */}
                <div className="flex items-center justify-between pt-2">
                  <div>
                    <p className="text-xs font-bold text-slate-700">Account Status</p>
                    <p className="text-[11px] text-slate-400">Inactive users cannot log into HotelMantri</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsActive(!isActive)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition cursor-pointer ${
                      isActive ? 'bg-emerald-500' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
                        isActive ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Submit / Cancel Buttons */}
              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow transition disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                >
                  {saving ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Saving…
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      {editingUser ? 'Save Changes' : 'Create User'}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
