import { useState, useEffect, useCallback } from 'react';
import { Star, Phone, Mail, Building2, ArrowLeft, Loader2, AlertCircle, Users, MessageCircle } from 'lucide-react';
import type { Guest } from '@/lib/types-crm';
import { VIP_BADGE_COLORS, LOYALTY_COLORS } from '@/lib/types-crm';
import { getVipGuests } from '@/lib/api-crm';
import { Guest360 } from './Guest360';

export const VipGuests = ({ onBack }: { onBack: () => void }) => {
  const [guests, setGuests] = useState<Guest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedGuestId, setSelectedGuestId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getVipGuests();
      setGuests(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load VIP guests');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (selectedGuestId) {
    return <Guest360 guestId={selectedGuestId} onBack={() => { setSelectedGuestId(null); load(); }} />;
  }

  // Group by VIP type
  const grouped = guests.reduce((acc, g) => {
    const key = g.vip_type || 'Other';
    if (!acc[key]) acc[key] = [];
    acc[key].push(g);
    return acc;
  }, {} as Record<string, Guest[]>);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-lg text-slate-600">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-brand-navy-800">VIP Guests</h1>
          <p className="text-xs text-slate-400">{guests.length} VIP guests</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64 text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading…
        </div>
      ) : guests.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Star className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No VIP guests yet. Mark a guest as VIP from their profile.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([vipType, vips]) => (
            <div key={vipType}>
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-xs px-2.5 py-1 rounded-full font-bold border ${VIP_BADGE_COLORS[vipType] ?? 'bg-slate-100 text-slate-600 border-slate-300'}`}>
                  {vipType}
                </span>
                <span className="text-xs text-slate-400">— {vips.length} guests</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {vips.map((g) => (
                  <button key={g.id} onClick={() => setSelectedGuestId(g.id)}
                    className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 text-left hover:shadow-md transition">
                    <div className="flex items-start gap-3 mb-2">
                      <div className="w-10 h-10 rounded-full bg-brand-gold-50 flex items-center justify-center text-brand-gold-600 font-bold shrink-0">
                        {g.name.charAt(0).toUpperCase() || '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-brand-navy-800 truncate">{g.name}</p>
                        <p className="text-xs text-slate-400 truncate">{g.mobile || g.email}</p>
                      </div>
                    </div>
                    {g.company_name && (
                      <p className="text-[10px] text-slate-500 flex items-center gap-0.5 mb-2">
                        <Building2 className="w-2.5 h-2.5" /> {g.company_name}
                      </p>
                    )}
                    <div className="flex gap-1.5 pt-2 border-t border-slate-100">
                      {g.mobile && (
                        <a href={`tel:${g.mobile}`} onClick={(e) => e.stopPropagation()}
                          className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs font-semibold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-lg">
                          <Phone className="w-3 h-3" /> Call
                        </a>
                      )}
                      {g.mobile && (
                        <a href={`https://wa.me/91${g.mobile.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                          className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs font-semibold text-teal-600 bg-teal-50 hover:bg-teal-100 rounded-lg">
                          <MessageCircle className="w-3 h-3" /> WhatsApp
                        </a>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
