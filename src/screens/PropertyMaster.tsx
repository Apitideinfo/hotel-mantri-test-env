import { useEffect, useState, useCallback } from 'react';
import {
  ArrowLeft, Plus, Trash2, Save, Building2, BedDouble, Pencil, X, Check,
  IndianRupee, Layers, Power, AlertCircle, Copy, ChevronDown, ChevronUp,
} from 'lucide-react';
import type { RoomCategory, Room, RoomInput } from '@/lib/types';
import {
  getRoomCategories, getRooms, saveRoom, deleteRoom, bulkInsertRooms,
  upsertRoomCategory, deleteRoomCategory,
} from '@/lib/api';
import { fmtMoney, toNum } from '@/lib/calc';

interface PropertyMasterProps {
  onBack: () => void;
}

type View = 'overview' | 'categories' | 'rooms';

export const PropertyMaster = ({ onBack }: PropertyMasterProps) => {
  const [view, setView] = useState<View>('overview');
  const [categories, setCategories] = useState<RoomCategory[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [cats, rs] = await Promise.all([getRoomCategories(), getRooms()]);
      setCategories(cats);
      setRooms(rs);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const catName = (id: string | null): string => {
    if (!id) return 'Uncategorized';
    return categories.find((c) => c.id === id)?.name ?? 'Uncategorized';
  };
  const catTariff = (id: string | null): number => {
    if (!id) return 0;
    return categories.find((c) => c.id === id)?.default_tariff ?? 0;
  };

  const activeRooms = rooms.filter((r) => r.is_active);
  const inactiveRooms = rooms.filter((r) => !r.is_active);
  const activeCats = categories.filter((c) => c.is_active);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-sky-800 text-white px-4 py-3 flex items-center gap-3 shadow-lg">
        <button onClick={onBack} className="p-1.5 -ml-1.5 hover:bg-sky-700 rounded-lg transition">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-base font-semibold leading-tight">Property Master</h1>
          <p className="text-sky-200 text-xs">Room Categories & Inventory</p>
        </div>
        <Building2 className="w-5 h-5 text-sky-300" />
      </header>

      <div className="px-4 pt-4 w-full">
        {error && (
          <div className="mb-3 flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">
            <AlertCircle className="w-4 h-4 shrink-0" /> {error}
          </div>
        )}

        {/* View tabs */}
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1 mb-4">
          <ViewTab active={view === 'overview'} onClick={() => setView('overview')} icon={<Building2 className="w-4 h-4" />} label="Overview" />
          <ViewTab active={view === 'categories'} onClick={() => setView('categories')} icon={<Layers className="w-4 h-4" />} label="Categories" count={categories.length} />
          <ViewTab active={view === 'rooms'} onClick={() => setView('rooms')} icon={<BedDouble className="w-4 h-4" />} label="Rooms" count={rooms.length} />
        </div>

        {loading ? (
          <div className="text-center text-slate-400 text-sm py-12">Loading property master…</div>
        ) : (
          <>
            {view === 'overview' && (
              <OverviewView categories={categories} rooms={rooms} activeCats={activeCats} activeRooms={activeRooms} inactiveRooms={inactiveRooms} catName={catName} setView={setView} />
            )}
            {view === 'categories' && (
              <CategoriesView categories={categories} setCategories={setCategories} setError={setError} />
            )}
            {view === 'rooms' && (
              <RoomsView rooms={rooms} setRooms={setRooms} categories={categories} catName={catName} catTariff={catTariff} setError={setError} />
            )}
          </>
        )}
      </div>
    </div>
  );
};

// ── Overview ──

const OverviewView = ({ categories, rooms, activeCats, activeRooms, inactiveRooms, catName, setView }: {
  categories: RoomCategory[];
  rooms: Room[];
  activeCats: RoomCategory[];
  activeRooms: Room[];
  inactiveRooms: Room[];
  catName: (id: string | null) => string;
  setView: (v: View) => void;
}) => {
  const floors = new Map<string, number>();
  for (const r of rooms) {
    const f = r.floor || 'Unspecified';
    floors.set(f, (floors.get(f) ?? 0) + 1);
  }

  return (
    <div className="space-y-4">
      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Categories" value={categories.length} sub={`${activeCats.length} active`} icon={<Layers className="w-4 h-4 text-sky-600" />} bg="bg-sky-50" />
        <StatCard label="Total Rooms" value={rooms.length} sub={`${activeRooms.length} active`} icon={<BedDouble className="w-4 h-4 text-emerald-600" />} bg="bg-emerald-50" />
        <StatCard label="Inactive Rooms" value={inactiveRooms.length} sub="disabled" icon={<Power className="w-4 h-4 text-slate-400" />} bg="bg-slate-50" />
        <StatCard label="Floors" value={floors.size} sub="distinct" icon={<Building2 className="w-4 h-4 text-violet-600" />} bg="bg-violet-50" />
      </div>

      {/* Category breakdown */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="bg-slate-50 px-4 py-2.5 flex items-center justify-between border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Rooms by Category</h2>
          <button onClick={() => setView('categories')} className="text-xs text-sky-600 font-medium hover:underline">Manage</button>
        </div>
        <div className="p-4">
          {categories.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">No categories yet. Create categories first.</p>
          ) : (
            <div className="space-y-2">
              {categories.map((c) => {
                const count = rooms.filter((r) => r.category_id === c.id).length;
                const activeCount = rooms.filter((r) => r.category_id === c.id && r.is_active).length;
                return (
                  <div key={c.id} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${c.is_active ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                      <span className="text-sm font-medium text-slate-700">{c.name}</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs">
                      <span className="text-slate-500">₹{fmtMoney(c.default_tariff)} <span className="text-slate-400">tariff</span></span>
                      <span className="text-slate-500">₹{fmtMoney(c.extra_bed_charge)} <span className="text-slate-400">extra bed</span></span>
                      <span className="font-semibold text-slate-700 tabular-nums">{activeCount}/{count} <span className="text-slate-400 font-normal">rooms</span></span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Floor breakdown */}
      {floors.size > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="bg-slate-50 px-4 py-2.5 flex items-center justify-between border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Rooms by Floor</h2>
          </div>
          <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array.from(floors.entries()).sort().map(([floor, count]) => (
              <div key={floor} className="bg-slate-50 rounded-xl p-3 text-center">
                <p className="text-xs text-slate-500">{floor}</p>
                <p className="text-xl font-bold text-slate-800 tabular-nums">{count}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => setView('categories')}
          className="flex items-center justify-center gap-2 bg-white hover:bg-slate-50 text-slate-700 font-semibold py-3 rounded-xl border border-slate-200 shadow-sm transition">
          <Layers className="w-4 h-4" /> Edit Categories
        </button>
        <button onClick={() => setView('rooms')}
          className="flex items-center justify-center gap-2 bg-sky-700 hover:bg-sky-800 text-white font-semibold py-3 rounded-xl shadow-sm transition">
          <BedDouble className="w-4 h-4" /> Manage Rooms
        </button>
      </div>
    </div>
  );
};

// ── Categories ──

const CategoriesView = ({ categories, setCategories, setError }: {
  categories: RoomCategory[];
  setCategories: React.Dispatch<React.SetStateAction<RoomCategory[]>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
}) => {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [tariff, setTariff] = useState(0);
  const [extraBed, setExtraBed] = useState(0);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setName(''); setTariff(0); setExtraBed(0); setEditId(null); setShowForm(false);
  };

  const startEdit = (c: RoomCategory) => {
    setEditId(c.id); setName(c.name); setTariff(toNum(c.default_tariff)); setExtraBed(toNum(c.extra_bed_charge)); setShowForm(true);
  };

  const handleSave = async () => {
    setError(null);
    if (!name.trim()) { setError('Category name is required.'); return; }
    try {
      setSaving(true);
      const saved = await upsertRoomCategory(name, editId ?? undefined, { default_tariff: tariff, extra_bed_charge: extraBed });
      if (editId) {
        setCategories((prev) => prev.map((c) => (c.id === editId ? saved : c)));
      } else {
        setCategories((prev) => [...prev, saved]);
      }
      reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save category');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this category? Rooms in this category will become uncategorized but will not be deleted.')) return;
    try {
      await deleteRoomCategory(id);
      setCategories((prev) => prev.filter((c) => c.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete category');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Room Categories</h2>
        {!showForm && (
          <button onClick={() => { reset(); setShowForm(true); }}
            className="flex items-center gap-1.5 bg-sky-700 hover:bg-sky-800 text-white text-sm font-medium px-3 py-2 rounded-lg transition">
            <Plus className="w-4 h-4" /> Add Category
          </button>
        )}
      </div>

      {showForm && (
        <div className="bg-white rounded-2xl border border-sky-200 shadow-sm p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800">{editId ? 'Edit Category' : 'New Category'}</h3>
            <button onClick={reset} className="p-1 text-slate-400 hover:text-slate-600 rounded"><X className="w-4 h-4" /></button>
          </div>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Category name (e.g. Deluxe, Suite)"
            className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-sky-500" />
          <div className="grid grid-cols-2 gap-3">
            <NumInput label="Default Tariff" prefix="₹" value={tariff} onChange={setTariff} />
            <NumInput label="Extra Bed Charge" prefix="₹" value={extraBed} onChange={setExtraBed} />
          </div>
          <button onClick={handleSave} disabled={saving}
            className="w-full flex items-center justify-center gap-2 bg-sky-700 hover:bg-sky-800 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl transition">
            <Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save Category'}
          </button>
        </div>
      )}

      {/* Category list */}
      <div className="space-y-2">
        {categories.length === 0 && !showForm && (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
            <Layers className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 text-sm font-medium">No categories yet</p>
            <p className="text-slate-400 text-xs mt-1">Add a category to start building your room inventory.</p>
          </div>
        )}
        {categories.map((c) => (
          <div key={c.id} className="bg-white rounded-xl border border-slate-200 p-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className={`w-2.5 h-2.5 rounded-full ${c.is_active ? 'bg-emerald-500' : 'bg-slate-300'}`} />
              <div>
                <p className="text-sm font-semibold text-slate-800">{c.name}</p>
                <p className="text-xs text-slate-400">₹{fmtMoney(c.default_tariff)} tariff · ₹{fmtMoney(c.extra_bed_charge)} extra bed</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => startEdit(c)} className="p-2 text-slate-400 hover:text-sky-600 hover:bg-sky-50 rounded-lg transition"><Pencil className="w-4 h-4" /></button>
              <button onClick={() => handleDelete(c.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Rooms ──

const RoomsView = ({ rooms, setRooms, categories, catName, catTariff, setError }: {
  rooms: Room[];
  setRooms: React.Dispatch<React.SetStateAction<Room[]>>;
  categories: RoomCategory[];
  catName: (id: string | null) => string;
  catTariff: (id: string | null) => number;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
}) => {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [showBulk, setShowBulk] = useState(false);
  const [saving, setSaving] = useState(false);

  // Single form
  const [roomNo, setRoomNo] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [floor, setFloor] = useState('');
  const [tariff, setTariff] = useState(0);
  const [extraBed, setExtraBed] = useState(0);
  const [isActive, setIsActive] = useState(true);

  // Bulk form
  const [bulkStart, setBulkStart] = useState(101);
  const [bulkEnd, setBulkEnd] = useState(110);
  const [bulkFloor, setBulkFloor] = useState('');
  const [bulkCategory, setBulkCategory] = useState('');

  const activeCats = categories.filter((c) => c.is_active);

  const resetForm = () => {
    setRoomNo(''); setCategoryId(''); setFloor(''); setTariff(0); setExtraBed(0); setIsActive(true); setEditId(null); setShowForm(false);
  };

  const startEdit = (r: Room) => {
    setEditId(r.id); setRoomNo(r.room_no); setCategoryId(r.category_id ?? ''); setFloor(r.floor ?? '');
    setTariff(toNum(r.default_tariff)); setExtraBed(toNum(r.extra_bed_charge)); setIsActive(r.is_active); setShowForm(true);
  };

  const handleSave = async () => {
    setError(null);
    if (!roomNo.trim()) { setError('Room number is required.'); return; }
    try {
      setSaving(true);
      const input: RoomInput = {
        room_no: roomNo.trim(),
        category_id: categoryId || null,
        floor: floor.trim() || null,
        default_tariff: tariff,
        extra_bed_charge: extraBed,
        is_active: isActive,
        sort_order: 0,
      };
      const saved = await saveRoom(input, editId ?? undefined);
      if (editId) {
        setRooms((prev) => prev.map((r) => (r.id === editId ? saved : r)));
      } else {
        setRooms((prev) => [...prev, saved]);
      }
      resetForm();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save room');
    } finally {
      setSaving(false);
    }
  };

  const handleBulk = async () => {
    setError(null);
    if (bulkEnd < bulkStart) { setError('End number must be >= start number.'); return; }
    const existingNos = new Set(rooms.map((r) => r.room_no));
    const toCreate: RoomInput[] = [];
    for (let n = bulkStart; n <= bulkEnd; n++) {
      const rn = String(n);
      if (existingNos.has(rn)) continue;
      toCreate.push({
        room_no: rn,
        category_id: bulkCategory || null,
        floor: bulkFloor.trim() || null,
        default_tariff: bulkCategory ? catTariff(bulkCategory) : 0,
        extra_bed_charge: 0,
        is_active: true,
        sort_order: n,
      });
    }
    if (toCreate.length === 0) { setError('All those room numbers already exist.'); return; }
    try {
      setSaving(true);
      const created = await bulkInsertRooms(toCreate);
      setRooms((prev) => [...prev, ...created]);
      setShowBulk(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create rooms');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this room? This cannot be undone.')) return;
    try {
      await deleteRoom(id);
      setRooms((prev) => prev.filter((r) => r.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete room');
    }
  };

  const toggleActive = async (r: Room) => {
    try {
      const saved = await saveRoom({ ...r, is_active: !r.is_active }, r.id);
      setRooms((prev) => prev.map((x) => (x.id === r.id ? saved : x)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update room');
    }
  };

  const sortedRooms = [...rooms].sort((a, b) => {
    const an = parseInt(a.room_no, 10); const bn = parseInt(b.room_no, 10);
    if (!isNaN(an) && !isNaN(bn)) return an - bn;
    return a.room_no.localeCompare(b.room_no);
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Room Inventory</h2>
        <div className="flex gap-2">
          <button onClick={() => { resetForm(); setShowBulk(!showBulk); }}
            className="flex items-center gap-1.5 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium px-3 py-2 rounded-lg border border-slate-200 transition">
            <Copy className="w-4 h-4" /> Bulk Add
          </button>
          <button onClick={() => { resetForm(); setShowForm(true); }}
            className="flex items-center gap-1.5 bg-sky-700 hover:bg-sky-800 text-white text-sm font-medium px-3 py-2 rounded-lg transition">
            <Plus className="w-4 h-4" /> Add Room
          </button>
        </div>
      </div>

      {/* Bulk add form */}
      {showBulk && (
        <div className="bg-white rounded-2xl border border-violet-200 shadow-sm p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800">Bulk Create Rooms</h3>
            <button onClick={() => setShowBulk(false)} className="p-1 text-slate-400 hover:text-slate-600 rounded"><X className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <NumInput label="From Room #" value={bulkStart} onChange={setBulkStart} allowDecimal={false} />
            <NumInput label="To Room #" value={bulkEnd} onChange={setBulkEnd} allowDecimal={false} />
            <div>
              <span className="block text-sm font-medium text-slate-700 mb-1">Category</span>
              <select value={bulkCategory} onChange={(e) => setBulkCategory(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-xl bg-white text-base focus:outline-none focus:ring-2 focus:ring-sky-500">
                <option value="">— None —</option>
                {activeCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <TextInput label="Floor" value={bulkFloor} onChange={setBulkFloor} placeholder="e.g. 1st" />
          </div>
          <p className="text-xs text-slate-400">Creates rooms {bulkStart}–{bulkEnd} (skips existing numbers). Tariff inherits from selected category.</p>
          <button onClick={handleBulk} disabled={saving}
            className="w-full flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl transition">
            <Save className="w-4 h-4" /> {saving ? 'Creating…' : `Create ${Math.max(0, bulkEnd - bulkStart + 1)} Rooms`}
          </button>
        </div>
      )}

      {/* Single room form */}
      {showForm && (
        <div className="bg-white rounded-2xl border border-sky-200 shadow-sm p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800">{editId ? 'Edit Room' : 'New Room'}</h3>
            <button onClick={resetForm} className="p-1 text-slate-400 hover:text-slate-600 rounded"><X className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <TextInput label="Room No." value={roomNo} onChange={setRoomNo} placeholder="e.g. 101" />
            <div>
              <span className="block text-sm font-medium text-slate-700 mb-1">Category</span>
              <select value={categoryId} onChange={(e) => {
                setCategoryId(e.target.value);
                if (e.target.value) { setTariff(catTariff(e.target.value)); }
              }}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-xl bg-white text-base focus:outline-none focus:ring-2 focus:ring-sky-500">
                <option value="">— Uncategorized —</option>
                {activeCats.map((c) => <option key={c.id} value={c.id}>{c.name} (₹{fmtMoney(c.default_tariff)})</option>)}
              </select>
            </div>
            <TextInput label="Floor" value={floor} onChange={setFloor} placeholder="e.g. Ground" />
            <NumInput label="Default Tariff" prefix="₹" value={tariff} onChange={setTariff} />
            <NumInput label="Extra Bed Charge" prefix="₹" value={extraBed} onChange={setExtraBed} />
            <div>
              <span className="block text-sm font-medium text-slate-700 mb-1">Status</span>
              <button onClick={() => setIsActive(!isActive)}
                className={`w-full px-3 py-2.5 rounded-xl border text-sm font-semibold transition ${
                  isActive ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'bg-slate-50 border-slate-300 text-slate-500'
                }`}>
                {isActive ? 'Active' : 'Inactive'}
              </button>
            </div>
          </div>
          <button onClick={handleSave} disabled={saving}
            className="w-full flex items-center justify-center gap-2 bg-sky-700 hover:bg-sky-800 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl transition">
            <Save className="w-4 h-4" /> {saving ? 'Saving…' : editId ? 'Save Changes' : 'Add Room'}
          </button>
        </div>
      )}

      {/* Room grid */}
      {rooms.length === 0 && !showForm && !showBulk ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
          <BedDouble className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 text-sm font-medium">No rooms in inventory</p>
          <p className="text-slate-400 text-xs mt-1">Add rooms individually or use bulk create to add a range.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
          {sortedRooms.map((r) => (
            <div key={r.id} className={`bg-white rounded-xl border p-3 shadow-sm transition ${
              r.is_active ? 'border-slate-200' : 'border-slate-200 opacity-50'
            }`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-base font-bold text-slate-900">{r.room_no}</span>
                <span className={`w-2 h-2 rounded-full ${r.is_active ? 'bg-emerald-500' : 'bg-slate-300'}`} />
              </div>
              <p className="text-[10px] font-medium text-violet-600 truncate">{catName(r.category_id)}</p>
              {r.floor && <p className="text-[10px] text-slate-400">{r.floor} Floor</p>}
              <p className="text-xs font-semibold text-slate-700 mt-1">₹{fmtMoney(r.default_tariff)}</p>
              <div className="flex items-center gap-1 mt-2 pt-2 border-t border-slate-100">
                <button onClick={() => startEdit(r)} className="flex-1 flex items-center justify-center p-1.5 text-slate-400 hover:text-sky-600 hover:bg-sky-50 rounded-lg transition">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => toggleActive(r)} className="flex-1 flex items-center justify-center p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition">
                  <Power className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => handleDelete(r.id)} className="flex-1 flex items-center justify-center p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ── Shared sub-components ──

const ViewTab = ({ active, onClick, icon, label, count }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; label: string; count?: number;
}) => (
  <button onClick={onClick}
    className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-semibold transition ${
      active ? 'bg-white text-sky-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
    }`}>
    {icon} {label}
    {count !== undefined && count > 0 && (
      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${active ? 'bg-sky-100 text-sky-700' : 'bg-slate-200 text-slate-500'}`}>{count}</span>
    )}
  </button>
);

const StatCard = ({ label, value, sub, icon, bg }: {
  label: string; value: number; sub: string; icon: React.ReactNode; bg: string;
}) => (
  <div className="bg-white rounded-xl border border-slate-200 p-3">
    <div className="flex items-center gap-2 mb-1">
      <div className={`w-7 h-7 rounded-lg ${bg} flex items-center justify-center`}>{icon}</div>
      <span className="text-xs text-slate-500 font-medium">{label}</span>
    </div>
    <p className="text-xl font-bold text-slate-900 tabular-nums">{value}</p>
    <p className="text-[10px] text-slate-400">{sub}</p>
  </div>
);

const TextInput = ({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) => (
  <label className="block">
    <span className="block text-sm font-medium text-slate-700 mb-1">{label}</span>
    <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      className="w-full px-3 py-2.5 border border-slate-300 rounded-xl bg-white text-base focus:outline-none focus:ring-2 focus:ring-sky-500" />
  </label>
);

const NumInput = ({ label, value, onChange, prefix, allowDecimal = true }: {
  label: string; value: number; onChange: (v: number) => void; prefix?: string; allowDecimal?: boolean;
}) => {
  const handle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw === '') { onChange(0); return; }
    const n = allowDecimal ? parseFloat(raw) : parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 0) return;
    onChange(n);
  };
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate-700 mb-1">{label}</span>
      <div className="relative flex items-stretch">
        {prefix && <span className="inline-flex items-center px-3 bg-slate-100 border border-r-0 border-slate-300 rounded-l-xl text-slate-500 text-sm">{prefix}</span>}
        <input type="number" inputMode={allowDecimal ? 'decimal' : 'numeric'} min={0} step={allowDecimal ? '0.01' : '1'}
          value={value === 0 ? '' : value} onChange={handle} placeholder="0"
          className={`flex-1 min-w-0 px-3 py-2.5 text-base border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500 ${prefix ? 'rounded-r-xl' : 'rounded-xl'}`} />
      </div>
    </label>
  );
};
