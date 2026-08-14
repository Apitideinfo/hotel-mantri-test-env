import {
  ArrowLeft, Sparkles, FileText, Users, BedDouble, Wallet,
  FileBarChart, Receipt, BarChart3, TrendingUp,
} from 'lucide-react';

interface AnalyticsHubProps {
  onBack: () => void;
  onNavigate: (screen: string) => void;
}

const ITEMS = [
  { id: 'owner-dashboard', label: 'Owner Dashboard', desc: 'KPIs · Live charts · Insights', icon: <Sparkles className="w-5 h-5" />, color: 'text-brand-navy-700 bg-brand-navy-50' },
  { id: 'mis-report', label: 'Daily MIS Report', desc: 'Full report with all sections', icon: <FileText className="w-5 h-5" />, color: 'text-brand-600 bg-brand-50' },
  { id: 'analytics-booking', label: 'Booking Source', desc: 'Count · Revenue · Avg Rate', icon: <Users className="w-5 h-5" />, color: 'text-blue-600 bg-blue-50' },
  { id: 'analytics-category', label: 'Room Categories', desc: 'Occupancy · ARR · RevPAR', icon: <BedDouble className="w-5 h-5" />, color: 'text-emerald-600 bg-emerald-50' },
  { id: 'analytics-payment', label: 'Payments', desc: 'Cash · UPI · Card · Split', icon: <Wallet className="w-5 h-5" />, color: 'text-teal-600 bg-teal-50' },
  { id: 'analytics-gst', label: 'GST', desc: 'Collection · CGST/SGST · Register', icon: <FileBarChart className="w-5 h-5" />, color: 'text-indigo-600 bg-indigo-50' },
  { id: 'analytics-expense', label: 'Expenses', desc: 'Category · Vendor · Trend', icon: <Receipt className="w-5 h-5" />, color: 'text-red-600 bg-red-50' },
  { id: 'analytics-occupancy', label: 'Occupancy', desc: 'Daily · Weekly · Utilization', icon: <BarChart3 className="w-5 h-5" />, color: 'text-amber-600 bg-amber-50' },
  { id: 'analytics-revenue', label: 'Revenue', desc: 'Room · F&B · Comparison', icon: <TrendingUp className="w-5 h-5" />, color: 'text-brand-gold-600 bg-brand-gold-50' },
];

export const AnalyticsHub = ({ onBack, onNavigate }: AnalyticsHubProps) => {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-gradient-to-r from-brand-navy-800 to-brand-navy-700 text-white px-4 lg:px-6 py-5">
        <div className="max-w-[1200px] mx-auto flex items-center gap-3">
          <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-lg transition">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl lg:text-2xl font-bold flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-brand-gold-400" /> Analytics & BI
            </h1>
            <p className="text-xs text-brand-navy-200 mt-0.5">Reports · Charts · Insights · Exports</p>
          </div>
        </div>
      </div>

      <main className="px-4 lg:px-6 py-6 max-w-[1200px] mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {ITEMS.map((item) => (
            <button key={item.id} onClick={() => onNavigate(item.id)}
              className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-slate-300 transition-all p-4 flex items-start gap-3 text-left">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${item.color}`}>
                {item.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-900">{item.label}</p>
                <p className="text-xs text-slate-400 mt-0.5">{item.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </main>
    </div>
  );
};
