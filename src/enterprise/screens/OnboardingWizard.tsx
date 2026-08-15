import { useState, useEffect } from 'react';
import { ArrowLeft, ArrowRight, Check, Building2, User, MapPin, Layers, BedDouble, CreditCard, ToggleLeft, KeyRound, Plus, Trash2, X, AlertTriangle, RotateCcw, Trash } from 'lucide-react';
import {
  checkExistingOnboarding, onboardHotelAtomically, discardOnboardingAttempt,
} from '../api';
import type { EnterpriseHotel } from '../types';
import { MODULE_KEYS, MODULE_LABELS } from '../types';
import { Card, TextInput, SelectInput, NumInput, ErrorState } from '../ui';

interface Props {
  onComplete: () => void;
  onCancel: () => void;
}

const STEPS = [
  'Hotel Details', 'Owner Details', 'Address & Contact', 'Room Categories',
  'Room Numbers', 'Subscription Plan', 'Feature Access', 'Review & Create',
];

interface CatRow { name: string; tariff: number; extraBed: number }
interface RoomRow { roomNo: string; categoryId: string; floor: string; tariff: number; extraBed: number; isActive: boolean }

interface ExistingOnboardingState {
  hotel: EnterpriseHotel | null;
  attempt: { id: string; status: string; completed_steps: string[]; failed_step: string | null; error_message: string | null } | null;
}

export const OnboardingWizard = ({ onComplete, onCancel }: Props) => {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);

  // Duplicate/resume state
  const [existingState, setExistingState] = useState<ExistingOnboardingState | null>(null);
  const [checking, setChecking] = useState(false);

  // Step 1: Hotel details
  const [hotelName, setHotelName] = useState('');
  const [propertyCode, setPropertyCode] = useState('');
  const [city, setCity] = useState('');
  const [stateName, setStateName] = useState('');
  const [totalRooms, setTotalRooms] = useState(1);

  // Step 2: Owner
  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerMobile, setOwnerMobile] = useState('');

  // Step 3: Address
  const [address, setAddress] = useState('');
  const [pincode, setPincode] = useState('');

  // Step 4: Room categories
  const [categories, setCategories] = useState<CatRow[]>([
    { name: 'Standard', tariff: 999, extraBed: 200 },
    { name: 'Deluxe', tariff: 1499, extraBed: 250 },
    { name: 'Super Deluxe', tariff: 1999, extraBed: 300 },
  ]);

  // Step 5: Room numbers
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [bulkStart, setBulkStart] = useState(101);
  const [bulkEnd, setBulkEnd] = useState(110);
  const [bulkFloor, setBulkFloor] = useState('1st');
  const [bulkCategory, setBulkCategory] = useState('');

  // Step 6: Plan
  const [planId, setPlanId] = useState('');

  // Step 7: Features
  const [features, setFeatures] = useState<Record<string, boolean>>(
    Object.fromEntries(MODULE_KEYS.map((k) => [k, true])),
  );

  // Step 8: Owner login
  const [password, setPassword] = useState('');

  const canProceed = () => {
    switch (step) {
      case 0: return !!hotelName.trim();
      case 1: return !!ownerName.trim() && !!ownerEmail.trim();
      case 2: return true;
      case 3: return categories.length > 0 && categories.every((c) => c.name.trim());
      case 4: return true;
      case 5: return true;
      case 6: return true;
      case 7: return !!password.trim() && password.length >= 6;
      default: return true;
    }
  };

  const addCategory = () => setCategories([...categories, { name: '', tariff: 0, extraBed: 0 }]);
  const removeCategory = (idx: number) => setCategories(categories.filter((_, i) => i !== idx));
  const updateCategory = (idx: number, patch: Partial<CatRow>) =>
    setCategories(categories.map((c, i) => i === idx ? { ...c, ...patch } : c));

  const addRoom = () => setRooms([...rooms, { roomNo: '', categoryId: '', floor: '', tariff: 0, extraBed: 0, isActive: true }]);
  const removeRoom = (idx: number) => setRooms(rooms.filter((_, i) => i !== idx));
  const updateRoom = (idx: number, patch: Partial<RoomRow>) =>
    setRooms(rooms.map((r, i) => i === idx ? { ...r, ...patch } : r));

  const addBulkRooms = () => {
    const existing = new Set(rooms.map((r) => r.roomNo));
    const newRooms: RoomRow[] = [];
    for (let n = bulkStart; n <= bulkEnd; n++) {
      const rn = String(n);
      if (existing.has(rn)) continue;
      const cat = categories.find((c) => c.name === bulkCategory);
      newRooms.push({
        roomNo: rn, categoryId: bulkCategory, floor: bulkFloor,
        tariff: cat?.tariff ?? 0, extraBed: cat?.extraBed ?? 0, isActive: true,
      });
    }
    setRooms([...rooms, ...newRooms]);
  };

  // ── Check for existing onboarding when entering review step ──
  const checkForExisting = async () => {
    if (!ownerEmail.trim() && !propertyCode.trim()) return;
    setChecking(true);
    try {
      const result = await checkExistingOnboarding(
        propertyCode.trim() || null,
        ownerEmail.trim(),
      );
      if (result.hotel || result.attempt) {
        setExistingState(result);
      } else {
        setExistingState(null);
      }
    } catch {
      // Non-blocking — proceed with creation
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    if (step === 7 && !existingState && !checking) {
      checkForExisting();
    }
  }, [step]);

  const handleCreate = async () => {
    setError(null);
    setSaving(true);
    try {
      const result = await onboardHotelAtomically({
        hotel_name: hotelName.trim(),
        owner_name: ownerName.trim(),
        admin_email: ownerEmail.trim(),
        mobile: ownerMobile.trim(),
        address: address.trim(),
        total_rooms: totalRooms,
        city: city.trim(),
        state: stateName.trim(),
        property_code: propertyCode.trim() || null,
        password,
        categories: categories.map(c => ({ name: c.name.trim(), tariff: c.tariff, extra_bed: c.extraBed })),
        rooms: rooms.map(r => ({
          room_no: r.roomNo,
          category_name: r.categoryId || null,
          floor: r.floor || null,
          tariff: r.tariff,
          extra_bed: r.extraBed,
          is_active: r.isActive,
        })),
        features,
      });

      if (!result.success) {
        const stepName = result.failed_step ? formatStepName(result.failed_step) : 'unknown step';
        setError(`Onboarding incomplete. Failed at: ${stepName}\n\nBackend error: ${result.error ?? 'Unknown error'}\n\nOnboarding attempt ID: ${result.attempt_id ?? 'N/A'}\n\nClick "Retry" to resume from this step — no duplicate hotel will be created.`);
        return;
      }

      setCompleted(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`Unexpected error: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = async () => {
    if (!existingState?.attempt) return;
    setSaving(true);
    try {
      if (existingState.hotel) {
        await discardOnboardingAttempt(existingState.attempt.id, existingState.hotel.id);
      }
      setExistingState(null);
      setError(null);
    } catch (e) {
      setError(`Failed to discard: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const formatStepName = (step: string): string => {
    const names: Record<string, string> = {
      hotel_record: 'Hotel Record',
      hotel_settings: 'Hotel Settings',
      room_categories: 'Room Categories',
      room_inventory: 'Room Inventory',
      owner_auth: 'Owner Auth Account',
      features: 'Feature Assignments',
      audit_log: 'Audit Log',
      activate: 'Hotel Activation',
    };
    return names[step] ?? step;
  };

  // ── Existing onboarding / duplicate warning panel ──
  const renderExistingWarning = () => {
    if (!existingState) return null;
    const { hotel, attempt } = existingState;

    const isCompleted = attempt?.status === 'completed' || (hotel && !attempt && hotel.onboarding_status === 'completed');
    const isIncomplete = attempt && attempt.status !== 'completed';

    return (
      <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 space-y-3">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-sm font-bold text-amber-900">
              {isCompleted ? 'Hotel Already Exists' : 'Incomplete Onboarding Found'}
            </h3>
            <p className="text-xs text-amber-700 mt-1">
              {isCompleted
                ? `A hotel with these details already exists: "${hotel?.hotel_name}". Use a different name, property code, or email.`
                : `A previous onboarding attempt for "${hotel?.hotel_name ?? hotelName}" failed at: ${formatStepName(attempt?.failed_step ?? 'unknown')}. ${attempt?.error_message ? `Error: ${attempt.error_message}` : ''}`
              }
            </p>
            {isIncomplete && (
              <div className="mt-2 text-xs text-amber-800">
                <span className="font-semibold">Completed steps: </span>
                {(attempt?.completed_steps ?? []).map(s => formatStepName(s)).join(', ')}
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {isIncomplete && (
            <>
              <button
                onClick={handleCreate}
                disabled={saving}
                className="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-sm font-semibold px-3 py-2 rounded-lg transition"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Retry / Resume
              </button>
              <button
                onClick={handleDiscard}
                disabled={saving}
                className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-semibold px-3 py-2 rounded-lg transition"
              >
                <Trash className="w-3.5 h-3.5" /> Discard Incomplete
              </button>
            </>
          )}
          {isCompleted && (
            <button
              onClick={onComplete}
              className="flex items-center gap-1.5 bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold px-3 py-2 rounded-lg transition"
            >
              Go to Hotel List
            </button>
          )}
        </div>
      </div>
    );
  };

  if (completed) {
    return (
      <div className="max-w-lg mx-auto py-12 text-center">
        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Check className="w-8 h-8 text-emerald-600" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">Hotel Onboarded Successfully!</h2>
        <p className="text-sm text-slate-500 mt-2">"{hotelName}" has been created with a 14-day trial, {categories.length} room categories, {rooms.length} rooms, and an owner account. The owner can sign in with their email and password.</p>
        <button onClick={onComplete} className="mt-6 bg-sky-600 hover:bg-sky-700 text-white font-semibold px-6 py-2.5 rounded-xl transition">
          Go to Hotel List
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <button onClick={onCancel} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="w-4 h-4" /> Cancel
        </button>
        <h1 className="text-lg font-bold text-slate-900">Hotel Onboarding Wizard</h1>
        <div className="w-16" />
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-1 overflow-x-auto pb-2">
        {STEPS.map((label, i) => (
          <div key={i} className="flex items-center gap-1 shrink-0">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition ${
              i === step ? 'bg-sky-600 text-white' : i < step ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'
            }`}>
              {i < step ? <Check className="w-3.5 h-3.5" /> : i + 1}
            </div>
            <span className={`text-xs font-medium hidden sm:inline ${i === step ? 'text-sky-700' : 'text-slate-400'}`}>{label}</span>
            {i < STEPS.length - 1 && <div className={`w-4 h-0.5 ${i < step ? 'bg-emerald-400' : 'bg-slate-200'}`} />}
          </div>
        ))}
      </div>

      {error && <ErrorState message={error} />}
      {step === 7 && renderExistingWarning()}
      {step === 7 && checking && <p className="text-xs text-slate-400 text-center">Checking for existing onboarding...</p>}

      {/* Step content */}
      <Card className="p-5">
        {step === 0 && (
          <div className="space-y-3">
            <h2 className="text-base font-bold text-slate-800 flex items-center gap-2"><Building2 className="w-4 h-4" /> Hotel Details</h2>
            <TextInput label="Hotel Name" value={hotelName} onChange={setHotelName} placeholder="e.g. Hotel Sunrise" />
            <div className="grid grid-cols-2 gap-3">
              <TextInput label="Property Code" value={propertyCode} onChange={setPropertyCode} placeholder="e.g. HS-001" />
              <NumInput label="Total Rooms" value={totalRooms} onChange={(v) => setTotalRooms(Math.max(1, Math.floor(v)))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <TextInput label="City" value={city} onChange={setCity} />
              <TextInput label="State" value={stateName} onChange={setStateName} />
            </div>
          </div>
        )}
        {step === 1 && (
          <div className="space-y-3">
            <h2 className="text-base font-bold text-slate-800 flex items-center gap-2"><User className="w-4 h-4" /> Owner Details</h2>
            <TextInput label="Owner Name" value={ownerName} onChange={setOwnerName} />
            <TextInput label="Owner Email" value={ownerEmail} onChange={setOwnerEmail} type="email" />
            <TextInput label="Owner Mobile" value={ownerMobile} onChange={setOwnerMobile} placeholder="+91 98765 43210" />
          </div>
        )}
        {step === 2 && (
          <div className="space-y-3">
            <h2 className="text-base font-bold text-slate-800 flex items-center gap-2"><MapPin className="w-4 h-4" /> Address & Contact</h2>
            <TextInput label="Full Address" value={address} onChange={setAddress} />
            <TextInput label="PIN Code" value={pincode} onChange={setPincode} placeholder="6-digit PIN" />
          </div>
        )}
        {step === 3 && (
          <div className="space-y-3">
            <h2 className="text-base font-bold text-slate-800 flex items-center gap-2"><Layers className="w-4 h-4" /> Room Categories</h2>
            <p className="text-sm text-slate-500">Define room categories with default tariffs and extra-bed charges. These will be created for this hotel.</p>
            <div className="space-y-2">
              {categories.map((cat, idx) => (
                <div key={idx} className="flex items-end gap-2">
                  <div className="flex-1">
                    <TextInput label={idx === 0 ? "Category Name" : ""} value={cat.name} onChange={(v) => updateCategory(idx, { name: v })} placeholder="e.g. Deluxe" />
                  </div>
                  <div className="w-24">
                    <NumInput label={idx === 0 ? "Tariff" : ""} value={cat.tariff} onChange={(v) => updateCategory(idx, { tariff: v })} />
                  </div>
                  <div className="w-24">
                    <NumInput label={idx === 0 ? "Extra Bed" : ""} value={cat.extraBed} onChange={(v) => updateCategory(idx, { extraBed: v })} />
                  </div>
                  <button onClick={() => removeCategory(idx)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg mb-0.5"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
            <button onClick={addCategory} className="flex items-center gap-1.5 text-sm text-sky-600 font-medium hover:underline"><Plus className="w-4 h-4" /> Add Category</button>
          </div>
        )}
        {step === 4 && (
          <div className="space-y-3">
            <h2 className="text-base font-bold text-slate-800 flex items-center gap-2"><BedDouble className="w-4 h-4" /> Room Numbers / Inventory</h2>
            <p className="text-sm text-slate-500">Add rooms individually or use bulk create. These rooms will appear in the hotel's Daily Entry Room Chart.</p>

            {/* Bulk create */}
            <div className="bg-slate-50 rounded-xl p-3 space-y-2">
              <p className="text-xs font-semibold text-slate-600 uppercase">Bulk Create</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <NumInput label="From" value={bulkStart} onChange={(v) => setBulkStart(Math.floor(v))} />
                <NumInput label="To" value={bulkEnd} onChange={(v) => setBulkEnd(Math.floor(v))} />
                <TextInput label="Floor" value={bulkFloor} onChange={setBulkFloor} />
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
                  <select value={bulkCategory} onChange={(e) => setBulkCategory(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500">
                    <option value="">— None —</option>
                    {categories.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
              </div>
              <button onClick={addBulkRooms} className="flex items-center gap-1.5 text-sm bg-violet-600 hover:bg-violet-700 text-white font-semibold px-3 py-2 rounded-lg transition">
                <Plus className="w-4 h-4" /> Add Rooms {bulkEnd >= bulkStart ? `(${bulkEnd - bulkStart + 1})` : ''}
              </button>
            </div>

            {/* Room list */}
            {rooms.length > 0 && (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {rooms.map((r, idx) => (
                  <div key={idx} className="flex items-end gap-2 bg-white border border-slate-200 rounded-lg p-2">
                    <div className="w-16"><TextInput label="" value={r.roomNo} onChange={(v) => updateRoom(idx, { roomNo: v })} placeholder="No." /></div>
                    <div className="flex-1">
                      <select value={r.categoryId} onChange={(e) => {
                        const cat = categories.find((c) => c.name === e.target.value);
                        updateRoom(idx, { categoryId: e.target.value, tariff: cat?.tariff ?? r.tariff, extraBed: cat?.extraBed ?? r.extraBed });
                      }}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500">
                        <option value="">— None —</option>
                        {categories.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                      </select>
                    </div>
                    <div className="w-20"><NumInput label="" value={r.tariff} onChange={(v) => updateRoom(idx, { tariff: v })} /></div>
                    <div className="w-16"><TextInput label="" value={r.floor} onChange={(v) => updateRoom(idx, { floor: v })} placeholder="Floor" /></div>
                    <button onClick={() => removeRoom(idx)} className="p-2 text-slate-400 hover:text-red-600"><X className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
            )}
            {rooms.length === 0 && <p className="text-sm text-slate-400 text-center py-2">No rooms added yet. Use bulk create above or add individually.</p>}
            <button onClick={addRoom} className="flex items-center gap-1.5 text-sm text-sky-600 font-medium hover:underline"><Plus className="w-4 h-4" /> Add Single Room</button>
          </div>
        )}
        {step === 5 && (
          <div className="space-y-3">
            <h2 className="text-base font-bold text-slate-800 flex items-center gap-2"><CreditCard className="w-4 h-4" /> Subscription Plan</h2>
            <p className="text-sm text-slate-500">The hotel will start with a 14-day trial. You can change the plan after activation.</p>
            <SelectInput label="Select Plan" value={planId} onChange={setPlanId}
              options={[{ value: '', label: 'Trial (14 days)' }, { value: 'starter', label: 'Starter' }, { value: 'professional', label: 'Professional' }, { value: 'enterprise', label: 'Enterprise' }]} />
          </div>
        )}
        {step === 6 && (
          <div className="space-y-3">
            <h2 className="text-base font-bold text-slate-800 flex items-center gap-2"><ToggleLeft className="w-4 h-4" /> Feature Access</h2>
            <p className="text-sm text-slate-500">Enable or disable modules for this hotel. You can change these later in Feature Controls.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {MODULE_KEYS.map((key) => (
                <label key={key} className="flex items-center gap-2 p-2 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50">
                  <input type="checkbox" checked={features[key] ?? true} onChange={(e) => setFeatures({ ...features, [key]: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500" />
                  <span className="text-sm text-slate-700">{MODULE_LABELS[key]}</span>
                </label>
              ))}
            </div>
          </div>
        )}
        {step === 7 && (
          <div className="space-y-3">
            <h2 className="text-base font-bold text-slate-800 flex items-center gap-2"><KeyRound className="w-4 h-4" /> Create Owner Login</h2>
            <p className="text-sm text-slate-500">Set a temporary password for the owner. They can change it after first login.</p>
            <TextInput label="Temporary Password" value={password} onChange={setPassword} type="password" placeholder="Min 6 characters" />
          </div>
        )}
      </Card>

      {/* Review summary on last step */}
      {step === 7 && (
        <Card className="p-4 bg-slate-50">
          <h3 className="text-sm font-bold text-slate-700 mb-2">Review Summary</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div><span className="text-slate-500">Hotel:</span> <span className="font-semibold">{hotelName}</span></div>
            <div><span className="text-slate-500">Owner:</span> <span className="font-semibold">{ownerName}</span></div>
            <div><span className="text-slate-500">Email:</span> <span className="font-semibold">{ownerEmail}</span></div>
            <div><span className="text-slate-500">City:</span> <span className="font-semibold">{city || '—'}</span></div>
            <div><span className="text-slate-500">Rooms:</span> <span className="font-semibold">{totalRooms}</span></div>
            <div><span className="text-slate-500">Categories:</span> <span className="font-semibold">{categories.length}</span></div>
            <div><span className="text-slate-500">Room Inventory:</span> <span className="font-semibold">{rooms.length} rooms</span></div>
            <div><span className="text-slate-500">Plan:</span> <span className="font-semibold">Trial (14 days)</span></div>
          </div>
        </Card>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button onClick={() => step > 0 ? setStep(step - 1) : onCancel()}
          className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 font-medium">
          <ArrowLeft className="w-4 h-4" /> {step === 0 ? 'Cancel' : 'Back'}
        </button>
        {step < STEPS.length - 1 ? (
          <button onClick={() => canProceed() && setStep(step + 1)} disabled={!canProceed()}
            className="flex items-center gap-1.5 bg-sky-600 hover:bg-sky-700 disabled:opacity-40 text-white font-semibold px-5 py-2.5 rounded-xl transition text-sm">
            Next <ArrowRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={handleCreate}
            disabled={saving || (!!existingState && existingState.attempt?.status === 'completed')}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold px-6 py-2.5 rounded-xl transition text-sm"
          >
            <Check className="w-4 h-4" /> {saving ? 'Creating…' : existingState?.attempt ? 'Retry Onboarding' : 'Create Hotel'}
          </button>
        )}
      </div>
    </div>
  );
};
