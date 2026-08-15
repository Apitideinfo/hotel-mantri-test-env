import { useEffect, useState, useMemo } from 'react';
import { ArrowLeft, FileText, BedDouble, CalendarRange, TrendingUp, Building2 } from 'lucide-react';
import type { HotelSettings, SourceCategory, DerivedReport, RoomChartEntry, CompanySource } from '@/lib/types';
import {
  getSettings, getDerivedReport, getDerivedReportsForMonth, getDerivedReportsForYear,
  getRoomChart, getCompanySources, getCompanyLedger,
} from '@/lib/api';
import {
  getExpenseEntriesForDate, getRevenueEntriesForDate,
} from '@/lib/api-finance';
import {
  buildDailyMISPDF, buildRoomChartPDF, buildMTDPDF, buildYTDPDF, buildCompanyLedgerPDF,
  dailyMISFilename, roomChartFilename, mtdFilename, ytdFilename, ledgerFilename,
} from '@/lib/pdf';
import { aggregateDerived } from '@/lib/calc';
import { PdfButtons } from '@/components/PdfButtons';

type ReportType = 'daily' | 'roomchart' | 'mtd' | 'ytd' | 'ledger';

interface PdfScreenProps {
  initialDate: string;
  onBack: () => void;
}

const MONTHS = ['January','February','March','April','May','June',
  'July','August','September','October','November','December'];
const YEARS = [2024, 2025, 2026, 2027, 2028];

export const PdfScreen = ({ initialDate, onBack }: PdfScreenProps) => {
  const d = new Date(initialDate + 'T00:00:00');
  const [settings, setSettings] = useState<HotelSettings | null>(null);
  const [reportType, setReportType] = useState<ReportType>('daily');

  // Date / period selectors
  const [date, setDate] = useState(initialDate);
  const [year, setYear] = useState(d.getFullYear());
  const [month, setMonth] = useState(d.getMonth() + 1);

  // Ledger selectors
  const [companies, setCompanies] = useState<CompanySource[]>([]);
  const [selectedCompany, setSelectedCompany] = useState('');
  const [ledgerFrom, setLedgerFrom] = useState(`${d.getFullYear()}-01-01`);
  const [ledgerTo, setLedgerTo] = useState(initialDate);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const s = await getSettings();
        if (!mounted) return;
        setSettings(s);
        const srcs = await getCompanySources();
        if (mounted) {
          setCompanies(srcs);
          if (srcs.length > 0) setSelectedCompany(srcs[0].name);
        }
      } catch (e) {
        if (mounted) setError(e instanceof Error ? e.message : 'Failed to load settings');
      }
    })();
    return () => { mounted = false; };
  }, []);

  if (!settings) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-slate-400 text-sm">{error ?? 'Loading…'}</p>
      </div>
    );
  }

  // ── Build functions (called lazily by PdfButtons) ──────────────────────────
  const buildDailyMIS = async () => {
    const report = await getDerivedReport(date, settings.total_rooms, settings.opening_cash_balance);
    const d2 = new Date(date + 'T00:00:00');
    const mtdReports = await getDerivedReportsForMonth(d2.getFullYear(), d2.getMonth() + 1, settings.total_rooms, settings.opening_cash_balance);
    const mtdAgg = aggregateDerived(mtdReports, settings.total_rooms, new Date(d2.getFullYear(), d2.getMonth() + 1, 0).getDate());
    return buildDailyMISPDF({ settings, report, mtdRevenue: mtdAgg.totalRevenue, mtdOccupancy: mtdAgg.roomsSold });
  };

  const buildRoomChart = async () => {
    const [entries, expenses, revenues, derivedReport] = await Promise.all([
      getRoomChart(date),
      getExpenseEntriesForDate(date),
      getRevenueEntriesForDate(date),
      getDerivedReport(date, settings.total_rooms, settings.opening_cash_balance),
    ]);
    return buildRoomChartPDF({ settings, entries, date, expenses, revenues, derivedReport });
  };

  const buildMTD = async () => {
    const reports = await getDerivedReportsForMonth(year, month, settings.total_rooms, settings.opening_cash_balance);
    return buildMTDPDF({ settings, reports, year, month });
  };

  const buildYTD = async () => {
    const reports = await getDerivedReportsForYear(year, settings.total_rooms, settings.opening_cash_balance);
    return buildYTDPDF({ settings, reports, year });
  };

  const buildLedger = async () => {
    if (!selectedCompany) throw new Error('Select a company first.');
    const src = companies.find((c) => c.name === selectedCompany);
    const entries = await getCompanyLedger(selectedCompany, ledgerFrom, ledgerTo);
    return buildCompanyLedgerPDF({
      settings,
      companyName: selectedCompany,
      category: (src?.source_category ?? 'Direct/Walking') as SourceCategory,
      entries,
      fromDate: ledgerFrom,
      toDate: ledgerTo,
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-10">
      <header className="sticky top-0 z-10 bg-sky-800 text-white px-4 py-3 flex items-center gap-3 shadow">
        <button onClick={onBack} className="p-1.5 -ml-1.5 hover:bg-sky-700 rounded-lg">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-base font-semibold leading-tight">PDF Reports</h1>
          <p className="text-sky-200 text-xs">Preview or download professional reports</p>
        </div>
        <FileText className="w-5 h-5 text-sky-300 ml-auto" />
      </header>

      <main className="px-4 py-4 space-y-4 w-full">
        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>}

        {/* Report type selector */}
        <div className="bg-white rounded-xl border border-slate-200 p-3 space-y-2">
          <p className="text-sm font-medium text-slate-700 mb-1">Select Report Type</p>
          {([
            ['daily',    'Daily MIS',      <FileText className="w-4 h-4" />],
            ['roomchart','Room Chart',     <BedDouble className="w-4 h-4" />],
            ['mtd',      'MTD Report',     <CalendarRange className="w-4 h-4" />],
            ['ytd',      'YTD Report',     <TrendingUp className="w-4 h-4" />],
            ['ledger',   'Company Ledger', <Building2 className="w-4 h-4" />],
          ] as [ReportType, string, React.ReactNode][]).map(([type, label, icon]) => (
            <button key={type} onClick={() => setReportType(type)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg border text-sm font-medium transition ${
                reportType === type
                  ? 'border-sky-500 bg-sky-50 text-sky-800'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}>
              {icon} {label}
            </button>
          ))}
        </div>

        {/* Selectors */}
        {(reportType === 'daily' || reportType === 'roomchart') && (
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <label className="block text-sm font-medium text-slate-700 mb-1">Report Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-sky-500" />
          </div>
        )}

        {(reportType === 'mtd') && (
          <div className="bg-white rounded-xl border border-slate-200 p-4 grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Year</label>
              <select value={year} onChange={(e) => setYear(Number(e.target.value))}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-sky-500">
                {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Month</label>
              <select value={month} onChange={(e) => setMonth(Number(e.target.value))}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-sky-500">
                {MONTHS.map((name, i) => <option key={i} value={i + 1}>{name}</option>)}
              </select>
            </div>
          </div>
        )}

        {reportType === 'ytd' && (
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <label className="block text-sm font-medium text-slate-700 mb-1">Year</label>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-sky-500">
              {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        )}

        {reportType === 'ledger' && (
          <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Company / Booking Source</label>
              <select value={selectedCompany} onChange={(e) => setSelectedCompany(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-sky-500">
                {companies.length === 0 && <option value="">No companies configured</option>}
                {companies.map((c) => <option key={c.id} value={c.name}>{c.name} ({c.source_category})</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">From Date</label>
                <input type="date" value={ledgerFrom} onChange={(e) => setLedgerFrom(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-sky-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">To Date</label>
                <input type="date" value={ledgerTo} onChange={(e) => setLedgerTo(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-sky-500" />
              </div>
            </div>
          </div>
        )}

        {/* Info banner */}
        <div className="bg-sky-50 border border-sky-200 rounded-lg p-3 text-xs text-sky-700 space-y-0.5">
          <p className="font-semibold">All figures come directly from the live system.</p>
          <p>Preview opens the PDF in a new browser tab. Download saves it to your device.</p>
        </div>

        {/* PDF buttons */}
        {reportType === 'daily' && (
          <PdfButtons
            label="Daily MIS Report"
            buildDoc={buildDailyMIS}
            filename={dailyMISFilename(settings, date)}
          />
        )}
        {reportType === 'roomchart' && (
          <PdfButtons
            label="Room Chart"
            buildDoc={buildRoomChart}
            filename={roomChartFilename(settings, date)}
          />
        )}
        {reportType === 'mtd' && (
          <PdfButtons
            label="MTD Report"
            buildDoc={buildMTD}
            filename={mtdFilename(settings, year, month)}
          />
        )}
        {reportType === 'ytd' && (
          <PdfButtons
            label="YTD Report"
            buildDoc={buildYTD}
            filename={ytdFilename(settings, year)}
          />
        )}
        {reportType === 'ledger' && (
          <PdfButtons
            label="Company Ledger"
            buildDoc={buildLedger}
            filename={selectedCompany ? ledgerFilename(settings, selectedCompany, ledgerFrom, ledgerTo) : 'Ledger.pdf'}
          />
        )}
      </main>
    </div>
  );
};
