import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, Plus, Search, Pencil, Trash2, X, LayoutGrid,
  Users, Armchair, MapPin, CheckCircle2, Circle,
} from 'lucide-react';
import type { PosArea, PosAreaInput, PosTable, PosTableInput, PosTableStatus } from '@/lib/types';
import { POS_TABLE_STATUSES } from '@/lib/types';
import {
  getPosAreas, upsertPosArea, deletePosArea,
  getPosTables, upsertPosTable, deletePosTable, setPosTableStatus,
} from '@/lib/api-pos';

interface TablesScreenProps {
  onBack: () => void;
}

type StatusFilter = 'all' | PosTableStatus;

export const TablesScreen = ({ onBack }: TablesScreenProps) => {
  const [areas, setAreas] = useState<PosArea[]>([]);
  const [tables, setTables] = useState<PosTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [areaFilter, setAreaFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const [areaModalOpen, setAreaModalOpen] = useState(false);
  const [editingArea, setEditingArea] = useState<PosArea | null>(null);
  const [areaName, setAreaName] = useState('');
  const [areaOrder, setAreaOrder] = useState(0);
  const [areaActive, setAreaActive] = useState(true);
  const [areaSaving, setAreaSaving] = useState(false);

  const [tableModalOpen, setTableModalOpen] = useState(false);
  const [editingTable, setEditingTable] = useState<PosTable | null>(null);
  const [tableForm, setTableForm] = useState<PosTableInput>(blankTable());
  const [tableSaving, setTableSaving] = useState(false);

  const [statusPickerOpen, setStatusPickerOpen] = useState<string | null>(null);

  function blankTable(): PosTableInput {
    return {
      area_id: null,
      name: '',
      seating_capacity: 4,
      display_order: 0,
      is_active: true,
      current_status: 'available',
    };
  }

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [a, t] = await Promise.all([getPosAreas(), getPosTables()]);
      setAreas(a);
      setTables(t);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load table data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const resolveAreaName = (id: string | null) =>
    id ? areas.find((a) => a.id === id)?.name ?? 'Unassigned' : 'Unassigned';

  const statusMeta = (s: PosTableStatus) =>
    POS_TABLE_STATUSES.find((st) => st.value === s) ?? POS_TABLE_STATUSES[0];

  const filteredTables = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tables.filter((t) => {
      if (q && !t.name.toLowerCase().includes(q)) return false;
      if (areaFilter !== 'all' && t.area_id !== (areaFilter === 'none' ? null : areaFilter)) return false;
      if (statusFilter !== 'all' && t.current_status !== statusFilter) return false;
      return true;
    });
  }, [tables, search, areaFilter, statusFilter]);

  // Group tables by area for floor view
  const tablesByArea = useMemo(() => {
    const map = new Map<string, PosTable[]>();
    for (const t of filteredTables) {
      const key = t.area_id ?? 'none';
      const arr = map.get(key) ?? [];
      arr.push(t);
      map.set(key, arr);
    }
    return map;
  }, [filteredTables]);

  const openAddArea = () => {
    setEditingArea(null);
    setAreaName('');
    setAreaOrder(areas.length + 1);
    setAreaActive(true);
    setAreaModalOpen(true);
  };

  const openEditArea = (a: PosArea) => {
    setEditingArea(a);
    setAreaName(a.name);
    setAreaOrder(a.display_order);
    setAreaActive(a.is_active);
    setAreaModalOpen(true);
  };

  const saveArea = async () => {
    if (!areaName.trim()) return;
    setAreaSaving(true);
    try {
      const payload: PosAreaInput = { name: areaName.trim(), display_order: areaOrder, is_active: areaActive };
      const saved = await upsertPosArea(payload, editingArea?.id);
      setAreas((prev) => {
        const idx = prev.findIndex((a) => a.id === saved.id);
        if (idx >= 0) { const next = [...prev]; next[idx] = saved; return next.sort((a, b) => a.display_order - b.display_order); }
        return [...prev, saved].sort((a, b) => a.display_order - b.display_order);
      });
      setAreaModalOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save area');
    } finally {
      setAreaSaving(false);
    }
  };

  const removeArea = async (id: string) => {
    const count = tables.filter((t) => t.area_id === id).length;
    if (!confirm(`Delete this area?${count > 0 ? ` ${count} table(s) will become unassigned.` : ''}`)) return;
    try {
      await deletePosArea(id);
      setAreas((prev) => prev.filter((a) => a.id !== id));
      setTables((prev) => prev.map((t) => (t.area_id === id ? { ...t, area_id: null } : t)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete area');
    }
  };

  const openAddTable = () => {
    setEditingTable(null);
    setTableForm({ ...blankTable(), area_id: areas[0]?.id ?? null, display_order: tables.length + 1 });
    setTableModalOpen(true);
  };

  const openEditTable = (t: PosTable) => {
    setEditingTable(t);
    setTableForm({
      area_id: t.area_id,
      name: t.name,
      seating_capacity: t.seating_capacity,
      display_order: t.display_order,
      is_active: t.is_active,
      current_status: t.current_status,
    });
    setTableModalOpen(true);
  };

  const saveTable = async () => {
    if (!tableForm.name.trim()) return;
    setTableSaving(true);
    try {
      const payload: PosTableInput = {
        ...tableForm,
        name: tableForm.name.trim(),
        seating_capacity: Number(tableForm.seating_capacity) || 1,
        display_order: Number(tableForm.display_order) || 0,
      };
      const saved = await upsertPosTable(payload, editingTable?.id);
      setTables((prev) => {
        const idx = prev.findIndex((t) => t.id === saved.id);
        if (idx >= 0) { const next = [...prev]; next[idx] = saved; return next.sort((a, b) => a.display_order - b.display_order); }
        return [...prev, saved].sort((a, b) => a.display_order - b.display_order);
      });
      setTableModalOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save table');
    } finally {
      setTableSaving(false);
    }
  };

  const removeTable = async (id: string) => {
    if (!confirm('Delete this table?')) return;
    try {
      await deletePosTable(id);
      setTables((prev) => prev.filter((t) => t.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete table');
    }
  };

  const toggleTableActive = async (t: PosTable) => {
    try {
      const saved = await upsertPosTable(
        {
          area_id: t.area_id,
          name: t.name,
          seating_capacity: t.seating_capacity,
          display_order: t.display_order,
          is_active: !t.is_active,
          current_status: t.current_status,
        },
        t.id,
      );
      setTables((prev) => prev.map((x) => (x.id === saved.id ? saved : x)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to toggle table');
    }
  };

  const changeStatus = async (id: string, status: PosTableStatus) => {
    setStatusPickerOpen(null);
    try {
      const saved = await setPosTableStatus(id, status);
      setTables((prev) => prev.map((x) => (x.id === saved.id ? saved : x)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to change status');
    }
  };

  const inputCls = 'w-full px-3 py-2.5 border border-slate-300 rounded-lg bg-white text-slate-900 text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent transition placeholder:text-slate-400';
  const labelCls = 'block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1';

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of POS_TABLE_STATUSES) counts[s.value] = 0;
    for (const t of tables) counts[t.current_status] = (counts[t.current_status] ?? 0) + 1;
    return counts;
  }, [tables]);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={onBack} className="p-2 text-slate-500 hover:text-brand-600 hover:bg-slate-100 rounded-lg transition">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <Armchair className="w-5 h-5 text-brand-600" />
            <h1 className="text-lg font-bold text-brand-navy-800">Tables</h1>
          </div>
          {/* Status summary pills */}
          <div className="hidden md:flex items-center gap-1.5 ml-auto">
            {POS_TABLE_STATUSES.map((s) => (
              <div key={s.value} className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1">
                <span className={`w-2 h-2 rounded-full ${s.dot}`} />
                <span className="text-xs font-semibold text-slate-600">{s.label}</span>
                <span className="text-xs text-slate-400 tabular-nums">{statusCounts[s.value] ?? 0}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Filters row */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 bg-slate-100 rounded-lg px-3 py-2 flex-1 min-w-[160px]">
            <Search className="w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tables…"
              className="bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none w-full"
            />
          </div>

          <select
            value={areaFilter}
            onChange={(e) => setAreaFilter(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg bg-white text-sm text-slate-700 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
          >
            <option value="all">All Areas</option>
            <option value="none">Unassigned</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="px-3 py-2 border border-slate-200 rounded-lg bg-white text-sm text-slate-700 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
          >
            <option value="all">All Statuses</option>
            {POS_TABLE_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>

          <button
            onClick={openAddArea}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition"
          >
            <Plus className="w-4 h-4" /> Area
          </button>
          <button
            onClick={openAddTable}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 transition shadow-sm"
          >
            <Plus className="w-4 h-4" /> Add Table
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-4 mt-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Areas strip */}
      {areas.length > 0 && (
        <div className="px-4 pt-3">
          <div className="flex flex-wrap gap-2">
            {areas.map((a) => (
              <div key={a.id} className="group flex items-center gap-1.5 rounded-full bg-white border border-slate-200 pl-3 pr-1.5 py-1.5 text-xs">
                <span className={`w-2 h-2 rounded-full ${a.is_active ? 'bg-emerald-400' : 'bg-slate-300'}`} />
                <MapPin className="w-3 h-3 text-slate-400" />
                <span className="font-semibold text-slate-700">{a.name}</span>
                <span className="text-slate-400">{tables.filter((t) => t.area_id === a.id).length}</span>
                <button onClick={() => openEditArea(a)} className="p-0.5 text-slate-400 hover:text-brand-600 transition" title="Edit area">
                  <Pencil className="w-3 h-3" />
                </button>
                <button onClick={() => removeArea(a.id)} className="p-0.5 text-slate-400 hover:text-red-500 transition" title="Delete area">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Floor view */}
      <div className="px-4 py-4">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredTables.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <LayoutGrid className="w-12 h-12 text-slate-300 mb-3" />
            <p className="text-sm font-semibold text-slate-500">{tables.length === 0 ? 'No tables yet' : 'No tables match your filters'}</p>
            <p className="text-xs text-slate-400 mt-1">{tables.length === 0 ? 'Click "Add Table" to create your first table.' : 'Try adjusting your search or filters.'}</p>
          </div>
        ) : (
          <div className="space-y-6">
            {Array.from(tablesByArea.entries()).map(([areaId, areaTables]) => (
              <div key={areaId}>
                <div className="flex items-center gap-2 mb-3">
                  <MapPin className="w-4 h-4 text-brand-500" />
                  <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">{areaId === 'none' ? 'Unassigned' : resolveAreaName(areaId)}</h2>
                  <span className="text-xs text-slate-400">({areaTables.length})</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                  {areaTables.map((t) => {
                    const sm = statusMeta(t.current_status);
                    return (
                      <div
                        key={t.id}
                        className={`relative rounded-xl border-2 bg-white p-3 shadow-sm transition hover:shadow-md ${t.is_active ? 'border-slate-200' : 'border-slate-100 opacity-60'}`}
                      >
                        {/* Status badge */}
                        <div className="flex items-center justify-between mb-2">
                          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${sm.color}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${sm.dot}`} />
                            {sm.label}
                          </span>
                          <button
                            onClick={() => toggleTableActive(t)}
                            className="text-slate-300 hover:text-brand-600 transition"
                            title={t.is_active ? 'Deactivate' : 'Activate'}
                          >
                            {t.is_active ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Circle className="w-4 h-4" />}
                          </button>
                        </div>

                        {/* Table name */}
                        <p className="text-lg font-bold text-slate-800 mb-1">{t.name}</p>
                        <div className="flex items-center gap-1 text-xs text-slate-400 mb-3">
                          <Users className="w-3.5 h-3.5" />
                          <span>{t.seating_capacity} seats</span>
                        </div>

                        {/* Status picker trigger */}
                        <div className="relative">
                          <button
                            onClick={() => setStatusPickerOpen(statusPickerOpen === t.id ? null : t.id)}
                            className="w-full rounded-lg bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-600 py-1.5 transition"
                          >
                            Change Status
                          </button>
                          {statusPickerOpen === t.id && (
                            <>
                              <div className="fixed inset-0 z-10" onClick={() => setStatusPickerOpen(null)} />
                              <div className="absolute bottom-full mb-1 left-0 right-0 z-20 rounded-lg border border-slate-200 bg-white shadow-lg p-1">
                                {POS_TABLE_STATUSES.map((s) => (
                                  <button
                                    key={s.value}
                                    onClick={() => changeStatus(t.id, s.value)}
                                    className={`w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-semibold transition hover:bg-slate-50 ${t.current_status === s.value ? 'bg-slate-100' : ''}`}
                                  >
                                    <span className={`w-2 h-2 rounded-full ${s.dot}`} />
                                    {s.label}
                                  </button>
                                ))}
                              </div>
                            </>
                          )}
                        </div>

                        {/* Edit / Delete */}
                        <div className="flex items-center justify-center gap-1 mt-2 pt-2 border-t border-slate-100">
                          <button onClick={() => openEditTable(t)} className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition" title="Edit table">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => removeTable(t.id)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition" title="Delete table">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Area modal */}
      {areaModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-brand-navy/45 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setAreaModalOpen(false); }}>
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl sm:p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-brand-navy-800">{editingArea ? 'Edit Area' : 'Add Area'}</h2>
              <button onClick={() => setAreaModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Area Name</label>
                <input type="text" value={areaName} onChange={(e) => setAreaName(e.target.value)} className={inputCls} placeholder="e.g. Garden" autoFocus />
              </div>
              <div>
                <label className={labelCls}>Display Order</label>
                <input type="number" value={areaOrder} onChange={(e) => setAreaOrder(Number(e.target.value))} className={inputCls} />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={areaActive} onChange={(e) => setAreaActive(e.target.checked)} className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500" />
                <span className="text-sm text-slate-700">Active</span>
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setAreaModalOpen(false)} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
              <button onClick={saveArea} disabled={areaSaving} className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60">{areaSaving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Table modal */}
      {tableModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-brand-navy/45 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setTableModalOpen(false); }}>
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-5 shadow-xl sm:p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-brand-navy-800">{editingTable ? 'Edit Table' : 'Add Table'}</h2>
              <button onClick={() => setTableModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className={labelCls}>Table Name / Number</label>
                <input type="text" value={tableForm.name} onChange={(e) => setTableForm({ ...tableForm, name: e.target.value })} className={inputCls} placeholder="e.g. T01" autoFocus />
              </div>
              <div>
                <label className={labelCls}>Area / Section</label>
                <select value={tableForm.area_id ?? ''} onChange={(e) => setTableForm({ ...tableForm, area_id: e.target.value || null })} className={inputCls}>
                  <option value="">Unassigned</option>
                  {areas.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Seating Capacity</label>
                <input type="number" min={1} value={tableForm.seating_capacity} onChange={(e) => setTableForm({ ...tableForm, seating_capacity: Number(e.target.value) })} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Display Order</label>
                <input type="number" value={tableForm.display_order} onChange={(e) => setTableForm({ ...tableForm, display_order: Number(e.target.value) })} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Status</label>
                <select value={tableForm.current_status} onChange={(e) => setTableForm({ ...tableForm, current_status: e.target.value as PosTableStatus })} className={inputCls}>
                  {POS_TABLE_STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={tableForm.is_active} onChange={(e) => setTableForm({ ...tableForm, is_active: e.target.checked })} className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500" />
                  <span className="text-sm text-slate-700">Active</span>
                </label>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setTableModalOpen(false)} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
              <button onClick={saveTable} disabled={tableSaving} className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60">{tableSaving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
