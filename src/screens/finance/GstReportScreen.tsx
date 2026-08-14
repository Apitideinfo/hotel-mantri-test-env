import { useEffect, useState, useRef } from 'react';
import { ArrowLeft, FileText, RefreshCw, Download, Printer, FileSpreadsheet, ChevronDown } from 'lucide-react';
import { ScreenHeader, SectionCard, Banner, monthLabel } from '@/components/finance-ui';
import { getSettings, getRoomChartForMonth, logGstExport } from '@/lib/api';
import { fmtMoney, toNum } from '@/lib/calc';
import { useAuth } from '@/lib/auth';
import { buildGstStatement, buildGstStatementPDF, buildGstStatementExcel, gstPdfFilename } from '@/lib/pdf-gst';
import type { HotelSettings, RoomChartEntry } from '@/lib/types';
import { downloadPDF } from '@/lib/pdf';

const EXPORT_ROLES = ['super_admin', 'hotel_admin'];

export const GstReportScreen = ({ onBack }: { onBack: () => void }) => {
  const now = new Date();
  const [monthKey, setMonthKey] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const [settings, setSettings] = useState<HotelSettings | null>(null);
  const [entries, setEntries] = useState<RoomChartEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { role } = useAuth();

  const canExport = role ? EXPORT_ROLES.includes(role) : false;

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const s = await getSettings();
      setSettings(s);
      const [y, m] = monthKey.split('-').map(Number);
      const ents = await getRoomChartForMonth(y, m);
      setEntries(ents);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load GST report');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [monthKey]);

  // Close menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const gstRegistered = settings?.gst_registered ?? false;

  const statementData = settings ? buildGstStatement(entries, settings.state_name) : null;
  const hasData = statementData ? statementData.rows.length > 0 : false;

  const handleDownloadPDF = async () => {
    if (!settings || !statementData || !hasData) return;
    setExporting(true);
    setExportError(null);
    setMenuOpen(false);
    try {
      const doc = await buildGstStatementPDF({ settings, data: statementData, monthKey });
      downloadPDF(doc, gstPdfFilename(settings, monthKey));
      await logGstExport(monthKey, 'pdf', statementData.rows.length);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'PDF export failed');
    } finally {
      setExporting(false);
    }
  };

  const handleDownloadExcel = async () => {
    if (!settings || !statementData || !hasData) return;
    setExporting(true);
    setExportError(null);
    setMenuOpen(false);
    try {
      buildGstStatementExcel({ settings, data: statementData, monthKey });
      await logGstExport(monthKey, 'excel', statementData.rows.length);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'Excel export failed');
    } finally {
      setExporting(false);
    }
  };

  const handlePrint = async () => {
    if (!settings || !statementData || !hasData) return;
    setExporting(true);
    setExportError(null);
    setMenuOpen(false);
    try {
      const doc = await buildGstStatementPDF({ settings, data: statementData, monthKey });
      doc.autoPrint();
      const url = URL.createObjectURL(doc.output('blob'));
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      await logGstExport(monthKey, 'print', statementData.rows.length);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'Print failed');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <ScreenHeader title="Monthly GST Report" subtitle={settings?.hotel_name ?? ''} icon={<FileText className="w-5 h-5 text-sky-600" />} onBack={onBack} />

      <main className="px-4 py-4 space-y-4 w-full">
        {/* Month selector + download controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <label className="text-sm font-medium text-slate-600">Month</label>
          <input type="month" value={monthKey} onChange={(e) => setMonthKey(e.target.value)}
            className="flex-1 min-w-[140px] px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
          <button onClick={load} disabled={loading}
            className="p-2 text-slate-500 hover:text-sky-600 transition disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {/* Download controls */}
          {canExport && hasData && !loading && (
            <div className="relative" ref={menuRef}>
              {/* Desktop button */}
              <button
                onClick={() => setMenuOpen((v) => !v)}
                disabled={exporting}
                className="hidden sm:flex items-center gap-2 bg-sky-700 hover:bg-sky-800 disabled:opacity-60 text-white font-semibold px-4 py-2 rounded-lg text-sm transition"
              >
                <Download className="w-4 h-4" />
                {exporting ? 'Preparing…' : 'Download Statement'}
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              {/* Mobile icon */}
              <button
                onClick={() => setMenuOpen((v) => !v)}
                disabled={exporting}
                className="sm:hidden p-2 bg-sky-700 hover:bg-sky-800 disabled:opacity-60 text-white rounded-lg transition"
              >
                <Download className="w-4 h-4" />
              </button>

              {/* Dropdown menu */}
              {menuOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-slate-200 z-20 overflow-hidden">
                  <button
                    onClick={handleDownloadPDF}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-700 hover:bg-sky-50 transition text-left">
                    <FileText className="w-4 h-4 text-sky-600" />
                    Download GST Statement PDF
                  </button>
                  <button
                    onClick={handleDownloadExcel}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-700 hover:bg-sky-50 transition text-left border-t border-slate-100">
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                    Download GST Statement Excel
                  </button>
                  <button
                    onClick={handlePrint}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-700 hover:bg-sky-50 transition text-left border-t border-slate-100">
                    <Printer className="w-4 h-4 text-slate-500" />
                    Print Statement
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Permission denied banner */}
        {!canExport && gstRegistered && !loading && (
          <Banner kind="error">
            You do not have permission to download or export GST statements. Only Hotel Owners, Admins, and Super Admins can export.
          </Banner>
        )}

        {exportError && (
          <Banner kind="error">
            {exportError}
          </Banner>
        )}

        {error && <Banner kind="error">{error}</Banner>}

        {!gstRegistered && !loading && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl p-3">
            GST is not enabled for this hotel. Enable it in Settings &gt; GST Configuration.
          </div>
        )}

        {/* Empty state */}
        {gstRegistered && !loading && !hasData && statementData && (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
            <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 text-sm font-medium">No GST transactions found for the selected month.</p>
            <p className="text-slate-400 text-xs mt-1">Select a different month or add bookings with GST to generate a statement.</p>
          </div>
        )}

        {gstRegistered && hasData && statementData && (
          <>
            <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 text-white rounded-2xl p-5 shadow-lg">
              <p className="text-indigo-100 text-xs uppercase tracking-wide font-medium">GST Collected — {monthLabel(monthKey)}</p>
              <p className="text-3xl font-bold mt-1">₹{fmtMoney(statementData.totalGst)}</p>
              <div className="grid grid-cols-3 gap-3 mt-4 text-sm">
                <div>
                  <p className="text-indigo-200 text-xs">CGST</p>
                  <p className="font-semibold">₹{fmtMoney(statementData.totalCgst)}</p>
                </div>
                <div>
                  <p className="text-indigo-200 text-xs">SGST</p>
                  <p className="font-semibold">₹{fmtMoney(statementData.totalSgst)}</p>
                </div>
                <div>
                  <p className="text-indigo-200 text-xs">IGST</p>
                  <p className="font-semibold">₹{fmtMoney(statementData.totalIgst)}</p>
                </div>
              </div>
            </div>

            <SectionCard title="Summary" icon={<FileText className="w-4 h-4" />}>
              <div className="space-y-1.5 text-sm">
                <Row label="Total Bookings" value={String(statementData.totalBookings)} />
                <Row label="Taxable Revenue" value={`₹${fmtMoney(statementData.totalTaxable)}`} />
                <Row label="CGST Collected" value={`₹${fmtMoney(statementData.totalCgst)}`} />
                <Row label="SGST Collected" value={`₹${fmtMoney(statementData.totalSgst)}`} />
                <Row label="IGST Collected" value={`₹${fmtMoney(statementData.totalIgst)}`} />
                <Row label="Total GST Collected" value={`₹${fmtMoney(statementData.totalGst)}`} />
                <Row label="Net Revenue (excl. GST)" value={`₹${fmtMoney(statementData.netRevenue)}`} bold />
              </div>
            </SectionCard>

            <SectionCard title="GST by Slab" icon={<FileText className="w-4 h-4" />}>
              <div className="space-y-2">
                {statementData.bySlab.map((s) => (
                  <div key={s.gstRate} className="flex items-center justify-between text-sm bg-slate-50 rounded-lg px-3 py-2">
                    <div>
                      <span className="font-semibold text-slate-800">{s.gstRate}%</span>
                      <span className="text-slate-400 ml-2">({s.bookings} bookings)</span>
                    </div>
                    <div className="text-right">
                      <p className="text-slate-600">Taxable: ₹{fmtMoney(s.taxableAmount)}</p>
                      <p className="font-semibold text-indigo-700">GST: ₹{fmtMoney(s.totalGst)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>

            <SectionCard title="Booking-wise Detail" icon={<FileText className="w-4 h-4" />}>
              <div className="space-y-2">
                {statementData.rows.map((r) => (
                  <div key={r.srNo} className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-700">{r.businessDate} · Room {r.roomNo}</span>
                      <span className="font-semibold text-indigo-600">{r.gstType === 'No Scope' ? 'No Scope' : `${r.gstRate}%`}</span>
                    </div>
                    <div className="text-slate-500 mt-0.5">{r.guestName} {r.bookingSource && `· ${r.bookingSource}`}</div>
                    <div className="flex justify-between mt-1.5 text-slate-600">
                      <span>Taxable: ₹{fmtMoney(r.taxableAmount)}</span>
                      <span>GST: ₹{fmtMoney(r.totalGst)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          </>
        )}
      </main>
    </div>
  );
};

const Row = ({ label, value, bold }: { label: string; value: string; bold?: boolean }) => (
  <div className="flex items-center justify-between">
    <span className={bold ? 'font-semibold text-slate-800' : 'text-slate-600'}>{label}</span>
    <span className={bold ? 'font-bold text-slate-900' : 'font-medium text-slate-700'}>{value}</span>
  </div>
);
