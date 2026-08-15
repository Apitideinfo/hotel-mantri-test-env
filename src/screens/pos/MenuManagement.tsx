import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, Plus, Search, Pencil, Trash2, X, UtensilsCrossed,
  Leaf, Drumstick, CheckCircle2, XCircle, Package,
} from 'lucide-react';
import type { PosMenuCategory, PosMenuItem, PosMenuItemInput, PosMenuCategoryInput } from '@/lib/types';
import {
  getPosCategories, upsertPosCategory, deletePosCategory,
  getPosItems, upsertPosItem, deletePosItem,
} from '@/lib/api-pos';

interface MenuManagementProps {
  onBack: () => void;
}

type VegFilter = 'all' | 'veg' | 'nonveg';
type StatusFilter = 'all' | 'active' | 'inactive';

export const MenuManagement = ({ onBack }: MenuManagementProps) => {
  const [categories, setCategories] = useState<PosMenuCategory[]>([]);
  const [items, setItems] = useState<PosMenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [vegFilter, setVegFilter] = useState<VegFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const [catModalOpen, setCatModalOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<PosMenuCategory | null>(null);
  const [catName, setCatName] = useState('');
  const [catOrder, setCatOrder] = useState(0);
  const [catActive, setCatActive] = useState(true);
  const [catSaving, setCatSaving] = useState(false);

  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<PosMenuItem | null>(null);
  const [itemForm, setItemForm] = useState<PosMenuItemInput>(blankItem());
  const [itemSaving, setItemSaving] = useState(false);

  function blankItem(): PosMenuItemInput {
    return {
      category_id: null,
      name: '',
      is_veg: true,
      price: 0,
      gst_percent: 5,
      description: '',
      is_active: true,
      is_available: true,
      image_url: '',
      display_order: 0,
    };
  }

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [cats, itms] = await Promise.all([getPosCategories(), getPosItems()]);
      setCategories(cats);
      setItems(itms);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load menu data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const categoryName = (id: string | null) =>
    id ? categories.find((c) => c.id === id)?.name ?? 'Uncategorized' : 'Uncategorized';

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (q && !item.name.toLowerCase().includes(q) && !item.description?.toLowerCase().includes(q)) return false;
      if (categoryFilter !== 'all' && item.category_id !== (categoryFilter === 'none' ? null : categoryFilter)) return false;
      if (vegFilter === 'veg' && !item.is_veg) return false;
      if (vegFilter === 'nonveg' && item.is_veg) return false;
      if (statusFilter === 'active' && !item.is_active) return false;
      if (statusFilter === 'inactive' && item.is_active) return false;
      return true;
    });
  }, [items, search, categoryFilter, vegFilter, statusFilter]);

  const openAddCategory = () => {
    setEditingCat(null);
    setCatName('');
    setCatOrder(categories.length + 1);
    setCatActive(true);
    setCatModalOpen(true);
  };

  const openEditCategory = (cat: PosMenuCategory) => {
    setEditingCat(cat);
    setCatName(cat.name);
    setCatOrder(cat.display_order);
    setCatActive(cat.is_active);
    setCatModalOpen(true);
  };

  const saveCategory = async () => {
    if (!catName.trim()) return;
    setCatSaving(true);
    try {
      const payload: PosMenuCategoryInput = {
        name: catName.trim(),
        display_order: catOrder,
        is_active: catActive,
      };
      const saved = await upsertPosCategory(payload, editingCat?.id);
      setCategories((prev) => {
        const idx = prev.findIndex((c) => c.id === saved.id);
        if (idx >= 0) { const next = [...prev]; next[idx] = saved; return next.sort((a, b) => a.display_order - b.display_order); }
        return [...prev, saved].sort((a, b) => a.display_order - b.display_order);
      });
      setCatModalOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save category');
    } finally {
      setCatSaving(false);
    }
  };

  const removeCategory = async (id: string) => {
    if (!confirm('Delete this category? Items in it will become uncategorized but are not removed.')) return;
    try {
      await deletePosCategory(id);
      setCategories((prev) => prev.filter((c) => c.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete category');
    }
  };

  const openAddItem = () => {
    setEditingItem(null);
    setItemForm({ ...blankItem(), category_id: categories[0]?.id ?? null });
    setItemModalOpen(true);
  };

  const openEditItem = (item: PosMenuItem) => {
    setEditingItem(item);
    setItemForm({
      category_id: item.category_id,
      name: item.name,
      is_veg: item.is_veg,
      price: item.price,
      gst_percent: item.gst_percent,
      description: item.description,
      is_active: item.is_active,
      is_available: item.is_available,
      image_url: item.image_url,
      display_order: item.display_order,
    });
    setItemModalOpen(true);
  };

  const saveItem = async () => {
    if (!itemForm.name.trim()) return;
    setItemSaving(true);
    try {
      const payload: PosMenuItemInput = {
        ...itemForm,
        name: itemForm.name.trim(),
        price: Number(itemForm.price) || 0,
        gst_percent: Number(itemForm.gst_percent) || 0,
        display_order: Number(itemForm.display_order) || 0,
      };
      const saved = await upsertPosItem(payload, editingItem?.id);
      setItems((prev) => {
        const idx = prev.findIndex((i) => i.id === saved.id);
        if (idx >= 0) { const next = [...prev]; next[idx] = saved; return next.sort((a, b) => a.display_order - b.display_order); }
        return [...prev, saved].sort((a, b) => a.display_order - b.display_order);
      });
      setItemModalOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save item');
    } finally {
      setItemSaving(false);
    }
  };

  const removeItem = async (id: string) => {
    if (!confirm('Delete this menu item?')) return;
    try {
      await deletePosItem(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete item');
    }
  };

  const toggleAvailability = async (item: PosMenuItem) => {
    try {
      const saved = await upsertPosItem(
        {
          category_id: item.category_id,
          name: item.name,
          is_veg: item.is_veg,
          price: item.price,
          gst_percent: item.gst_percent,
          description: item.description,
          is_active: item.is_active,
          is_available: !item.is_available,
          image_url: item.image_url,
          display_order: item.display_order,
        },
        item.id,
      );
      setItems((prev) => prev.map((i) => (i.id === saved.id ? saved : i)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to toggle availability');
    }
  };

  const toggleActive = async (item: PosMenuItem) => {
    try {
      const saved = await upsertPosItem(
        {
          category_id: item.category_id,
          name: item.name,
          is_veg: item.is_veg,
          price: item.price,
          gst_percent: item.gst_percent,
          description: item.description,
          is_active: !item.is_active,
          is_available: item.is_available,
          image_url: item.image_url,
          display_order: item.display_order,
        },
        item.id,
      );
      setItems((prev) => prev.map((i) => (i.id === saved.id ? saved : i)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to toggle status');
    }
  };

  const inputCls = 'w-full px-3 py-2.5 border border-slate-300 rounded-lg bg-white text-slate-900 text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent transition placeholder:text-slate-400';
  const labelCls = 'block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1';

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={onBack} className="p-2 text-slate-500 hover:text-brand-600 hover:bg-slate-100 rounded-lg transition">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <UtensilsCrossed className="w-5 h-5 text-brand-600" />
            <h1 className="text-lg font-bold text-brand-navy-800">Menu Management</h1>
          </div>
        </div>

        {/* Filters row */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 bg-slate-100 rounded-lg px-3 py-2 flex-1 min-w-[180px]">
            <Search className="w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search items…"
              className="bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none w-full"
            />
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg bg-white text-sm text-slate-700 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
          >
            <option value="all">All Categories</option>
            <option value="none">Uncategorized</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          <div className="flex rounded-lg border border-slate-200 overflow-hidden">
            {(['all', 'veg', 'nonveg'] as VegFilter[]).map((v) => (
              <button
                key={v}
                onClick={() => setVegFilter(v)}
                className={`px-3 py-2 text-xs font-semibold transition ${vegFilter === v ? 'bg-brand-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
              >
                {v === 'all' ? 'All' : v === 'veg' ? 'Veg' : 'Non-Veg'}
              </button>
            ))}
          </div>

          <div className="flex rounded-lg border border-slate-200 overflow-hidden">
            {(['all', 'active', 'inactive'] as StatusFilter[]).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-2 text-xs font-semibold capitalize transition ${statusFilter === s ? 'bg-brand-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
              >
                {s}
              </button>
            ))}
          </div>

          <button
            onClick={openAddCategory}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition"
          >
            <Plus className="w-4 h-4" /> Category
          </button>
          <button
            onClick={openAddItem}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 transition shadow-sm"
          >
            <Plus className="w-4 h-4" /> Add Item
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

      {/* Categories strip */}
      {categories.length > 0 && (
        <div className="px-4 pt-3">
          <div className="flex flex-wrap gap-2">
            {categories.map((cat) => (
              <div key={cat.id} className="group flex items-center gap-1.5 rounded-full bg-white border border-slate-200 pl-3 pr-1.5 py-1.5 text-xs">
                <span className={`w-2 h-2 rounded-full ${cat.is_active ? 'bg-emerald-400' : 'bg-slate-300'}`} />
                <span className="font-semibold text-slate-700">{cat.name}</span>
                <span className="text-slate-400">{items.filter((i) => i.category_id === cat.id).length}</span>
                <button onClick={() => openEditCategory(cat)} className="p-0.5 text-slate-400 hover:text-brand-600 transition" title="Edit category">
                  <Pencil className="w-3 h-3" />
                </button>
                <button onClick={() => removeCategory(cat.id)} className="p-0.5 text-slate-400 hover:text-red-500 transition" title="Delete category">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Items table */}
      <div className="px-4 py-4">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Package className="w-12 h-12 text-slate-300 mb-3" />
            <p className="text-sm font-semibold text-slate-500">{items.length === 0 ? 'No menu items yet' : 'No items match your filters'}</p>
            <p className="text-xs text-slate-400 mt-1">{items.length === 0 ? 'Click "Add Item" to create your first menu item.' : 'Try adjusting your search or filters.'}</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden lg:block overflow-hidden rounded-2xl border border-slate-200 shadow-sm">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wide">Item</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wide">Category</th>
                    <th className="px-4 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wide">Price</th>
                    <th className="px-4 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wide">GST</th>
                    <th className="px-4 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wide">Veg/Non-Veg</th>
                    <th className="px-4 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wide">Availability</th>
                    <th className="px-4 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wide">Status</th>
                    <th className="px-4 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wide">Edit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredItems.map((item) => (
                    <tr key={item.id} className="bg-white hover:bg-slate-50/50 transition">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {item.image_url ? (
                            <img src={item.image_url} alt={item.name} className="w-10 h-10 rounded-lg object-cover shrink-0" />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                              <UtensilsCrossed className="w-4 h-4 text-slate-300" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-800 truncate">{item.name}</p>
                            {item.description && <p className="text-xs text-slate-400 truncate max-w-[240px]">{item.description}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">{categoryName(item.category_id)}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-slate-800 text-right tabular-nums">₹{Number(item.price).toFixed(0)}</td>
                      <td className="px-4 py-3 text-sm text-slate-500 text-center tabular-nums">{Number(item.gst_percent)}%</td>
                      <td className="px-4 py-3 text-center">
                        {item.is_veg ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600"><span className="w-3.5 h-3.5 rounded border-2 border-emerald-500 flex items-center justify-center"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /></span> Veg</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-500"><span className="w-3.5 h-3.5 rounded border-2 border-red-500 flex items-center justify-center"><span className="w-1.5 h-1.5 rounded-full bg-red-500" /></span> Non-Veg</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button onClick={() => toggleAvailability(item)} className="transition hover:scale-110" title={item.is_available ? 'Mark Sold Out' : 'Mark Available'}>
                          {item.is_available
                            ? <CheckCircle2 className="w-5 h-5 text-emerald-500 mx-auto" />
                            : <XCircle className="w-5 h-5 text-red-400 mx-auto" />}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button onClick={() => toggleActive(item)} className="transition hover:scale-110" title={item.is_active ? 'Deactivate' : 'Activate'}>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${item.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                            {item.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </button>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => openEditItem(item)} className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition" title="Edit item">
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button onClick={() => removeItem(item.id)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition" title="Delete item">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="lg:hidden space-y-3">
              {filteredItems.map((item) => (
                <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                  <div className="flex items-start gap-3">
                    {item.image_url ? (
                      <img src={item.image_url} alt={item.name} className="w-12 h-12 rounded-lg object-cover shrink-0" />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                        <UtensilsCrossed className="w-5 h-5 text-slate-300" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {item.is_veg ? <Leaf className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> : <Drumstick className="w-3.5 h-3.5 text-red-400 shrink-0" />}
                        <p className="text-sm font-semibold text-slate-800 truncate">{item.name}</p>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{categoryName(item.category_id)}</p>
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className="text-sm font-bold text-slate-800">₹{Number(item.price).toFixed(0)}</span>
                        <span className="text-xs text-slate-400">GST {Number(item.gst_percent)}%</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
                    <div className="flex items-center gap-2">
                      <button onClick={() => toggleAvailability(item)} className="flex items-center gap-1 text-xs font-semibold">
                        {item.is_available ? <><CheckCircle2 className="w-4 h-4 text-emerald-500" /> Available</> : <><XCircle className="w-4 h-4 text-red-400" /> Sold Out</>}
                      </button>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${item.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                        {item.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEditItem(item)} className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => removeItem(item.id)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Category modal */}
      {catModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-brand-navy/45 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setCatModalOpen(false); }}>
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl sm:p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-brand-navy-800">{editingCat ? 'Edit Category' : 'Add Category'}</h2>
              <button onClick={() => setCatModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Category Name</label>
                <input type="text" value={catName} onChange={(e) => setCatName(e.target.value)} className={inputCls} placeholder="e.g. Starters" autoFocus />
              </div>
              <div>
                <label className={labelCls}>Display Order</label>
                <input type="number" value={catOrder} onChange={(e) => setCatOrder(Number(e.target.value))} className={inputCls} />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={catActive} onChange={(e) => setCatActive(e.target.checked)} className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500" />
                <span className="text-sm text-slate-700">Active</span>
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setCatModalOpen(false)} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
              <button onClick={saveCategory} disabled={catSaving} className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60">{catSaving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Item modal */}
      {itemModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-brand-navy/45 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setItemModalOpen(false); }}>
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-5 shadow-xl sm:p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-brand-navy-800">{editingItem ? 'Edit Item' : 'Add Item'}</h2>
              <button onClick={() => setItemModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className={labelCls}>Item Name</label>
                <input type="text" value={itemForm.name} onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })} className={inputCls} placeholder="e.g. Paneer Tikka" autoFocus />
              </div>
              <div>
                <label className={labelCls}>Category</label>
                <select value={itemForm.category_id ?? ''} onChange={(e) => setItemForm({ ...itemForm, category_id: e.target.value || null })} className={inputCls}>
                  <option value="">Uncategorized</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Selling Price (₹)</label>
                <input type="number" value={itemForm.price} onChange={(e) => setItemForm({ ...itemForm, price: Number(e.target.value) })} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>GST %</label>
                <input type="number" step="0.5" value={itemForm.gst_percent} onChange={(e) => setItemForm({ ...itemForm, gst_percent: Number(e.target.value) })} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Display Order</label>
                <input type="number" value={itemForm.display_order} onChange={(e) => setItemForm({ ...itemForm, display_order: Number(e.target.value) })} className={inputCls} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>Description</label>
                <textarea value={itemForm.description} onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })} className={inputCls} rows={2} placeholder="Optional description" />
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>Image URL (optional)</label>
                <input type="text" value={itemForm.image_url} onChange={(e) => setItemForm({ ...itemForm, image_url: e.target.value })} className={inputCls} placeholder="https://…" />
              </div>
              <div>
                <label className={labelCls}>Type</label>
                <div className="flex gap-2">
                  <button onClick={() => setItemForm({ ...itemForm, is_veg: true })} className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-semibold border transition ${itemForm.is_veg ? 'border-emerald-500 bg-emerald-50 text-emerald-600' : 'border-slate-200 text-slate-400'}`}>
                    <Leaf className="w-4 h-4" /> Veg
                  </button>
                  <button onClick={() => setItemForm({ ...itemForm, is_veg: false })} className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-semibold border transition ${!itemForm.is_veg ? 'border-red-500 bg-red-50 text-red-500' : 'border-slate-200 text-slate-400'}`}>
                    <Drumstick className="w-4 h-4" /> Non-Veg
                  </button>
                </div>
              </div>
              <div className="flex items-end gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={itemForm.is_active} onChange={(e) => setItemForm({ ...itemForm, is_active: e.target.checked })} className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500" />
                  <span className="text-sm text-slate-700">Active</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={itemForm.is_available} onChange={(e) => setItemForm({ ...itemForm, is_available: e.target.checked })} className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500" />
                  <span className="text-sm text-slate-700">Available</span>
                </label>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setItemModalOpen(false)} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
              <button onClick={saveItem} disabled={itemSaving} className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60">{itemSaving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
