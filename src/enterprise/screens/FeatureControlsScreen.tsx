import { useEffect, useState, useCallback } from 'react';
import { ToggleLeft, Building2, Search } from 'lucide-react';
import { getEnterpriseHotels, getHotelFeatures, upsertHotelFeature } from '../api';
import type { EnterpriseHotel, HotelFeature } from '../types';
import { MODULE_KEYS, MODULE_LABELS, COMING_SOON_MODULES } from '../types';
import { PageHeader, Card, Badge, LoadingState, ErrorState } from '../ui';

export const FeatureControlsScreen = () => {
  const [hotels, setHotels] = useState<EnterpriseHotel[]>([]);
  const [selectedHotel, setSelectedHotel] = useState<string | null>(null);
  const [features, setFeatures] = useState<HotelFeature[]>([]);
  const [loading, setLoading] = useState(true);
  const [featureLoading, setFeatureLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const h = await getEnterpriseHotels();
      setHotels(h.filter((x) => !x.archived_at));
      if (h.length > 0 && !selectedHotel) setSelectedHotel(h[0].id);
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setLoading(false); }
  }, [selectedHotel]);

  const loadFeatures = useCallback(async () => {
    if (!selectedHotel) return;
    try {
      setFeatureLoading(true);
      const f = await getHotelFeatures(selectedHotel);
      setFeatures(f);
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setFeatureLoading(false); }
  }, [selectedHotel]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (selectedHotel) loadFeatures(); }, [selectedHotel, loadFeatures]);

  const toggle = async (key: string, current: boolean) => {
    if (!selectedHotel) return;
    try {
      await upsertHotelFeature(selectedHotel, key, !current);
      setFeatures((prev) => {
        const existing = prev.find((f) => f.module_key === key);
        if (existing) return prev.map((f) => f.module_key === key ? { ...f, is_enabled: !current } : f);
        return [...prev, { id: '', hotel_id: selectedHotel, module_key: key, is_enabled: !current, updated_at: new Date().toISOString() }];
      });
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
  };

  if (loading) return <LoadingState label="Loading feature controls…" />;

  const filteredHotels = hotels.filter((h) => !search || h.hotel_name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-4">
      <PageHeader title="Feature Controls" subtitle="Enable or disable modules per hotel" />

      {error && <ErrorState message={error} />}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Hotel list */}
        <Card className="p-3 lg:col-span-1">
          <div className="relative mb-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search hotels…"
              className="w-full pl-10 pr-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-500" />
          </div>
          <div className="space-y-1 max-h-96 overflow-y-auto">
            {filteredHotels.map((h) => (
              <button key={h.id} onClick={() => setSelectedHotel(h.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition ${
                  selectedHotel === h.id ? 'bg-sky-50 text-sky-700' : 'text-slate-600 hover:bg-slate-50'
                }`}>
                <Building2 className="w-4 h-4" /> {h.hotel_name}
              </button>
            ))}
          </div>
        </Card>

        {/* Feature toggles */}
        <Card className="p-5 lg:col-span-2">
          {featureLoading ? <LoadingState label="Loading features…" /> : (
            <>
              <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-4">
                {hotels.find((h) => h.id === selectedHotel)?.hotel_name ?? 'Select a hotel'}
              </h3>
              <div className="space-y-2">
                {MODULE_KEYS.map((key) => {
                  const f = features.find((x) => x.module_key === key);
                  const enabled = f?.is_enabled ?? true;
                  return (
                    <div key={key} className="flex items-center justify-between p-3 border border-slate-200 rounded-lg hover:bg-slate-50 transition">
                      <div className="flex items-center gap-3">
                        <ToggleLeft className={`w-5 h-5 ${enabled ? 'text-emerald-500' : 'text-slate-300'}`} />
                        <span className="text-sm font-medium text-slate-700">{MODULE_LABELS[key]}</span>
                      </div>
                      <button onClick={() => toggle(key, enabled)}
                        className={`relative w-11 h-6 rounded-full transition ${enabled ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                        <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                      </button>
                    </div>
                  );
                })}
                <div className="pt-2 mt-2 border-t border-slate-100">
                  <p className="text-xs font-bold uppercase text-slate-400 mb-2">Coming Soon</p>
                  {COMING_SOON_MODULES.map((key) => (
                    <div key={key} className="flex items-center justify-between p-3 border border-slate-100 rounded-lg opacity-60">
                      <span className="text-sm text-slate-500">{MODULE_LABELS[key]}</span>
                      <Badge color="slate">Soon</Badge>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
};
