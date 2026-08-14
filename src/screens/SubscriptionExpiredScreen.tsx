import { ShieldX, LogOut } from 'lucide-react';

interface SubscriptionExpiredScreenProps {
  message: string;
  onSignOut: () => void;
}

export const SubscriptionExpiredScreen = ({ message, onSignOut }: SubscriptionExpiredScreenProps) => (
  <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
    <div className="w-full max-w-sm text-center">
      <div className="inline-flex items-center justify-center w-16 h-16 bg-amber-100 rounded-2xl mb-4">
        <ShieldX className="w-8 h-8 text-amber-600" />
      </div>
      <h1 className="text-xl font-bold text-slate-900 mb-2">Access Restricted</h1>
      <p className="text-sm text-slate-600 mb-6">{message}</p>
      <button onClick={onSignOut}
        className="inline-flex items-center gap-2 bg-slate-700 hover:bg-slate-800 text-white font-semibold px-6 py-3 rounded-xl transition">
        <LogOut className="w-4 h-4" /> Sign Out
      </button>
    </div>
  </div>
);
