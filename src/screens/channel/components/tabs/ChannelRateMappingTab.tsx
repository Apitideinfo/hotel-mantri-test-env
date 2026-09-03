import React, { useState, useEffect } from 'react';
import { 
  CheckCircle2, AlertTriangle, XCircle, Save, Sparkles, 
  RefreshCw, Loader2, Tag, ArrowRight 
} from 'lucide-react';
import type { ChannelConnection, ChannelRateMapping } from '@/lib/api-channel';
import type { RatePlan } from '@/lib/types-reservations';
import { 
  saveChannelMappings, fetchChannelMapping 
} from '@/lib/api-channel';
import { supabase } from '@/lib/supabase';

interface ChannelRateMappingTabProps {
  channel: ChannelConnection;
  ratePlans: RatePlan[];
  mappings: ChannelRateMapping[];
  onRefresh: () => void;
}

interface ExternalRatePlanOption {
  ratePlanId: string;
  ratePlanName: string;
}

export const ChannelRateMappingTab: React.FC<ChannelRateMappingTabProps> = ({
  channel,
  ratePlans,
  mappings,
  onRefresh
}) => {
  const [rateMappingState, setRateMappingState] = useState<Record<string, { code: string; name: string }>>({});
  const [externalRatePlans, setExternalRatePlans] = useState<ExternalRatePlanOption[]>([]);
  const [loadingRates, setLoadingRates] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creatingPlans, setCreatingPlans] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    const initial: Record<string, { code: string; name: string }> = {};
    const relevant = mappings.filter(
      m => m.channel_connection_id === channel.id || (!m.channel_connection_id && channel.channel_type === 'agoda')
    );

    relevant.forEach(m => {
      if (m.rate_plan_id && m.external_rate_plan_code) {
        initial[m.rate_plan_id] = {
          code: m.external_rate_plan_code,
          name: m.external_rate_plan_name || m.external_rate_plan_code
        };
      }
    });

    setRateMappingState(initial);
  }, [mappings, channel.id, channel.channel_type]);

  const loadExternalRates = async () => {
    setLoadingRates(true);
    try {
      const res = await fetchChannelMapping();
      if (res && Array.isArray(res.ratePlans)) {
        setExternalRatePlans(res.ratePlans.map((rp: any) => ({
          ratePlanId: rp.rate_plan_id || rp.rateplan_id || rp.rateplanCode || '',
          ratePlanName: rp.rate_plan_name || rp.rateplan_name || rp.rate_plan_id || 'Rate Plan'
        })));
      }
    } catch (err) {
      console.warn('Could not fetch upstream external rate plans:', err);
    } finally {
      setLoadingRates(false);
    }
  };

  useEffect(() => {
    loadExternalRates();
  }, []);

  const handleRateChange = (ratePlanId: string, selectedCode: string) => {
    const opt = externalRatePlans.find(r => r.ratePlanId === selectedCode);
    setRateMappingState(prev => ({
      ...prev,
      [ratePlanId]: {
        code: selectedCode,
        name: opt ? opt.ratePlanName : selectedCode
      }
    }));
    setFeedback(null);
  };

  const handleAutoMatch = () => {
    const next = { ...rateMappingState };
    let matchesCount = 0;

    ratePlans.forEach(rp => {
      const normName = (rp.plan_name || rp.plan_type || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const match = externalRatePlans.find(erp => {
        const normExt = erp.ratePlanName.toLowerCase().replace(/[^a-z0-9]/g, '');
        return normExt === normName || erp.ratePlanId.toLowerCase().includes(rp.plan_type?.toLowerCase() || '');
      });

      if (match) {
        next[rp.id] = { code: match.ratePlanId, name: match.ratePlanName };
        matchesCount++;
      }
    });

    if (matchesCount === 0) {
      setFeedback({ type: 'error', message: 'No automated rate plan matches found. Please map manually.' });
      return;
    }

    setRateMappingState(next);
    setFeedback({ type: 'success', message: `Auto-matched ${matchesCount} rate plan(s). Click "Save Mapping" to persist.` });
  };

  const handleSave = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      const recordsToSave = ratePlans.map(rp => {
        const mapped = rateMappingState[rp.id];
        return {
          ratePlanId: rp.id,
          externalRatePlanCode: mapped?.code || null,
          externalRatePlanName: mapped?.name || null,
          status: mapped?.code ? 'mapped' : 'unmapped',
          isActive: true
        };
      });

      await saveChannelMappings(channel.id, recordsToSave);
      setFeedback({ type: 'success', message: 'Rate plan mappings saved successfully!' });
      onRefresh();
    } catch (err: any) {
      console.error('Save rate mapping error:', err);
      setFeedback({ type: 'error', message: err.message || 'Failed to save rate mappings.' });
    } finally {
      setSaving(false);
    }
  };

  const handleCreateDefaultRatePlans = async () => {
    setCreatingPlans(true);
    setFeedback(null);
    try {
      const hotelId = channel.hotel_id;
      const { error } = await supabase.from('rate_plans').insert([
        {
          hotel_id: hotelId,
          plan_name: 'EP - European Plan (Room Only)',
          plan_type: 'EP',
          base_rate: 2500,
          weekend_rate: 2800,
          season_rate: 3200,
          is_active: true
        },
        {
          hotel_id: hotelId,
          plan_name: 'CP - Continental Plan (With Breakfast)',
          plan_type: 'CP',
          base_rate: 3000,
          weekend_rate: 3400,
          season_rate: 3800,
          is_active: true
        }
      ]);
      if (error) throw error;
      setFeedback({ type: 'success', message: 'Standard rate plans created successfully! You can now map them below.' });
      onRefresh();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to create rate plans.' });
    } finally {
      setCreatingPlans(false);
    }
  };

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Feedback */}
      {feedback && (
        <div className={`p-4 rounded-xl text-xs flex items-center justify-between gap-3 border ${
          feedback.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-red-50 text-red-800 border-red-200'
        }`}>
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 text-red-600" />}
            <span className="font-medium">{feedback.message}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-slate-600">
            &times;
          </button>
        </div>
      )}

      {/* Action Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-4 border border-slate-200 rounded-2xl">
        <div>
          <h4 className="text-sm font-bold text-slate-900">Rate Plan Mapping</h4>
          <p className="text-xs text-slate-500">Map Hotel Mantri rate plans (e.g. BAR, EP, CP) to external OTA rate plans.</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadExternalRates}
            disabled={loadingRates}
            className="px-3 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl shadow-sm transition flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingRates ? 'animate-spin' : ''}`} />
            Refresh External Rates
          </button>

          <button
            type="button"
            onClick={handleAutoMatch}
            className="px-3 py-2 bg-brand-50 hover:bg-brand-100 border border-brand-200 text-brand-700 text-xs font-semibold rounded-xl transition flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5 text-brand-600" />
            Auto Match
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold rounded-xl shadow-soft-blue transition flex items-center gap-1.5 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save Mapping
          </button>
        </div>
      </div>

      {/* Table / Empty State */}
      {ratePlans.length === 0 ? (
        <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-8 text-center space-y-4">
          <div className="w-12 h-12 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto text-amber-600">
            <Tag className="w-6 h-6" />
          </div>
          <div>
            <h5 className="text-sm font-bold text-slate-800">No Rate Plans Configured</h5>
            <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
              Rate plans (such as EP - Room Only, CP - With Breakfast) must exist in Hotel Mantri before they can be mapped to OTA channels.
            </p>
          </div>
          <button
            type="button"
            onClick={handleCreateDefaultRatePlans}
            disabled={creatingPlans}
            className="px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold rounded-xl shadow-soft-blue transition inline-flex items-center gap-2"
          >
            {creatingPlans ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Generate Standard Rate Plans (EP & CP)
          </button>
        </div>
      ) : (
        <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm bg-white">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
                <th className="py-3 px-4">Hotel Mantri Rate Plan</th>
                <th className="py-3 px-4">Inclusion / Meal Plan</th>
                <th className="py-3 px-4">External OTA Rate Plan</th>
                <th className="py-3 px-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ratePlans.map((rp) => {
                const mapped = rateMappingState[rp.id];
                const isMapped = Boolean(mapped?.code);

                return (
                  <tr key={rp.id} className="hover:bg-slate-50/60 transition">
                    <td className="py-3.5 px-4 font-semibold text-slate-800">
                      <div className="flex items-center gap-2">
                        <Tag className="w-4 h-4 text-slate-400" />
                        <div>
                          <p>{rp.plan_name}</p>
                          <p className="text-[10px] text-slate-400 font-normal">Type: {rp.plan_type || 'Standard'}</p>
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-slate-600">
                      {rp.plan_type || 'Standard EP / Room only'}
                    </td>

                    <td className="py-3.5 px-4">
                      {externalRatePlans.length > 0 ? (
                        <select
                          value={mapped?.code || ''}
                          onChange={(e) => handleRateChange(rp.id, e.target.value)}
                          className="w-full max-w-xs px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-800 focus:ring-1 focus:ring-brand-500"
                        >
                          <option value="">-- Select External Rate Plan --</option>
                          {externalRatePlans.map(erp => (
                            <option key={erp.ratePlanId} value={erp.ratePlanId}>
                              {erp.ratePlanName} ({erp.ratePlanId})
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={mapped?.code || ''}
                          onChange={(e) => handleRateChange(rp.id, e.target.value)}
                          placeholder="Enter external rate plan code"
                          className="w-full max-w-xs px-3 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-800 focus:ring-1 focus:ring-brand-500"
                        />
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      {isMapped ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          Mapped
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                          Unmapped
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
