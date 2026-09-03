import React, { useState } from 'react';
import { Building2, Search, CheckCircle2, ChevronRight, X, Sparkles } from 'lucide-react';
import { useHotel, HotelSummary } from '@/lib/hotel-context';

interface HotelSelectorModalProps {
  isOpen: boolean;
  onClose?: () => void;
  isMandatory?: boolean;
}

export const HotelSelectorModal: React.FC<HotelSelectorModalProps> = ({
  isOpen,
  onClose,
  isMandatory = false,
}) => {
  const { availableHotels, hotelId, setSelectedHotel, status } = useHotel();
  const [search, setSearch] = useState('');
  const [selectingId, setSelectingId] = useState<string | null>(null);

  if (!isOpen) return null;

  const filtered = availableHotels.filter((h) => {
    const q = search.toLowerCase();
    return (
      h.hotel_name.toLowerCase().includes(q) ||
      (h.owner_name && h.owner_name.toLowerCase().includes(q)) ||
      (h.admin_email && h.admin_email.toLowerCase().includes(q))
    );
  });

  const handleSelect = async (selected: HotelSummary) => {
    setSelectingId(selected.id);
    try {
      await setSelectedHotel(selected.id);
      if (onClose) onClose();
    } finally {
      setSelectingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-6 bg-gradient-to-r from-slate-900 to-[#06152F] text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-brand-500/20 border border-brand-400/30 flex items-center justify-center text-brand-400">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Select Hotel Property</h2>
              <p className="text-xs text-slate-300 mt-0.5">
                {isMandatory
                  ? 'Choose a hotel to access dashboard and channel operations'
                  : 'Switch between managed properties'}
              </p>
            </div>
          </div>
          {!isMandatory && onClose && (
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-white/10 transition"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Search Bar */}
        {availableHotels.length > 3 && (
          <div className="p-4 border-b border-slate-100 bg-slate-50/50">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search properties by name, owner, or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition"
              />
            </div>
          </div>
        )}

        {/* Hotel List */}
        <div className="p-4 overflow-y-auto flex-1 space-y-2.5 divide-y divide-slate-100">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-sm">
              No hotels found matching your search.
            </div>
          ) : (
            filtered.map((h) => {
              const isSelected = h.id === hotelId;
              const isProcessing = selectingId === h.id;

              return (
                <div
                  key={h.id}
                  onClick={() => !isProcessing && handleSelect(h)}
                  className={`pt-2.5 first:pt-0 group flex items-center justify-between p-3.5 rounded-2xl cursor-pointer transition-all border ${
                    isSelected
                      ? 'bg-blue-50/60 border-blue-200 shadow-sm'
                      : 'hover:bg-slate-50 border-transparent hover:border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div
                      className={`w-11 h-11 rounded-2xl flex items-center justify-center font-bold text-sm shrink-0 transition ${
                        isSelected
                          ? 'bg-[#1a68fb] text-white shadow-md shadow-blue-500/20'
                          : 'bg-slate-100 text-slate-700 group-hover:bg-blue-100 group-hover:text-blue-700'
                      }`}
                    >
                      {h.hotel_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-slate-900 text-sm truncate">
                          {h.hotel_name}
                        </h3>
                        {isSelected && (
                          <span className="bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                            <CheckCircle2 className="w-2.5 h-2.5" /> Active
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 truncate mt-0.5">
                        {h.owner_name ? `Owner: ${h.owner_name}` : ''}
                        {h.total_rooms ? ` · ${h.total_rooms} Rooms` : ''}
                        {h.admin_email ? ` · ${h.admin_email}` : ''}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    {isProcessing ? (
                      <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <ChevronRight
                        className={`w-4 h-4 transition ${
                          isSelected ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-700 group-hover:translate-x-0.5'
                        }`}
                      />
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 text-xs text-slate-500 flex items-center justify-between">
          <span className="flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-brand-500" /> Total Active Properties: {availableHotels.length}
          </span>
          {isMandatory && (
            <span className="text-amber-600 font-semibold">Selection is required to proceed</span>
          )}
        </div>
      </div>
    </div>
  );
};
