import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Save } from 'lucide-react';
import type { DailyReport, DailyReportInput, HotelSettings } from '@/lib/types';
import { getReport, getSettings, saveReport, getPrevCashClosing } from '@/lib/api';
import { calcArr, calcOcc, calcTotalRevenue, calcTotalExpenses, calcCashClosing, fmtMoney, toNum } from '@/lib/calc';
import { NumberField, SectionCard } from '@/components/FormFields';

interface EntryFormProps {
  date: string;
  onBack: () => void;
  onSaved: (savedDate?: string) => void;
}

export const EntryForm = ({ date: initialDate, onBack, onSaved }: EntryFormProps) => {
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [settings, setSettings] = useState<HotelSettings | null>(null);
  const [report, setReport] = useState<DailyReportInput | null>(null);
  const [existing, setExisting] = useState<DailyReport | null>(null);
  const [prevClosing, setPrevClosing] = useState<number>(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [duplicateDate, setDuplicateDate] = useState<string | null>(null);

  const loadReport = async (d: string, s: HotelSettings) => {
    const r = await getReport(d);
    if (r) {
      setExisting(r);
      const { id: _id, hotel_id: _h, cash_closing: _c, ...rest } = r;
      void _id; void _h; void _c;
      setReport(rest);
    } else {
      setExisting(null);
      setReport({
        report_date: d, rooms_occupied: 0, complimentary_room: 0, room_sale_amount: 0,
        ota: 0, direct_walking: 0, corporate_agent: 0, phonebook: 0,
        kitchen: 0, other_income: 0, housekeeping_supply: 0, other_expense: 0,
        cash: 0, bank: 0, salary_advance: 0, maintenance_bill: 0,
        cash_handover_md: 0, bank_cash_deposit: 0,
        departure: 0, expected_arrival: 0, expected_arr: 0,
      });
    }
    const pc = await getPrevCashClosing(d, s.opening_cash_balance);
    setPrevClosing(pc);
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const s = await getSettings();
        if (!mounted) return;
        setSettings(s);
        await loadReport(initialDate, s);
      } catch (e) {
        if (mounted) setError(e instanceof Error ? e.message : 'Failed to load');
      }
    })();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDateChange = async (newDate: string) => {
    if (!settings || !newDate) return;
    setError(null);
    setValidationError(null);
    try {
      const r = await getReport(newDate);
      if (r) {
        setDuplicateDate(newDate);
        return;
      }
      setSelectedDate(newDate);
      await loadReport(newDate, settings);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    }
  };

  const confirmEditExisting = async () => {
    if (!settings || !duplicateDate) return;
    setSelectedDate(duplicateDate);
    setDuplicateDate(null);
    try {
      await loadReport(duplicateDate, settings);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    }
  };

  const cancelDuplicate = () => {
    setDuplicateDate(null);
  };

  const totalRooms = settings?.total_rooms ?? 22;
  const openingBalance = settings?.opening_cash_balance ?? 0;

  const set = <K extends keyof DailyReportInput>(key: K, v: number) => {
    setReport((prev) => prev ? { ...prev, [key]: v } : prev);
  };

  const live = useMemo(() => {
    if (!report) return null;
    const arr = calcArr(report.room_sale_amount, report.rooms_occupied);
    const occ = calcOcc(report.rooms_occupied, totalRooms);
    const totalRev = calcTotalRevenue(report);
    const totalExp = calcTotalExpenses(report);
    // Live cash closing uses 0 as prev for preview; actual uses DB prev on save.
    const cashPreview = calcCashClosing(prevClosing, report);
    return { arr, occ, totalRev, totalExp, cashPreview };
  }, [report, totalRooms, prevClosing]);

  const handleSave = async () => {
    if (!report) return;
    setError(null);
    setValidationError(null);
    if (report.rooms_occupied > totalRooms) {
      setValidationError(`Rooms Occupied cannot be greater than Total Rooms (${totalRooms}).`);
      return;
    }
    if (report.complimentary_room > totalRooms) {
      setValidationError(`Complimentary Room cannot be greater than Total Rooms (${totalRooms}).`);
      return;
    }
    try {
      setSaving(true);
      await saveReport({ ...report, report_date: selectedDate }, openingBalance);
      onSaved(selectedDate);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (!report) {
    return <div className="p-6 text-center text-slate-400 text-sm">Loading form…</div>;
  }

  const [y, m, d] = selectedDate.split('-');
  const displayDate = `${d}/${m}/${y}`;

  return (
    <div className="min-h-screen bg-slate-50 pb-28">
      <header className="sticky top-0 z-10 bg-sky-800 text-white px-4 py-3 flex items-center gap-3 shadow">
        <button onClick={onBack} className="p-1.5 -ml-1.5 hover:bg-sky-700 rounded-lg">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-base font-semibold leading-tight">Daily Report Entry</h1>
          <p className="text-sky-200 text-xs">{displayDate}</p>
        </div>
        {existing && (
          <span className="ml-auto text-xs bg-sky-600 px-2 py-1 rounded-full">Editing</span>
        )}
      </header>

      <main className="px-4 py-4 space-y-4 w-full">
        {duplicateDate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5">
              <h3 className="text-base font-semibold text-slate-900 mb-1">Report already exists</h3>
              <p className="text-sm text-slate-600 mb-4">
                A report already exists for {duplicateDate.split('-').reverse().join('/')}. Would you like to edit it, or cancel?
              </p>
              <div className="flex flex-col gap-2">
                <button onClick={confirmEditExisting}
                  className="w-full bg-sky-700 hover:bg-sky-800 text-white font-semibold py-2.5 rounded-lg">
                  Edit Existing Report
                </button>
                <button onClick={cancelDuplicate}
                  className="w-full bg-white border border-slate-300 text-slate-700 font-semibold py-2.5 rounded-lg">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>}
        {validationError && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg p-3">{validationError}</div>
        )}

        <SectionCard title="Date">
          <label className="block">
            <span className="block text-sm font-medium text-slate-700 mb-1">Report Date</span>
            <input
              type="date"
              value={selectedDate}
              max={initialDate}
              onChange={(e) => handleDateChange(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg bg-white text-slate-900 text-base focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
            />
            <span className="block text-xs text-slate-400 mt-1">Defaults to today. Change to enter a previous day's report.</span>
          </label>
        </SectionCard>

        <SectionCard title="Room Occupancy" accent="bg-sky-50">
          <NumberField label="Rooms Occupied" value={report.rooms_occupied} allowDecimal={false} max={totalRooms}
            onChange={(v) => set('rooms_occupied', v)} suffix={`/ ${totalRooms}`} />
          <NumberField label="Complimentary Room" value={report.complimentary_room} allowDecimal={false} max={totalRooms}
            onChange={(v) => set('complimentary_room', v)} />
        </SectionCard>

        <SectionCard title="Room Revenue" accent="bg-emerald-50">
          <NumberField label="Room Sale Amount" value={report.room_sale_amount} prefix="₹"
            onChange={(v) => set('room_sale_amount', v)} />
        </SectionCard>

        <SectionCard title="Room Revenue Details" accent="bg-emerald-50">
          <NumberField label="OTA" value={report.ota} prefix="₹" onChange={(v) => set('ota', v)} />
          <NumberField label="Direct/Walking" value={report.direct_walking} prefix="₹" onChange={(v) => set('direct_walking', v)} />
          <NumberField label="Corporate/Agent" value={report.corporate_agent} prefix="₹" onChange={(v) => set('corporate_agent', v)} />
          <NumberField label="Phonebook" value={report.phonebook} prefix="₹" onChange={(v) => set('phonebook', v)} />
        </SectionCard>

        <SectionCard title="Other Revenue" accent="bg-amber-50">
          <NumberField label="Kitchen" value={report.kitchen} prefix="₹" onChange={(v) => set('kitchen', v)} />
          <NumberField label="Other" value={report.other_income} prefix="₹" onChange={(v) => set('other_income', v)} />
        </SectionCard>

        <SectionCard title="Expenses" accent="bg-rose-50">
          <NumberField label="Housekeeping Supply" value={report.housekeeping_supply} prefix="₹" onChange={(v) => set('housekeeping_supply', v)} />
          <NumberField label="Other" value={report.other_expense} prefix="₹" onChange={(v) => set('other_expense', v)} />
        </SectionCard>

        <SectionCard title="Cash Summary" accent="bg-slate-100">
          <NumberField label="Cash" value={report.cash} prefix="₹" onChange={(v) => set('cash', v)} />
          <NumberField label="Bank" value={report.bank} prefix="₹" onChange={(v) => set('bank', v)} />
          <NumberField label="Salary Advance" value={report.salary_advance} prefix="₹" onChange={(v) => set('salary_advance', v)} />
          <NumberField label="Maintenance Bill Total AMT" value={report.maintenance_bill} prefix="₹" onChange={(v) => set('maintenance_bill', v)} />
          <NumberField label="Cash Handover MD Sir" value={report.cash_handover_md} prefix="₹" onChange={(v) => set('cash_handover_md', v)} />
          <NumberField label="Bank Cash Deposit" value={report.bank_cash_deposit} prefix="₹" onChange={(v) => set('bank_cash_deposit', v)} />
        </SectionCard>

        <SectionCard title="Tomorrow Status" accent="bg-violet-50">
          <NumberField label="Departure" value={report.departure} allowDecimal={false} onChange={(v) => set('departure', v)} />
          <NumberField label="Expected Arrival" value={report.expected_arrival} allowDecimal={false} onChange={(v) => set('expected_arrival', v)} />
          <NumberField label="Expected ARR" value={report.expected_arr} prefix="₹" onChange={(v) => set('expected_arr', v)} />
        </SectionCard>

        {/* Live preview */}
        <div className="bg-slate-900 text-white rounded-xl p-4 space-y-1.5">
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-2">Live Preview</p>
          <PreviewRow label="ARR" value={`₹${fmtMoney(live?.arr ?? 0)}`} />
          <PreviewRow label="OCC %" value={`${(live?.occ ?? 0).toFixed(0)}%`} />
          <PreviewRow label="Total Revenue" value={`₹${fmtMoney(live?.totalRev ?? 0)}`} />
          <PreviewRow label="Total Expenses" value={`₹${fmtMoney(live?.totalExp ?? 0)}`} />
          <div className="border-t border-slate-700 mt-1 pt-1.5">
            <PreviewRow label="Cash Closing" value={`₹${fmtMoney(live?.cashPreview ?? 0)}`} strong />
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Uses previous day's closing of ₹{fmtMoney(prevClosing)} as opening.
          </p>
        </div>
      </main>

      {/* Sticky save bar */}
      <div className="fixed bottom-0 inset-x-0 w-full bg-white border-t border-slate-200 p-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full flex items-center justify-center gap-2 bg-sky-700 hover:bg-sky-800 disabled:opacity-60 text-white font-semibold py-3.5 rounded-xl shadow-sm transition"
        >
          <Save className="w-5 h-5" /> {saving ? 'Saving…' : 'Save Daily Report'}
        </button>
      </div>
    </div>
  );
};

const PreviewRow = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
  <div className="flex items-baseline justify-between">
    <span className="text-sm text-slate-300">{label}</span>
    <span className={`tabular-nums ${strong ? 'text-base font-bold text-white' : 'text-sm font-semibold text-slate-100'}`}>
      {value}
    </span>
  </div>
);
