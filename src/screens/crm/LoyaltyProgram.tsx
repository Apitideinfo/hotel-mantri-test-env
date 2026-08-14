import { useState, useEffect, useCallback } from 'react';
import {
  Award, ArrowLeft, Loader2, AlertCircle, Star, TrendingUp, Users,
} from 'lucide-react';
import type { Guest } from '@/lib/types-crm';
import { LOYALTY_LEVELS, LOYALTY_THRESHOLDS, LOYALTY_COLORS } from '@/lib/types-crm';
import { getGuests } from '@/lib/api-crm';
import { Guest360 } from './Guest360';

export const LoyaltyProgram = ({ onBack }: { onBack: () => void }) => {
  const [guests, setGuests] = useState<Guest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedGuestId, setSelectedGuestId] = useState<string | null>(null);
  const [filterLevel, setFilterLevel] = useState<string>('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getGuests();
      setGuests(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (selectedGuestId) {
    return <Guest360 guestId={selectedGuestId} onBack={() => { setSelectedGuestId(null); load(); }} />;
  }

  const filtered = filterLevel ? guests.filter((g) => g.loyalty_level === filterLevel) : guests;
  const levelCounts: Record<string, number> = {};
  for (const g of guests) {
    levelCounts[g.loyalty_level] = (levelCounts[g.loyalty_level] ?? 0) + 1;
  }
  const totalPoints = guests.reduce((s, g) => s + g.loyalty_points, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-lg text-slate-600">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-brand-navy-800">Loyalty Program</h1>
          <p className="text-xs text-slate-400">{guests.length} members · {totalPoints.toLocaleString('en-IN')} total points</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {/* Level cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {LOYALTY_LEVELS.map((level) => (
          <button key={level} onClick={() => setFilterLevel(filterLevel === level ? '' : level)}
            className={`rounded-xl border-2 p-3 text-left transition ${filterLevel === level ? 'ring-2 ring-brand-500 ' : ''}${
              level === 'Silver' ? 'border-slate-200 bg-slate-50' :
              level === 'Gold' ? 'border-amber-200 bg-amber-50' :
              level === 'Platinum' ? 'border-violet-200 bg-violet-50' :
              'border-cyan-200 bg-cyan-50'
            }`}>
            <div className="flex items-center gap-2 mb-1">
              <Award className={`w-4 h-4 ${
                level === 'Silver' ? 'text-slate-500' :
                level === 'Gold' ? 'text-amber-600' :
                level === 'Platinum' ? 'text-violet-600' : 'text-cyan-600'
              }`} />
              <span className="text-lg font-bold text-brand-navy-800 tabular-nums">{levelCounts[level] ?? 0}</span>
            </div>
            <p className="text-[10px] text-slate-500 uppercase tracking-wide">{level}</p>
            <p className="text-[9px] text-slate-400">{LOYALTY_THRESHOLDS[level]}+ pts</p>
          </button>
        ))}
      </div>

      {/* Filter info */}
      {filterLevel && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Filtering by: <b>{filterLevel}</b></span>
          <button onClick={() => setFilterLevel('')} className="text-xs text-brand-600 hover:underline">Clear</button>
        </div>
      )}

      {/* Guest list */}
      {loading ? (
        <div className="flex items-center justify-center h-64 text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading…
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Award className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No loyalty members yet.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b text-left text-xs font-bold text-slate-500 uppercase">
                  <th className="px-4 py-3">Guest</th>
                  <th className="px-4 py-3">Mobile</th>
                  <th className="px-4 py-3">Level</th>
                  <th className="px-4 py-3">Points</th>
                  <th className="px-4 py-3">Progress</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.sort((a, b) => b.loyalty_points - a.loyalty_points).map((g) => {
                  const nextLevel = LOYALTY_LEVELS.find((l) => LOYALTY_LEVELS.indexOf(l) > LOYALTY_LEVELS.indexOf(g.loyalty_level));
                  const nextThreshold = nextLevel ? LOYALTY_THRESHOLDS[nextLevel] : g.loyalty_points;
                  const currentThreshold = LOYALTY_THRESHOLDS[g.loyalty_level];
                  const progress = nextLevel ? Math.min(100, ((g.loyalty_points - currentThreshold) / (nextThreshold - currentThreshold)) * 100) : 100;

                  return (
                    <tr key={g.id} onClick={() => setSelectedGuestId(g.id)} className="hover:bg-slate-50 cursor-pointer">
                      <td className="px-4 py-3 font-semibold text-brand-navy-700">{g.name || 'Unknown'}</td>
                      <td className="px-4 py-3 text-slate-600">{g.mobile || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${LOYALTY_COLORS[g.loyalty_level]}`}>
                          {g.loyalty_level}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-bold tabular-nums">{g.loyalty_points.toLocaleString('en-IN')}</td>
                      <td className="px-4 py-3">
                        <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${g.loyalty_level === 'Diamond' ? 'bg-cyan-500' : 'bg-brand-500'}`} style={{ width: `${progress}%` }} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
