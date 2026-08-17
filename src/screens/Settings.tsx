import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, Save, Lock, Plus, Trash2, Building2, Upload, X, Eye,
  Phone, Mail, Globe, MapPin, FileText, User, Landmark, CreditCard,
  CheckCircle2, AlertCircle, Pencil, ChevronUp, ChevronDown, UtensilsCrossed,
} from 'lucide-react';
import type { HotelSettings, CompanySource, SourceCategory, GstMode, GstType, GstSlab, RoomCategory } from '@/lib/types';
import { SOURCE_CATEGORIES, GST_SLABS, GST_MODES, GST_TYPES } from '@/lib/types';
import {
  getSettings, updateSettings, getCompanySources,
  upsertCompanySource, deleteCompanySource, uploadHotelLogo,
  getRoomCategories, upsertRoomCategory, deleteRoomCategory, reorderRoomCategories,
} from '@/lib/api';
import { getPosEnabled, setPosEnabled } from '@/lib/api-pos';
import { getHotSeasons, addHotSeason, deleteHotSeason } from '@/lib/api-calendar';
import type { HotSeason } from '@/lib/types';

interface SettingsProps {
  onBack: () => void;
}

/* ── tiny sub-components ─────────────────────────────────────── */
const Label = ({ children }: { children: React.ReactNode }) => (
  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">
    {children}
  </label>
);

const Field = ({ children }: { children: React.ReactNode }) => (
  <div className="space-y-1">{children}</div>
);

const input =
  'w-full px-3 py-2.5 border border-slate-300 rounded-lg bg-white text-slate-900 text-sm focus:ring-2 focus:ring-sky-500 focus:border-transparent transition placeholder:text-slate-400';
const inputDisabled =
  'w-full px-3 py-2.5 border border-slate-200 rounded-lg bg-slate-50 text-slate-500 text-sm cursor-not-allowed';

const SectionCard = ({
  title, icon, children, accent = 'bg-white',
}: { title: string; icon: React.ReactNode; children: React.ReactNode; accent?: string }) => (
  <div className={`rounded-2xl border border-slate-200 overflow-hidden shadow-sm ${accent}`}>
    <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
      <span className="text-sky-600">{icon}</span>
      <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">{title}</h2>
    </div>
    <div className="p-4 space-y-3">{children}</div>
  </div>
);

const CURRENT_YEAR = new Date().getFullYear();

/* ── main component ──────────────────────────────────────────── */
export const Settings = ({ onBack }: SettingsProps) => {
  /* core */
  const [settings, setSettings] = useState<HotelSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unlocked, setUnlocked] = useState(false);

  /* Hotel basic */
  const [hotelName, setHotelName] = useState('');
  const [legalName, setLegalName] = useState('');
  const [totalRooms, setTotalRooms] = useState(22);
  const [openingCash, setOpeningCash] = useState(0);
  const [financialYear, setFinancialYear] = useState(CURRENT_YEAR);

  /* Contact */
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [stateName, setStateName] = useState('');
  const [pinCode, setPinCode] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');

  /* Tax */
  const [gst, setGst] = useState('');
  const [pan, setPan] = useState('');
  const [hotelReg, setHotelReg] = useState('');
  const [cin, setCin] = useState('');

  /* GST Module */
  const [gstRegistered, setGstRegistered] = useState(false);
  const [gstMode, setGstMode] = useState<GstMode>('Exclusive');
  const [defaultGstType, setDefaultGstType] = useState<GstType>('No Scope');
  const [defaultGstSlab, setDefaultGstSlab] = useState<GstSlab>(0);

  /* Manager */
  const [managerName, setManagerName] = useState('');
  const [managerMobile, setManagerMobile] = useState('');
  const [adminName, setAdminName] = useState('');

  /* Bank */
  const [bankName, setBankName] = useState('');
  const [accountName, setAccountName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [ifsc, setIfsc] = useState('');

  /* Logo */
  const [logoUrl, setLogoUrl] = useState('');
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  /* Company sources */
  const [sources, setSources] = useState<CompanySource[]>([]);

  /* Room categories */
  const [categories, setCategories] = useState<RoomCategory[]>([]);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editCatName, setEditCatName] = useState('');
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newCompanyCategory, setNewCompanyCategory] = useState<SourceCategory>('OTA');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [companyError, setCompanyError] = useState<string | null>(null);

  /* POS */
  const [posEnabled, setPosEnabledState] = useState(false);
  const [posSaving, setPosSaving] = useState(false);

  /* Hot Seasons */
  const [hotSeasons, setHotSeasons] = useState<HotSeason[]>([]);
  const [newSeasonName, setNewSeasonName] = useState('');
  const [newSeasonStart, setNewSeasonStart] = useState('');
  const [newSeasonEnd, setNewSeasonEnd] = useState('');
  const [seasonError, setSeasonError] = useState<string | null>(null);

  /* load */
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [s, srcs, cats, posOn, seasons] = await Promise.all([getSettings(), getCompanySources(), getRoomCategories(), getPosEnabled(), getHotSeasons()]);
        if (!mounted) return;
        applySettings(s);
        setSources(srcs);
        setCategories(cats);
        setPosEnabledState(posOn);
        setHotSeasons(seasons);
      } catch (e) {
        if (mounted) setError(e instanceof Error ? e.message : 'Failed to load settings');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const applySettings = (s: HotelSettings) => {
    setSettings(s);
    setHotelName(s.hotel_name ?? '');
    setLegalName(s.legal_name ?? '');
    setTotalRooms(s.total_rooms ?? 22);
    setOpeningCash(Number(s.opening_cash_balance ?? 0));
    setFinancialYear(s.financial_year ?? CURRENT_YEAR);
    setAddress(s.address ?? '');
    setCity(s.city ?? '');
    setStateName(s.state_name ?? '');
    setPinCode(s.pin_code ?? '');
    setPhone(s.phone ?? '');
    setWhatsapp(s.whatsapp_number ?? '');
    setEmail(s.email ?? '');
    setWebsite(s.website ?? '');
    setGst(s.gst_number ?? '');
    setPan(s.pan_number ?? '');
    setHotelReg(s.hotel_reg_number ?? '');
    setCin(s.cin_number ?? '');
    setGstRegistered(s.gst_registered ?? false);
    setGstMode(s.gst_mode ?? 'Exclusive');
    setDefaultGstType((s.gst_registered ? (s.gst_mode ?? 'Exclusive') : 'No Scope') as GstType);
    setDefaultGstSlab(s.default_gst_slab ?? 0);
    setManagerName(s.manager_name ?? '');
    setManagerMobile(s.manager_mobile ?? '');
    setAdminName(s.admin_name ?? '');
    setBankName(s.bank_name ?? '');
    setAccountName(s.account_name ?? '');
    setAccountNumber(s.account_number ?? '');
    setIfsc(s.ifsc_code ?? '');
    setLogoUrl(s.logo_url ?? '');
  };

  /* save */
  const handleSave = async () => {
    if (!settings) return;
    setError(null);
    setSavedOk(false);
    setSaving(true);
    try {
      const updated = await updateSettings({
        hotel_name: hotelName.trim() || settings.hotel_name,
        legal_name: legalName.trim(),
        total_rooms: Math.max(1, totalRooms),
        opening_cash_balance: Math.max(0, openingCash),
        financial_year: financialYear,
        logo_url: logoUrl,
        address: address.trim(),
        city: city.trim(),
        state_name: stateName.trim(),
        pin_code: pinCode.trim(),
        phone: phone.trim(),
        whatsapp_number: whatsapp.trim(),
        email: email.trim(),
        website: website.trim(),
        gst_number: gst.trim(),
        pan_number: pan.trim(),
        hotel_reg_number: hotelReg.trim(),
        cin_number: cin.trim(),
        gst_registered: gstRegistered,
        gst_mode: gstMode,
        default_gst_slab: gstRegistered ? defaultGstSlab : 0,
        manager_name: managerName.trim(),
        manager_mobile: managerMobile.trim(),
        admin_name: adminName.trim(),
        bank_name: bankName.trim(),
        account_name: accountName.trim(),
        account_number: accountNumber.trim(),
        ifsc_code: ifsc.trim(),
      });
      applySettings(updated);
      setSavedOk(true);
      setUnlocked(false);
      setTimeout(() => setSavedOk(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  /* logo upload */
  const handleLogoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { setLogoError('File must be under 2 MB.'); return; }
    setLogoError(null);
    setLogoUploading(true);
    try {
      const url = await uploadHotelLogo(file);
      setLogoUrl(url);
    } catch (err) {
      setLogoError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setLogoUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleRemoveLogo = () => {
    setLogoUrl('');
  };

  /* company helpers */
  const handleAddCompany = async () => {
    setCompanyError(null);
    const name = newCompanyName.trim();
    if (!name) { setCompanyError('Enter a company name.'); return; }
    try {
      const added = await upsertCompanySource(name, newCompanyCategory);
      setSources((prev) => {
        const idx = prev.findIndex((s) => s.id === added.id);
        if (idx >= 0) { const next = [...prev]; next[idx] = added; return next; }
        return [...prev, added].sort((a, b) => a.name.localeCompare(b.name));
      });
      setNewCompanyName('');
    } catch (e) {
      setCompanyError(e instanceof Error ? e.message : 'Failed to add');
    }
  };

  const handleUpdateCategory = async (id: string, category: SourceCategory) => {
    const src = sources.find((s) => s.id === id);
    if (!src) return;
    try {
      const updated = await upsertCompanySource(src.name, category);
      setSources((prev) => prev.map((s) => (s.id === id ? updated : s)));
    } catch (e) {
      setCompanyError(e instanceof Error ? e.message : 'Failed to update');
    }
  };

  const handleStartEdit = (s: CompanySource) => {
    setEditingId(s.id);
    setEditName(s.name);
  };

  const handleSaveEdit = async (id: string, currentCategory: SourceCategory) => {
    const name = editName.trim();
    if (!name) return;
    try {
      const updated = await upsertCompanySource(name, currentCategory, id);
      setSources((prev) => prev.map((s) => (s.id === id ? updated : s)));
      setEditingId(null);
    } catch (e) {
      setCompanyError(e instanceof Error ? e.message : 'Failed to rename');
    }
  };

  const handleDeleteCompany = async (id: string) => {
    if (!confirm('Delete this booking source?\n\nExisting room chart entries keep their saved category — no data is lost.')) return;
    try {
      await deleteCompanySource(id);
      setSources((prev) => prev.filter((s) => s.id !== id));
    } catch (e) {
      setCompanyError(e instanceof Error ? e.message : 'Failed to delete');
    }
  };

  /* hot season helpers */
  const handleAddSeason = async () => {
    setSeasonError(null);
    if (!newSeasonName.trim() || !newSeasonStart || !newSeasonEnd) {
      setSeasonError('Please fill all fields.'); return;
    }
    if (newSeasonStart > newSeasonEnd) {
      setSeasonError('Start date must be before end date.'); return;
    }
    try {
      const added = await addHotSeason(newSeasonName.trim(), newSeasonStart, newSeasonEnd);
      setHotSeasons((p) => [...p, added].sort((a,b) => a.start_date.localeCompare(b.start_date)));
      setNewSeasonName(''); setNewSeasonStart(''); setNewSeasonEnd('');
    } catch (e) {
      setSeasonError(e instanceof Error ? e.message : 'Failed to add hot season');
    }
  };
  const handleDeleteSeason = async (id: string) => {
    if (!confirm('Delete this Hot Season?')) return;
    try {
      await deleteHotSeason(id);
      setHotSeasons((p) => p.filter((s) => s.id !== id));
    } catch (e) {
      setSeasonError(e instanceof Error ? e.message : 'Failed to delete');
    }
  };

  /* room category helpers */
  const handleAddCategory = async () => {
    setCategoryError(null);
    const name = newCategoryName.trim();
    if (!name) { setCategoryError('Enter a category name.'); return; }
    try {
      const added = await upsertRoomCategory(name);
      setCategories((prev) => [...prev, added]);
      setNewCategoryName('');
    } catch (e) {
      setCategoryError(e instanceof Error ? e.message : 'Failed to add category');
    }
  };
  const handleRenameCategory = async (id: string) => {
    const name = editCatName.trim();
    if (!name) return;
    try {
      const updated = await upsertRoomCategory(name, id);
      setCategories((prev) => prev.map((c) => (c.id === id ? updated : c)));
      setEditingCatId(null);
    } catch (e) {
      setCategoryError(e instanceof Error ? e.message : 'Failed to rename');
    }
  };
  const handleDeleteCategory = async (id: string) => {
    if (!confirm('Delete this room category?\n\nExisting bookings keep their saved category — no data is lost.')) return;
    try {
      await deleteRoomCategory(id);
      setCategories((prev) => prev.filter((c) => c.id !== id));
    } catch (e) {
      setCategoryError(e instanceof Error ? e.message : 'Failed to delete');
    }
  };
  const handleMoveCategory = async (id: string, dir: -1 | 1) => {
    const idx = categories.findIndex((c) => c.id === id);
    if (idx < 0) return;
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= categories.length) return;
    const reordered = [...categories];
    [reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]];
    setCategories(reordered);
    try {
      await reorderRoomCategories(reordered.map((c) => c.id));
    } catch (e) {
      setCategoryError(e instanceof Error ? e.message : 'Failed to reorder');
      setCategories(categories);
    }
  };

  /* PDF header preview */
  const fullAddress = [address, city, stateName, pinCode].filter(Boolean).join(', ');

  /* ── render ── */
  return (
    <div className="min-h-screen bg-slate-50 pb-28">
      {/* header */}
      <header className="sticky top-0 z-10 bg-sky-800 text-white px-4 py-3 flex items-center gap-3 shadow-md">
        <button onClick={onBack} className="p-1.5 -ml-1.5 hover:bg-sky-700 rounded-lg transition">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-base font-bold leading-tight">Hotel Configuration</h1>
          <p className="text-sky-300 text-xs">Settings · Reports · Branding</p>
        </div>
      </header>

      <main className="px-4 py-4 space-y-4 w-full">
        {/* global banners */}
        {savedOk && (
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-xl p-3">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            Settings saved successfully.
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-3">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {loading ? (
          <div className="bg-white rounded-2xl border p-8 text-center text-slate-400 text-sm animate-pulse">
            Loading settings…
          </div>
        ) : (
          <>
            {/* ── 1. HOTEL BASIC DETAILS ── */}
            <SectionCard title="Hotel Details" icon={<Building2 className="w-4 h-4" />}>
              {/* lock banner */}
              {!unlocked ? (
                <button
                  onClick={() => setUnlocked(true)}
                  className="w-full flex items-center justify-center gap-2 bg-amber-50 border border-amber-300 text-amber-700 font-semibold py-2.5 rounded-xl text-sm hover:bg-amber-100 transition"
                >
                  <Lock className="w-4 h-4" /> Unlock Hotel Name & Total Rooms
                </button>
              ) : (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
                  Hotel Name and Total Rooms are now editable. These affect all reports — edit carefully.
                </div>
              )}

              <Field>
                <Label>Hotel Name</Label>
                {unlocked ? (
                  <input className={input} value={hotelName} onChange={(e) => setHotelName(e.target.value)} />
                ) : (
                  <div className={inputDisabled}>{hotelName}</div>
                )}
              </Field>

              <Field>
                <Label>Legal / Company Name</Label>
                <input className={input} value={legalName} onChange={(e) => setLegalName(e.target.value)}
                  placeholder="As on registration documents" />
              </Field>

              <Field>
                <Label>Total Rooms</Label>
                {unlocked ? (
                  <input className={input} type="number" min={1} value={totalRooms}
                    onChange={(e) => setTotalRooms(Math.max(1, parseInt(e.target.value || '1', 10)))} />
                ) : (
                  <div className={inputDisabled}>{totalRooms}</div>
                )}
              </Field>

              <Field>
                <Label>Opening Cash Balance (Rs.)</Label>
                <input className={input} type="number" min={0} step="0.01" value={openingCash}
                  onChange={(e) => setOpeningCash(Math.max(0, parseFloat(e.target.value || '0')))} />
                <p className="text-xs text-slate-400">Used as opening balance for each month's cash closing calculation.</p>
              </Field>

              <Field>
                <Label>Financial Year</Label>
                <input className={input} type="number" value={financialYear}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (!isNaN(v)) setFinancialYear(v);
                  }} />
                <p className="text-xs text-slate-400">e.g. 2026 means the FY Apr 2026 – Mar 2027.</p>
              </Field>
            </SectionCard>

            {/* ── 2. HOTEL LOGO ── */}
            <SectionCard title="Hotel Logo" icon={<Upload className="w-4 h-4" />}>
              <div className="flex items-start gap-4">
                {/* preview */}
                <div className="flex-shrink-0 w-20 h-20 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 flex items-center justify-center overflow-hidden">
                  {logoUrl ? (
                    <img src={logoUrl} alt="Logo" className="w-full h-full object-contain" />
                  ) : (
                    <Building2 className="w-8 h-8 text-slate-300" />
                  )}
                </div>
                <div className="flex-1 space-y-2">
                  <p className="text-xs text-slate-500">PNG, JPEG or WEBP · max 2 MB · Aspect ratio preserved in PDFs.</p>
                  {logoError && <p className="text-xs text-red-600">{logoError}</p>}
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoFile} />
                  <button
                    onClick={() => fileRef.current?.click()}
                    disabled={logoUploading}
                    className="flex items-center gap-1.5 text-sm font-semibold text-sky-700 border border-sky-300 bg-sky-50 px-3 py-2 rounded-lg hover:bg-sky-100 disabled:opacity-60 transition"
                  >
                    <Upload className="w-4 h-4" />
                    {logoUploading ? 'Uploading…' : logoUrl ? 'Change Logo' : 'Upload Logo'}
                  </button>
                  {logoUrl && (
                    <button onClick={handleRemoveLogo}
                      className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 transition">
                      <X className="w-3.5 h-3.5" /> Remove logo
                    </button>
                  )}
                </div>
              </div>
            </SectionCard>

            {/* ── 3. CONTACT DETAILS ── */}
            <SectionCard title="Contact & Branding" icon={<MapPin className="w-4 h-4" />}>
              <Field>
                <Label>Full Address</Label>
                <textarea className={`${input} resize-none`} rows={2} value={address}
                  onChange={(e) => setAddress(e.target.value)} placeholder="Street / Area" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field>
                  <Label>City</Label>
                  <input className={input} value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" />
                </Field>
                <Field>
                  <Label>State</Label>
                  <input className={input} value={stateName} onChange={(e) => setStateName(e.target.value)} placeholder="State" />
                </Field>
              </div>
              <Field>
                <Label>PIN Code</Label>
                <input className={input} value={pinCode} onChange={(e) => setPinCode(e.target.value)}
                  placeholder="6-digit PIN" maxLength={6} inputMode="numeric" />
              </Field>
              <Field>
                <Label><Phone className="w-3 h-3 inline mr-1" />Phone</Label>
                <input className={input} value={phone} onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 98765 43210" inputMode="tel" />
              </Field>
              <Field>
                <Label>WhatsApp Number</Label>
                <input className={input} value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)}
                  placeholder="+91 98765 43210" inputMode="tel" />
              </Field>
              <Field>
                <Label><Mail className="w-3 h-3 inline mr-1" />Email</Label>
                <input className={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="hotel@example.com" />
              </Field>
              <Field>
                <Label><Globe className="w-3 h-3 inline mr-1" />Website</Label>
                <input className={input} value={website} onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://www.hotelname.com" />
              </Field>
            </SectionCard>

            {/* ── 4. TAX & BUSINESS ── */}
            <SectionCard title="Tax & Business Details" icon={<FileText className="w-4 h-4" />}>
              <p className="text-xs text-slate-400">All fields optional. These do not appear on daily MIS reports.</p>
              <Field>
                <Label>GST Number</Label>
                <input className={input} value={gst} onChange={(e) => setGst(e.target.value.toUpperCase())}
                  placeholder="22AAAAA0000A1Z5" maxLength={15} />
              </Field>
              <Field>
                <Label>PAN Number</Label>
                <input className={input} value={pan} onChange={(e) => setPan(e.target.value.toUpperCase())}
                  placeholder="AAAAA0000A" maxLength={10} />
              </Field>
              <Field>
                <Label>Hotel Registration Number</Label>
                <input className={input} value={hotelReg} onChange={(e) => setHotelReg(e.target.value)}
                  placeholder="Reg. / Licence number" />
              </Field>
              <Field>
                <Label>CIN / Business Reg. Number</Label>
                <input className={input} value={cin} onChange={(e) => setCin(e.target.value)}
                  placeholder="Optional" />
              </Field>
            </SectionCard>

            {/* ── 4b. GST MODULE ── */}
            <SectionCard title="GST Configuration" icon={<FileText className="w-4 h-4" />}>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={gstRegistered}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setGstRegistered(checked);
                    if (!checked) {
                      setDefaultGstType('No Scope');
                      setDefaultGstSlab(0);
                      setGstMode('Exclusive');
                    } else {
                      setDefaultGstType('Exclusive');
                    }
                  }}
                  className="w-4 h-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500" />
                GST Registered
              </label>
              {gstRegistered && (
                <>
                  <Field>
                    <Label>GSTIN</Label>
                    <input className={input} value={gst} onChange={(e) => setGst(e.target.value.toUpperCase())}
                      placeholder="22AAAAA0000A1Z5" maxLength={15} />
                  </Field>
                  <Field>
                    <Label>Default GST Type</Label>
                    <select className={input} value={defaultGstType}
                      onChange={(e) => {
                        const t = e.target.value as GstType;
                        setDefaultGstType(t);
                        if (t === 'No Scope') {
                          setDefaultGstSlab(0);
                          setGstMode('Exclusive');
                        } else {
                          setGstMode(t as GstMode);
                        }
                      }}>
                      {GST_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </Field>
                  <Field>
                    <Label>Default GST Rate</Label>
                    <select className={input} value={String(defaultGstSlab)}
                      onChange={(e) => setDefaultGstSlab(Number(e.target.value) as GstSlab)}
                      disabled={defaultGstType === 'No Scope'}>
                      {GST_SLABS.map((s) => <option key={s} value={String(s)}>{s}%</option>)}
                    </select>
                    <p className="text-xs text-slate-400">Used as the default for new bookings. Can be overridden per booking.</p>
                  </Field>
                </>
              )}
              {!gstRegistered && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mt-2">
                  <p className="text-xs text-amber-700">
                    GST is not registered. All new bookings will default to <strong>No Scope</strong> with GST rate <strong>0%</strong>.
                    Enable GST registration to activate GST calculation on bookings and generate monthly GST reports.
                  </p>
                </div>
              )}
            </SectionCard>

            {/* ── 5. MANAGER / ADMIN ── */}
            <SectionCard title="Manager & Admin Details" icon={<User className="w-4 h-4" />}>
              <p className="text-xs text-slate-400">Optional — for internal reference only.</p>
              <Field>
                <Label>Manager Name</Label>
                <input className={input} value={managerName} onChange={(e) => setManagerName(e.target.value)}
                  placeholder="Full name" />
              </Field>
              <Field>
                <Label>Manager Mobile</Label>
                <input className={input} value={managerMobile} onChange={(e) => setManagerMobile(e.target.value)}
                  placeholder="+91 ..." inputMode="tel" />
              </Field>
              <Field>
                <Label>Admin / Owner Name</Label>
                <input className={input} value={adminName} onChange={(e) => setAdminName(e.target.value)}
                  placeholder="Full name" />
              </Field>
            </SectionCard>

            {/* ── 6. BANK DETAILS ── */}
            <SectionCard title="Bank Details" icon={<Landmark className="w-4 h-4" />}>
              <p className="text-xs text-slate-400">Optional — stored securely and not printed on standard reports.</p>
              <Field>
                <Label>Bank Name</Label>
                <input className={input} value={bankName} onChange={(e) => setBankName(e.target.value)}
                  placeholder="e.g. State Bank of India" />
              </Field>
              <Field>
                <Label>Account Name</Label>
                <input className={input} value={accountName} onChange={(e) => setAccountName(e.target.value)}
                  placeholder="Name on account" />
              </Field>
              <Field>
                <Label>Account Number</Label>
                <input className={input} value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)}
                  placeholder="Account number" inputMode="numeric" />
              </Field>
              <Field>
                <Label>IFSC Code</Label>
                <input className={input} value={ifsc} onChange={(e) => setIfsc(e.target.value.toUpperCase())}
                  placeholder="SBIN0001234" maxLength={11} />
              </Field>
            </SectionCard>

            {/* ── 7. COMPANY / BOOKING SOURCE ── */}
            <SectionCard title="Company / Booking Sources" icon={<Building2 className="w-4 h-4" />}>
              <p className="text-xs text-slate-500">
                Each source is classified into a category used by Daily MIS, MTD, YTD, and Company Ledger reports.
              </p>
              {companyError && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg p-2">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {companyError}
                </div>
              )}

              {/* existing sources */}
              <div className="space-y-2 max-h-72 overflow-y-auto pr-0.5">
                {sources.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl p-2.5">
                    {editingId === s.id ? (
                      <>
                        <input
                          className="flex-1 px-2 py-1.5 border border-sky-400 rounded-lg text-sm text-slate-900 bg-white focus:ring-2 focus:ring-sky-500"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit(s.id, s.source_category)}
                          autoFocus
                        />
                        <button onClick={() => handleSaveEdit(s.id, s.source_category)}
                          className="text-xs font-semibold text-sky-700 border border-sky-300 px-2 py-1.5 rounded-lg hover:bg-sky-50">Save</button>
                        <button onClick={() => setEditingId(null)}
                          className="text-xs text-slate-500 border border-slate-200 px-2 py-1.5 rounded-lg hover:bg-slate-100">Cancel</button>
                      </>
                    ) : (
                      <>
                        <span
                          className="flex-1 text-sm font-medium text-slate-800 truncate cursor-pointer hover:text-sky-700"
                          onClick={() => handleStartEdit(s)}
                          title="Click to rename"
                        >
                          {s.name}
                        </span>
                        <select
                          value={s.source_category}
                          onChange={(e) => handleUpdateCategory(s.id, e.target.value as SourceCategory)}
                          className="text-xs px-2 py-1.5 border border-slate-300 rounded-lg bg-white text-slate-700 focus:ring-2 focus:ring-sky-500"
                        >
                          {SOURCE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <button onClick={() => handleDeleteCompany(s.id)}
                          className="p-1.5 text-slate-300 hover:text-red-500 transition rounded-lg hover:bg-red-50">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                ))}
                {sources.length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-4">No booking sources yet. Add one below.</p>
                )}
              </div>

              {/* add new */}
              <div className="border-t border-slate-100 pt-3 space-y-2">
                <input
                  className={input}
                  value={newCompanyName}
                  onChange={(e) => setNewCompanyName(e.target.value)}
                  placeholder="New source (e.g. Booking.com, Walk In)"
                  onKeyDown={(e) => e.key === 'Enter' && handleAddCompany()}
                />
                <div className="flex gap-2">
                  <select
                    value={newCompanyCategory}
                    onChange={(e) => setNewCompanyCategory(e.target.value as SourceCategory)}
                    className="flex-1 text-sm px-3 py-2.5 border border-slate-300 rounded-lg bg-white text-slate-700 focus:ring-2 focus:ring-sky-500"
                  >
                    {SOURCE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <button
                    onClick={handleAddCompany}
                    className="flex items-center gap-1.5 bg-sky-700 hover:bg-sky-800 text-white font-semibold px-4 py-2 rounded-lg text-sm transition"
                  >
                    <Plus className="w-4 h-4" /> Add
                  </button>
                </div>
              </div>
            </SectionCard>

            {/* ── 7b. ROOM CATEGORIES ── */}
            <SectionCard title="Room Categories" icon={<Building2 className="w-4 h-4" />}>
              <p className="text-xs text-slate-500">
                Define room categories for your hotel. Each booking can be tagged with a category for occupancy analysis.
              </p>
              {categoryError && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg p-2">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {categoryError}
                </div>
              )}
              <div className="space-y-2">
                {categories.map((c, i) => (
                  <div key={c.id} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl p-2.5">
                    {editingCatId === c.id ? (
                      <>
                        <input
                          className="flex-1 px-2 py-1.5 border border-sky-400 rounded-lg text-sm text-slate-900 bg-white focus:ring-2 focus:ring-sky-500"
                          value={editCatName}
                          onChange={(e) => setEditCatName(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleRenameCategory(c.id)}
                          autoFocus
                        />
                        <button onClick={() => handleRenameCategory(c.id)}
                          className="text-xs font-semibold text-sky-700 border border-sky-300 px-2 py-1.5 rounded-lg hover:bg-sky-50">Save</button>
                        <button onClick={() => setEditingCatId(null)}
                          className="text-xs text-slate-500 border border-slate-200 px-2 py-1.5 rounded-lg hover:bg-slate-100">Cancel</button>
                      </>
                    ) : (
                      <>
                        <div className="flex flex-col gap-0.5">
                          <button onClick={() => handleMoveCategory(c.id, -1)} disabled={i === 0}
                            className="text-slate-300 hover:text-sky-600 disabled:opacity-30 transition">
                            <ChevronUp className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => handleMoveCategory(c.id, 1)} disabled={i === categories.length - 1}
                            className="text-slate-300 hover:text-sky-600 disabled:opacity-30 transition">
                            <ChevronDown className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <span className="flex-1 text-sm font-medium text-slate-800 truncate cursor-pointer hover:text-sky-700"
                          onClick={() => { setEditingCatId(c.id); setEditCatName(c.name); }}
                          title="Click to rename">
                          {c.name}
                        </span>
                        <button onClick={() => { setEditingCatId(c.id); setEditCatName(c.name); }}
                          className="p-1.5 text-slate-300 hover:text-sky-600 transition rounded-lg hover:bg-sky-50">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDeleteCategory(c.id)}
                          className="p-1.5 text-slate-300 hover:text-red-500 transition rounded-lg hover:bg-red-50">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                ))}
                {categories.length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-4">No room categories yet. Add one below.</p>
                )}
              </div>
              <div className="border-t border-slate-100 pt-3">
                <div className="flex gap-2">
                  <input
                    className={input}
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="New category (e.g. Dormitory)"
                    onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
                  />
                  <button
                    onClick={handleAddCategory}
                    className="flex items-center gap-1.5 bg-sky-700 hover:bg-sky-800 text-white font-semibold px-4 py-2 rounded-lg text-sm transition"
                  >
                    <Plus className="w-4 h-4" /> Add
                  </button>
                </div>
              </div>
            </SectionCard>

            {/* ── 7.5. RESTAURANT POS ── */}
            <SectionCard title="Restaurant POS" icon={<UtensilsCrossed className="w-4 h-4" />}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-700">Enable Restaurant POS</p>
                  <p className="text-xs text-slate-400 mt-0.5">When ON, a Restaurant POS section appears in the sidebar with Menu Management.</p>
                </div>
                <button
                  onClick={async () => {
                    const next = !posEnabled;
                    setPosSaving(true);
                    try {
                      await setPosEnabled(next);
                      setPosEnabledState(next);
                    } catch (e) {
                      setError(e instanceof Error ? e.message : 'Failed to toggle POS');
                    } finally {
                      setPosSaving(false);
                    }
                  }}
                  disabled={posSaving}
                  className={`relative inline-flex h-7 w-12 items-center rounded-full transition ${posEnabled ? 'bg-emerald-500' : 'bg-slate-300'} disabled:opacity-60`}
                >
                  <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${posEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
              {posEnabled && (
                <div className="mt-3 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  <p className="text-xs text-emerald-700">Restaurant POS is active. The sidebar now shows the POS section.</p>
                </div>
              )}
            </SectionCard>

            {/* ── 8. SEASON & CALENDAR ── */}
            <SectionCard title="Season & Calendar" icon={<Building2 className="w-4 h-4" />}>
              <p className="text-xs text-slate-500">
                Define Hot Seasons. All Saturdays and Sundays are automatically treated as Hot Seasons.
              </p>
              {seasonError && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg p-2">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {seasonError}
                </div>
              )}
              <div className="space-y-2">
                {hotSeasons.map((s) => (
                  <div key={s.id} className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl p-2.5">
                    <div>
                      <p className="text-sm font-bold text-slate-800">{s.name}</p>
                      <p className="text-xs text-slate-500">
                        {new Date(s.start_date).toLocaleDateString('en-IN')} — {new Date(s.end_date).toLocaleDateString('en-IN')}
                      </p>
                    </div>
                    <button onClick={() => handleDeleteSeason(s.id)}
                      className="p-1.5 text-slate-400 hover:text-red-500 transition rounded-lg hover:bg-red-50">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                {hotSeasons.length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-4">No hot seasons configured.</p>
                )}
              </div>
              <div className="border-t border-slate-100 pt-3 space-y-2">
                <input className={input} value={newSeasonName} onChange={(e) => setNewSeasonName(e.target.value)} placeholder="Season Name (e.g. Diwali Vacation)" />
                <div className="grid grid-cols-2 gap-2">
                  <Field>
                    <Label>Start Date</Label>
                    <input type="date" className={input} value={newSeasonStart} onChange={(e) => setNewSeasonStart(e.target.value)} />
                  </Field>
                  <Field>
                    <Label>End Date</Label>
                    <input type="date" className={input} value={newSeasonEnd} onChange={(e) => setNewSeasonEnd(e.target.value)} />
                  </Field>
                </div>
                <button onClick={handleAddSeason} className="w-full flex items-center justify-center gap-1.5 bg-sky-700 hover:bg-sky-800 text-white font-semibold px-4 py-2.5 rounded-lg text-sm transition">
                  <Plus className="w-4 h-4" /> Add Hot Season
                </button>
              </div>
            </SectionCard>

            {/* ── 9. PDF HEADER PREVIEW ── */}
            <SectionCard title="PDF Header Preview" icon={<Eye className="w-4 h-4" />}>
              <p className="text-xs text-slate-400 mb-2">
                This is how the header will appear on every PDF report. Save settings to apply changes.
              </p>
              <div className="rounded-xl overflow-hidden border border-slate-200 shadow-sm">
                {/* simulated navy PDF header */}
                <div className="bg-[#0d476d] text-white px-4 py-3 flex items-center gap-3">
                  {logoUrl ? (
                    <img src={logoUrl} alt="Logo" className="h-10 w-10 object-contain rounded bg-white p-0.5 flex-shrink-0" />
                  ) : (
                    <div className="h-10 w-10 rounded bg-white/20 flex items-center justify-center flex-shrink-0">
                      <Building2 className="w-5 h-5 text-white/60" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm leading-tight truncate">{hotelName || 'Hotel Name'}</p>
                    <p className="text-blue-200 text-xs truncate mt-0.5">
                      {[fullAddress, phone, email].filter(Boolean).join('  |  ') || 'Address · Phone · Email'}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-semibold text-xs text-blue-200">Daily MIS Report</p>
                    <p className="text-blue-300 text-[10px]">Date: {new Date().toLocaleDateString('en-IN')}</p>
                  </div>
                </div>
                <div className="bg-[#e6f2fa] px-4 py-2 text-xs text-[#0d476d] text-center">
                  {website || 'website will appear here'}
                </div>
              </div>
              <p className="text-xs text-slate-400 text-center mt-1">
                <CreditCard className="w-3 h-3 inline mr-1" />
                Logo + name + address + phone + email appear on all PDF reports automatically.
              </p>
            </SectionCard>
          </>
        )}
      </main>

      {/* sticky save bar */}
      {!loading && (
        <div className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur border-t border-slate-200 px-4 py-3 shadow-lg">
          <div className="w-full">
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold py-3.5 rounded-xl text-base shadow-sm transition"
            >
              <Save className="w-5 h-5" />
              {saving ? 'Saving Settings…' : 'Save All Settings'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
