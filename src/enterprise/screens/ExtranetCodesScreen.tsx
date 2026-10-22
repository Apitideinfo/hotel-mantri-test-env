import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  KeyRound, Building2, Search, Plus, Edit2, Trash2, CheckCircle2,
  AlertTriangle, RefreshCw, Copy, Check, Filter, X, Loader2,
  Radio, Globe, Hash, Calendar, FileText, ArrowUpDown
} from 'lucide-react';
import {
  getExtranetCodes,
  createExtranetCode,
  updateExtranetCode,
  deleteExtranetCode,
  CHANNEL_TYPES,
  type HotelExtranetCode
} from '@/lib/api-channel';
import { getEnterpriseHotels } from '../api';
import type { EnterpriseHotel } from '../types';
import { ConfirmModal } from '@/components/ui/ConfirmModal';

export const ExtranetCodesScreen: React.FC = () => {
  const [codes, setCodes] = useState<HotelExtranetCode[]>([]);
  const [hotels, setHotels] = useState<EnterpriseHotel[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters & Search
  const [search, setSearch] = useState('');
  const [hotelFilter, setHotelFilter] = useState('ALL');
  const [otaFilter, setOtaFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'active' | 'inactive'>('ALL');

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingCode, setEditingCode] = useState<HotelExtranetCode | null>(null);
  const [deletingCode, setDeletingCode] = useState<HotelExtranetCode | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Notification Banner
  const [bannerNotice, setBannerNotice] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  // Copied code feedback state
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setError(null);
      const [codesData, hotelsData] = await Promise.all([
        getExtranetCodes(),
        getEnterpriseHotels()
      ]);
      setCodes(codesData);
      setHotels(hotelsData.filter(h => !h.archived_at));
    } catch (err: any) {
      setError(err?.message || 'Failed to load extranet codes data.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
  };

  const handleCopyCode = (id: string, code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCodeId(id);
    setTimeout(() => {
      setCopiedCodeId(null);
    }, 2000);
  };

  const handleConfirmDelete = async () => {
    if (!deletingCode) return;
    setIsDeleting(true);
    try {
      await deleteExtranetCode(deletingCode.id, deletingCode.hotel_id);
      setBannerNotice({
        type: 'success',
        message: `Extranet code for ${deletingCode.hotel_name || 'Hotel'} (${deletingCode.ota_name}) deleted successfully.`
      });
      setDeletingCode(null);
      await loadData();
    } catch (err: any) {
      setBannerNotice({
        type: 'error',
        message: err?.message || 'Failed to delete extranet code.'
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // Filtered extranet codes
  const filteredCodes = useMemo(() => {
    return codes.filter((c) => {
      // Hotel filter
      if (hotelFilter !== 'ALL' && c.hotel_id !== hotelFilter) {
        return false;
      }
      // OTA filter
      if (otaFilter !== 'ALL' && c.ota_type !== otaFilter) {
        return false;
      }
      // Status filter
      if (statusFilter === 'active' && !c.is_active) {
        return false;
      }
      if (statusFilter === 'inactive' && c.is_active) {
        return false;
      }
      // Search
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const hotelName = (c.hotel_name || '').toLowerCase();
        const hotelPropCode = (c.hotel_property_code || '').toLowerCase();
        const otaName = (c.ota_name || '').toLowerCase();
        const code = (c.extranet_property_code || '').toLowerCase();
        const otaPropName = (c.ota_property_name || '').toLowerCase();
        const notes = (c.notes || '').toLowerCase();

        return (
          hotelName.includes(q) ||
          hotelPropCode.includes(q) ||
          otaName.includes(q) ||
          code.includes(q) ||
          otaPropName.includes(q) ||
          notes.includes(q)
        );
      }
      return true;
    });
  }, [codes, hotelFilter, otaFilter, statusFilter, search]);

  // Aggregate Metrics
  const totalCodes = codes.length;
  const activeCodes = codes.filter((c) => c.is_active).length;
  const distinctHotels = new Set(codes.map((c) => c.hotel_id)).size;
  const distinctOtas = new Set(codes.map((c) => c.ota_type)).size;

  const hasActiveFilters = hotelFilter !== 'ALL' || otaFilter !== 'ALL' || statusFilter !== 'ALL' || search.trim() !== '';

  const clearFilters = () => {
    setSearch('');
    setHotelFilter('ALL');
    setOtaFilter('ALL');
    setStatusFilter('ALL');
  };

  if (loading && codes.length === 0 && hotels.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="w-8 h-8 text-amber-600 animate-spin" />
        <p className="text-sm font-semibold text-slate-500">Loading Hotel Extranet Codes...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto pb-12">
      {/* 1. Header Banner */}
      <div className="bg-gradient-to-r from-amber-100/90 via-amber-50/70 to-white border-2 border-amber-300/80 text-slate-900 rounded-2xl p-5 shadow-card flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-gradient-to-tr from-amber-500 to-amber-600 text-white rounded-xl shadow-gold-glow">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-extrabold text-amber-950">Hotel Extranet Codes</h1>
                <span className="text-[10px] font-black uppercase tracking-wider bg-purple-100 text-purple-800 border border-purple-200 px-2 py-0.5 rounded-md">
                  Super Admin Registry
                </span>
              </div>
              <p className="text-xs font-semibold text-amber-900/70 mt-0.5">
                Centralized registry of hotel IDs and property identifiers used for OTA mapping across all properties.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-xl transition shadow-xs cursor-pointer disabled:opacity-50"
            title="Refresh Extranet Codes"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-amber-600' : ''}`} />
          </button>

          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2.5 bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 text-white hover:from-amber-600 hover:to-amber-800 border border-amber-400/40 rounded-xl transition shadow-gold-glow flex items-center gap-1.5 text-xs font-extrabold cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Add Extranet Code
          </button>
        </div>
      </div>

      {/* Notification Banner */}
      {bannerNotice && (
        <div className={`p-4 rounded-xl text-xs font-semibold flex items-center justify-between gap-3 border ${
          bannerNotice.type === 'success'
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
            : bannerNotice.type === 'error'
            ? 'bg-red-50 text-red-800 border-red-200'
            : 'bg-blue-50 text-blue-800 border-blue-200'
        }`}>
          <div className="flex items-center gap-2">
            {bannerNotice.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            )}
            <span>{bannerNotice.message}</span>
          </div>
          <button
            onClick={() => setBannerNotice(null)}
            className="text-slate-400 hover:text-slate-600 text-sm font-bold cursor-pointer"
          >
            &times;
          </button>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={handleRefresh} className="text-red-700 underline font-bold cursor-pointer">Retry</button>
        </div>
      )}

      {/* 2. KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border-2 border-slate-200/80 rounded-2xl p-4 flex items-center gap-3.5 shadow-xs">
          <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center font-bold">
            <KeyRound className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Total Saved Codes</p>
            <p className="text-xl font-extrabold text-slate-900">{totalCodes}</p>
          </div>
        </div>

        <div className="bg-white border-2 border-slate-200/80 rounded-2xl p-4 flex items-center gap-3.5 shadow-xs">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center font-bold">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Active Codes</p>
            <p className="text-xl font-extrabold text-emerald-600">{activeCodes}</p>
          </div>
        </div>

        <div className="bg-white border-2 border-slate-200/80 rounded-2xl p-4 flex items-center gap-3.5 shadow-xs">
          <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-200 text-sky-700 flex items-center justify-center font-bold">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Properties Configured</p>
            <p className="text-xl font-extrabold text-slate-900">{distinctHotels} / {hotels.length}</p>
          </div>
        </div>

        <div className="bg-white border-2 border-slate-200/80 rounded-2xl p-4 flex items-center gap-3.5 shadow-xs">
          <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-200 text-purple-700 flex items-center justify-center font-bold">
            <Radio className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Distinct OTAs</p>
            <p className="text-xl font-extrabold text-purple-700">{distinctOtas}</p>
          </div>
        </div>
      </div>

      {/* 3. Search and Filtering Toolbar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[260px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by hotel name, OTA, extranet property code, or notes..."
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                &times;
              </button>
            )}
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Hotel Filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-extrabold text-slate-600 hidden sm:inline">Hotel:</span>
              <select
                value={hotelFilter}
                onChange={(e) => setHotelFilter(e.target.value)}
                className="bg-slate-50 border border-slate-300 text-xs font-bold rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="ALL">All Hotels</option>
                {hotels.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.hotel_name} ({h.city})
                  </option>
                ))}
              </select>
            </div>

            {/* OTA Channel Filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-extrabold text-slate-600 hidden sm:inline">OTA:</span>
              <select
                value={otaFilter}
                onChange={(e) => setOtaFilter(e.target.value)}
                className="bg-slate-50 border border-slate-300 text-xs font-bold rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="ALL">All Channels</option>
                {CHANNEL_TYPES.map((ct) => (
                  <option key={ct.type} value={ct.type}>
                    {ct.label}
                  </option>
                ))}
                <option value="custom_ota">Custom Channel</option>
              </select>
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-extrabold text-slate-600 hidden sm:inline">Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="bg-slate-50 border border-slate-300 text-xs font-bold rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="ALL">All Status</option>
                <option value="active">Active Only</option>
                <option value="inactive">Inactive Only</option>
              </select>
            </div>

            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="px-3 py-2 text-xs font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl transition cursor-pointer"
              >
                Reset Filters
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
          <span>
            Showing <strong className="text-slate-900">{filteredCodes.length}</strong> of{' '}
            <strong className="text-slate-900">{codes.length}</strong> extranet code records
          </span>
          {hasActiveFilters && (
            <span className="text-[11px] text-amber-700 font-bold bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
              Filtered View
            </span>
          )}
        </div>
      </div>

      {/* 4. Centralized Extranet Code Registry Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        {filteredCodes.length === 0 ? (
          <div className="text-center py-16 px-4">
            <KeyRound className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-base font-extrabold text-slate-800">
              {codes.length === 0 ? 'No Extranet Codes Saved' : 'No Matching Extranet Codes'}
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              {codes.length === 0
                ? 'Store each hotel’s individual OTA property codes to maintain a single source of truth for channel distribution.'
                : 'No extranet codes match your current search and filter criteria. Try clearing filters or searching for another term.'}
            </p>
            {codes.length === 0 ? (
              <button
                onClick={() => setShowAddModal(true)}
                className="mt-4 inline-flex items-center gap-1.5 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-extrabold shadow-sm transition cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Add Extranet Code
              </button>
            ) : (
              <button
                onClick={clearFilters}
                className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Clear Filters
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-extrabold uppercase text-[11px] tracking-wider">
                  <th className="py-3.5 px-4">Hotel Name</th>
                  <th className="py-3.5 px-4">OTA / Channel</th>
                  <th className="py-3.5 px-4">Extranet Property ID / Code</th>
                  <th className="py-3.5 px-4">OTA Property Name</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4">Last Updated</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCodes.map((codeRecord) => {
                  const isCopied = copiedCodeId === codeRecord.id;
                  const otaMeta = CHANNEL_TYPES.find(c => c.type === codeRecord.ota_type);
                  const otaDisplayName = codeRecord.ota_name || otaMeta?.label || codeRecord.ota_type;

                  return (
                    <tr
                      key={codeRecord.id}
                      className="hover:bg-amber-50/20 transition-colors group"
                    >
                      {/* 1. Hotel Name */}
                      <td className="py-3.5 px-4 font-bold text-slate-900">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-amber-100/70 border border-amber-300 text-amber-900 flex items-center justify-center font-extrabold shrink-0 text-xs">
                            <Building2 className="w-4 h-4 text-amber-700" />
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-extrabold text-slate-900 text-sm">
                                {codeRecord.hotel_name || 'Hotel'}
                              </span>
                              {codeRecord.hotel_property_code && (
                                <span className="text-[10px] font-mono bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-extrabold border border-slate-200">
                                  {codeRecord.hotel_property_code}
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] font-normal text-slate-500">
                              {codeRecord.city ? `${codeRecord.city}, ${codeRecord.state || ''}` : `ID: ${codeRecord.hotel_id.slice(0, 8)}`}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* 2. OTA / Channel */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-md bg-slate-100 border border-slate-200 flex items-center justify-center font-mono font-extrabold text-[10px] text-slate-700 shrink-0">
                            {(otaMeta?.short || otaDisplayName.slice(0, 2)).toUpperCase()}
                          </span>
                          <span className="font-extrabold text-slate-800">
                            {otaDisplayName}
                          </span>
                        </div>
                      </td>

                      {/* 3. Extranet Property ID / Code */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-extrabold text-slate-900 bg-amber-50 text-amber-950 px-2.5 py-1 rounded-lg border border-amber-300/80 shadow-xs text-xs">
                            {codeRecord.extranet_property_code}
                          </span>
                          <button
                            onClick={() => handleCopyCode(codeRecord.id, codeRecord.extranet_property_code)}
                            className="p-1 text-slate-400 hover:text-slate-700 transition rounded hover:bg-slate-100 cursor-pointer"
                            title="Copy Code to Clipboard"
                          >
                            {isCopied ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </td>

                      {/* 4. OTA Property Name */}
                      <td className="py-3.5 px-4 text-slate-600">
                        {codeRecord.ota_property_name ? (
                          <span className="font-semibold text-slate-800">
                            {codeRecord.ota_property_name}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                        {codeRecord.notes && (
                          <p className="text-[11px] text-slate-400 truncate max-w-xs mt-0.5" title={codeRecord.notes}>
                            Note: {codeRecord.notes}
                          </p>
                        )}
                      </td>

                      {/* 5. Status */}
                      <td className="py-3.5 px-4">
                        {codeRecord.is_active ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                            Inactive
                          </span>
                        )}
                      </td>

                      {/* 6. Last Updated */}
                      <td className="py-3.5 px-4 text-slate-500 font-mono text-[11px]">
                        {codeRecord.updated_at
                          ? new Date(codeRecord.updated_at).toLocaleString('en-IN', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })
                          : '—'}
                      </td>

                      {/* 7. Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setEditingCode(codeRecord)}
                            className="p-1.5 text-slate-600 hover:text-amber-800 hover:bg-amber-100/60 rounded-lg transition cursor-pointer"
                            title="Edit Extranet Code"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeletingCode(codeRecord)}
                            className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                            title="Delete Extranet Code"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 5. Add Extranet Code Modal */}
      {showAddModal && (
        <ExtranetCodeFormModal
          mode="add"
          hotels={hotels}
          existingCodes={codes}
          onClose={() => setShowAddModal(false)}
          onSuccess={async () => {
            setShowAddModal(false);
            setBannerNotice({
              type: 'success',
              message: 'Extranet code saved successfully.'
            });
            await loadData();
          }}
        />
      )}

      {/* 6. Edit Extranet Code Modal */}
      {editingCode && (
        <ExtranetCodeFormModal
          mode="edit"
          hotels={hotels}
          initialRecord={editingCode}
          existingCodes={codes}
          onClose={() => setEditingCode(null)}
          onSuccess={async () => {
            setEditingCode(null);
            setBannerNotice({
              type: 'success',
              message: 'Extranet code updated successfully.'
            });
            await loadData();
          }}
        />
      )}

      {/* 7. Delete Confirmation Modal */}
      {deletingCode && (
        <ConfirmModal
          open={!!deletingCode}
          title="Delete Extranet Code?"
          message={`Are you sure you want to delete the ${deletingCode.ota_name} extranet code (${deletingCode.extranet_property_code}) for ${deletingCode.hotel_name || 'this hotel'}? This action cannot be undone.`}
          confirmText={isDeleting ? 'Deleting...' : 'Delete Extranet Code'}
          cancelText="Cancel"
          variant="danger"
          onConfirm={handleConfirmDelete}
          onClose={() => setDeletingCode(null)}
        />
      )}
    </div>
  );
};

// ── SUB-COMPONENT: Add/Edit Extranet Code Modal ──

interface ExtranetCodeFormModalProps {
  mode: 'add' | 'edit';
  hotels: EnterpriseHotel[];
  initialRecord?: HotelExtranetCode | null;
  existingCodes: HotelExtranetCode[];
  onClose: () => void;
  onSuccess: () => void;
}

const ExtranetCodeFormModal: React.FC<ExtranetCodeFormModalProps> = ({
  mode,
  hotels,
  initialRecord,
  existingCodes,
  onClose,
  onSuccess
}) => {
  const [selectedHotelId, setSelectedHotelId] = useState<string>(
    initialRecord?.hotel_id || (hotels[0]?.id ?? '')
  );
  const [selectedOtaType, setSelectedOtaType] = useState<string>(
    initialRecord?.ota_type || 'booking_com'
  );
  const [customOtaName, setCustomOtaName] = useState<string>(
    initialRecord?.ota_name || ''
  );
  const [extranetPropertyCode, setExtranetPropertyCode] = useState<string>(
    initialRecord?.extranet_property_code || ''
  );
  const [otaPropertyName, setOtaPropertyName] = useState<string>(
    initialRecord?.ota_property_name || ''
  );
  const [notes, setNotes] = useState<string>(
    initialRecord?.notes || ''
  );
  const [isActive, setIsActive] = useState<boolean>(
    initialRecord ? initialRecord.is_active : true
  );

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const otaOptions = useMemo(() => [
    { type: 'booking_com', label: 'Booking.com' },
    { type: 'mmt', label: 'MakeMyTrip' },
    { type: 'goibibo', label: 'Goibibo' },
    { type: 'agoda', label: 'Agoda' },
    { type: 'expedia', label: 'Expedia' },
    { type: 'airbnb', label: 'Airbnb' },
    { type: 'cleartrip', label: 'Cleartrip' },
    { type: 'easemytrip', label: 'EaseMyTrip' },
    { type: 'hotels_com', label: 'Hotels.com' },
    { type: 'trip_com', label: 'Trip.com' },
    { type: 'custom_ota', label: 'Custom Channel / OTA' }
  ], []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Validation
    const cleanHotelId = selectedHotelId.trim();
    const cleanOtaType = selectedOtaType.trim();
    const cleanCode = extranetPropertyCode.trim();

    if (!cleanHotelId) {
      setFormError('Please select a hotel.');
      return;
    }
    if (!cleanOtaType) {
      setFormError('Please select an OTA channel.');
      return;
    }
    if (!cleanCode) {
      setFormError('Extranet Property ID / Code is required.');
      return;
    }

    // Determine OTA name
    let cleanOtaName = '';
    if (cleanOtaType === 'custom_ota') {
      cleanOtaName = customOtaName.trim();
      if (!cleanOtaName) {
        setFormError('Please specify the name of the custom OTA.');
        return;
      }
    } else {
      const match = otaOptions.find((o) => o.type === cleanOtaType);
      cleanOtaName = match?.label || cleanOtaType;
    }

    // Check for accidental duplicate hotel + OTA record in add mode
    if (mode === 'add') {
      const duplicate = existingCodes.find(
        (c) => c.hotel_id === cleanHotelId && c.ota_type === cleanOtaType
      );
      if (duplicate) {
        setFormError(`An extranet code for this hotel and OTA already exists (${duplicate.extranet_property_code}). Please edit that record instead.`);
        return;
      }
    }

    setSaving(true);
    try {
      if (mode === 'add') {
        await createExtranetCode({
          hotelId: cleanHotelId,
          otaType: cleanOtaType,
          otaName: cleanOtaName,
          extranetPropertyCode: cleanCode,
          otaPropertyName: otaPropertyName.trim() || undefined,
          notes: notes.trim() || undefined,
          isActive
        });
      } else if (mode === 'edit' && initialRecord) {
        await updateExtranetCode(initialRecord.id, {
          hotelId: initialRecord.hotel_id,
          extranetPropertyCode: cleanCode,
          otaPropertyName: otaPropertyName.trim() || undefined,
          notes: notes.trim() || undefined,
          isActive
        });
      }
      onSuccess();
    } catch (err: any) {
      setFormError(err?.message || 'Failed to save extranet code.');
    } finally {
      setSaving(false);
    }
  };

  const selectedHotel = hotels.find(h => h.id === selectedHotelId);

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-amber-600" />
              {mode === 'add' ? 'Add Hotel Extranet Code' : 'Edit Extranet Code'}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {mode === 'add'
                ? 'Store OTA property identifiers for distribution mapping'
                : `Update extranet code for ${initialRecord?.hotel_name || 'Hotel'}`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {formError && (
          <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{formError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* 1. Hotel Selector */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              Select Hotel <span className="text-red-500">*</span>
            </label>
            {mode === 'add' ? (
              <select
                value={selectedHotelId}
                onChange={(e) => setSelectedHotelId(e.target.value)}
                required
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white"
              >
                {hotels.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.hotel_name} ({h.city}, {h.state}) {h.property_code ? `· [${h.property_code}]` : ''}
                  </option>
                ))}
              </select>
            ) : (
              <div className="p-2.5 bg-slate-100 rounded-xl border border-slate-200 font-bold text-slate-800 flex items-center justify-between">
                <span>{initialRecord?.hotel_name}</span>
                {initialRecord?.hotel_property_code && (
                  <span className="font-mono text-[11px] bg-slate-200 px-2 py-0.5 rounded text-slate-700">
                    {initialRecord.hotel_property_code}
                  </span>
                )}
              </div>
            )}
            {selectedHotel && mode === 'add' && (
              <p className="text-[11px] text-slate-400 mt-1">
                Owner: {selectedHotel.owner_name} · City: {selectedHotel.city}
              </p>
            )}
          </div>

          {/* 2. OTA Channel Selector */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              OTA / Channel <span className="text-red-500">*</span>
            </label>
            {mode === 'add' ? (
              <select
                value={selectedOtaType}
                onChange={(e) => setSelectedOtaType(e.target.value)}
                required
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white"
              >
                {otaOptions.map((o) => (
                  <option key={o.type} value={o.type}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : (
              <div className="p-2.5 bg-slate-100 rounded-xl border border-slate-200 font-bold text-slate-800">
                {initialRecord?.ota_name || initialRecord?.ota_type}
              </div>
            )}
          </div>

          {/* Custom OTA Name Input */}
          {selectedOtaType === 'custom_ota' && mode === 'add' && (
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Custom OTA Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={customOtaName}
                onChange={(e) => setCustomOtaName(e.target.value)}
                placeholder="e.g. Travelguru, Oyo, etc."
                required
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white"
              />
            </div>
          )}

          {/* 3. Extranet Property ID / Code */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              Extranet Property ID / Code <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={extranetPropertyCode}
              onChange={(e) => setExtranetPropertyCode(e.target.value)}
              placeholder="e.g. 50921 or 004812"
              required
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white text-sm"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              The property code supplied by that OTA’s extranet backend. Leading zeros will be preserved.
            </p>
          </div>

          {/* 4. OTA Property Name (Optional) */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              OTA Property Listing Name <span className="text-slate-400 font-normal">(Optional)</span>
            </label>
            <input
              type="text"
              value={otaPropertyName}
              onChange={(e) => setOtaPropertyName(e.target.value)}
              placeholder="e.g. Hotel Swagat By Mantri Dwarka"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white"
            />
          </div>

          {/* 5. Notes (Optional) */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              Admin Notes <span className="text-slate-400 font-normal">(Optional)</span>
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Internal notes regarding account credentials, account manager contact, etc."
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white"
            />
          </div>

          {/* 6. Active Status Toggle */}
          <div className="pt-2 border-t border-slate-100">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 border-slate-300"
              />
              <div>
                <span className="font-bold text-slate-800">Active Status</span>
                <p className="text-[11px] text-slate-400">
                  When active, this extranet code is visible and available for OTA mapping workflows.
                </p>
              </div>
            </label>
          </div>

          {/* Modal Actions */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-sm"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              {saving ? 'Saving...' : mode === 'add' ? 'Save Extranet Code' : 'Update Code'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
