import React, { useState } from 'react';
import {
  X, UserPlus, Sparkles, Shield, Eye, EyeOff, Check, AlertCircle,
  Building2, Clock, Phone, KeyRound, Loader2, CheckCircle2
} from 'lucide-react';
import { createStaffUser, type StaffUser } from '@/lib/api-users';
import type { RoomCategory } from '@/lib/types';

interface CreateHousekeepingUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: RoomCategory[];
  onSuccess: (user: StaffUser) => void;
}

const SHIFTS = [
  'General (9 AM - 6 PM)',
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

export const CreateHousekeepingUserModal: React.FC<CreateHousekeepingUserModalProps> = ({
  isOpen,
  onClose,
  categories,
  onSuccess,
}) => {
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState('Housekeeping');
  const [assignedFloor, setAssignedFloor] = useState('All Floors');
  const [assignedCategoryId, setAssignedCategoryId] = useState('');
  const [shift, setShift] = useState('General (9 AM - 6 PM)');
  const [isActive, setIsActive] = useState(true);

  // Optional Permissions
  const [canLaundry, setCanLaundry] = useState(false);
  const [canMaintenance, setCanMaintenance] = useState(true);
  const [canApproveInspection, setCanApproveInspection] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleNameChange = (val: string) => {
    setName(val);
    if (!username || username.startsWith('hk_')) {
      const slug = val.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 12);
      if (slug) {
        setUsername(`hk_${slug}`);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Please enter the Staff Name.');
      return;
    }
    if (!username.trim()) {
      setError('Please enter Username / Login ID.');
      return;
    }
    if (!password || password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    try {
      setSaving(true);
      const createdUser = await createStaffUser({
        name: name.trim(),
        mobile: mobile.trim(),
        username: username.trim().toLowerCase(),
        password,
        role: role.trim(),
        assignedFloor: assignedFloor === 'All Floors' ? '' : assignedFloor,
        assignedCategoryId,
        shift,
        status: isActive ? 'Active' : 'Inactive',
        permissions: {
          canLaundry,
          canMaintenance,
          canApproveInspection,
        },
      });

      onSuccess(createdUser);
      onClose();
    } catch (err: any) {
      setError(err?.message || err?.error || 'Failed to create Housekeeping account.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fadeIn">
      <div className="bg-white rounded-3xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-slate-100 space-y-4 my-6 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900 tracking-tight">
                Create Housekeeping Account
              </h2>
              <p className="text-xs text-slate-500">
                Creates a staff login with task-only access to Housekeeping
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Security & Access Banner */}
        <div className="p-3 rounded-2xl bg-emerald-50/80 border border-emerald-200 text-xs text-emerald-900 space-y-1">
          <div className="flex items-center gap-1.5 font-bold">
            <Shield className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>Strict Role-Based Security Notice</span>
          </div>
          <p className="text-[11px] text-emerald-800 leading-relaxed">
            Housekeeping users can <strong>only</strong> access their cleaning tasks and assigned rooms. Financial data, reservations, rates, and master modules are completely blocked.
          </p>
        </div>

        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl p-3">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {/* Staff Name */}
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
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
          </div>

          {/* Mobile & Username */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Mobile Number
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="tel"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  placeholder="e.g. 9876543210"
                  className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Username / Login ID *
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''))}
                  placeholder="e.g. hk_ramesh"
                  className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-mono font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5">Staff uses this username to log in.</p>
            </div>
          </div>

          {/* Password */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Password *
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min 6 characters"
                className="w-full pl-3 pr-10 py-2 bg-white border border-slate-300 rounded-xl text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
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

          {/* Floor & Shift */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Assigned Floor (Optional)
              </label>
              <select
                value={assignedFloor}
                onChange={(e) => setAssignedFloor(e.target.value)}
                className="w-full px-2.5 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {FLOORS.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Shift (Optional)
              </label>
              <select
                value={shift}
                onChange={(e) => setShift(e.target.value)}
                className="w-full px-2.5 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {SHIFTS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Assigned Category (Optional) */}
          {categories.length > 0 && (
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Assigned Room Category (Optional)
              </label>
              <select
                value={assignedCategoryId}
                onChange={(e) => setAssignedCategoryId(e.target.value)}
                className="w-full px-2.5 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">All Categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Optional Permissions */}
          <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
            <p className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
              Optional Permissions:
            </p>

            <label className="flex items-center gap-2.5 text-xs font-semibold text-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={canLaundry}
                onChange={(e) => setCanLaundry(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span>Laundry & Linen Access</span>
            </label>

            <label className="flex items-center gap-2.5 text-xs font-semibold text-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={canMaintenance}
                onChange={(e) => setCanMaintenance(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span>Maintenance Reporting</span>
            </label>

            <label className="flex items-center gap-2.5 text-xs font-semibold text-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={canApproveInspection}
                onChange={(e) => setCanApproveInspection(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span>Inspection Approval (Supervisor Access)</span>
            </label>
          </div>

          {/* Active / Inactive Status */}
          <div className="flex items-center justify-between pt-1">
            <div>
              <p className="text-xs font-bold text-slate-700">Active Account</p>
              <p className="text-[11px] text-slate-400">Can log into the Housekeeping Workspace</p>
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

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow transition disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
            >
              {saving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Creating…
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4" />
                  Create Staff Account
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
