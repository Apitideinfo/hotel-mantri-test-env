import React, { useState } from 'react';
import { Building2, Hash, Layers, ShieldCheck, ArrowLeft, ArrowRight, Loader2, MapPin, CheckCircle2, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface PersonalData {
  fullName: string;
  email: string;
  mobile: string;
  password?: string;
}

interface HotelOnboardingScreenProps {
  personalData: PersonalData | null;
  email: string;
  onNavigateBack: () => void;
  onOnboardingSuccess: () => void;
}

export const HotelOnboardingScreen: React.FC<HotelOnboardingScreenProps> = ({
  personalData,
  email,
  onNavigateBack,
  onOnboardingSuccess,
}) => {
  // Hotel Info
  const [hotelName, setHotelName] = useState('');
  const [propertyCode, setPropertyCode] = useState('');
  const [city, setCity] = useState('');
  const [stateName, setStateName] = useState('');
  const [address, setAddress] = useState('');
  const [pincode, setPincode] = useState('');
  const [floors, setFloors] = useState('');
  const [totalRooms, setTotalRooms] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ownerName = personalData?.fullName || 'Hotel Owner';
  const ownerMobile = personalData?.mobile || '';
  const ownerEmail = email || personalData?.email || '';
  const password = personalData?.password || '';

  const validate = () => {
    if (!hotelName.trim()) return 'Please enter hotel name.';
    const r = parseInt(totalRooms, 10);
    if (isNaN(r) || r <= 0) return 'Total rooms must be a positive number.';
    const f = floors.trim() ? parseInt(floors, 10) : 1;
    if (isNaN(f) || f <= 0) return 'Number of floors must be a positive number.';
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const err = validate();
    if (err) {
      setError(err);
      return;
    }

    const fullAddress = [
      address.trim(),
      city.trim(),
      stateName.trim(),
      pincode.trim() ? `PIN: ${pincode.trim()}` : '',
    ].filter(Boolean).join(', ');

    try {
      setLoading(true);

      // Attempt Supabase backend registration
      try {
        if (password) {
          const { data: authData, error: authError } = await supabase.auth.signUp({
            email: ownerEmail.trim(),
            password,
            options: {
              data: {
                full_name: ownerName.trim(),
                mobile: ownerMobile.replace(/\D/g, ''),
              },
            },
          });

          if (authError && !authError.message.includes('already registered')) {
            console.warn('Supabase auth error:', authError);
          }

          let currentSession = authData?.session;

          if (!currentSession) {
            const { data: loginData } = await supabase.auth.signInWithPassword({
              email: ownerEmail.trim(),
              password,
            });
            currentSession = loginData?.session ?? null;
          }

          if (currentSession) {
            await supabase.rpc('register_new_hotel', {
              p_hotel_name: hotelName.trim(),
              p_owner_name: ownerName.trim(),
              p_mobile: ownerMobile.replace(/\D/g, ''),
              p_address: fullAddress || address.trim(),
              p_total_rooms: parseInt(totalRooms, 10),
              p_number_of_floors: floors.trim() ? parseInt(floors, 10) : 1,
            });
          }
        }
      } catch (backendErr) {
        console.warn('Supabase registration fallback to local demo session:', backendErr);
      }

      // Store local demo user registration info matching Hotel Onboarding schema
      try {
        localStorage.setItem(
          'hotelmantri_demo_user',
          JSON.stringify({
            email: ownerEmail.trim(),
            fullName: ownerName.trim(),
            hotelName: hotelName.trim(),
            propertyCode: propertyCode.trim() || 'HM-101',
            city: city.trim(),
            stateName: stateName.trim(),
            address: fullAddress || address.trim(),
            pincode: pincode.trim(),
            mobile: ownerMobile.replace(/\D/g, ''),
            totalRooms: parseInt(totalRooms, 10),
            floors: floors.trim() ? parseInt(floors, 10) : 1,
          }),
        );
      } catch {
        // Ignore localStorage error
      }

      setLoading(false);
      onOnboardingSuccess();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Hotel onboarding failed. Please try again.';
      setError(msg);
      setLoading(false);
    }
  };

  return (
    <div className="relative h-screen w-screen flex items-center justify-center lg:justify-end bg-[#06152F] font-sans antialiased overflow-hidden select-none">
      {/* Background Image */}
      <img
        src="/signup_bg_image.png"
        alt="HotelMantri Hotel Onboarding"
        className="absolute inset-0 w-full h-full object-cover object-left lg:object-center pointer-events-none z-0"
      />

      {/* Mobile Dark Backdrop Overlay */}
      <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm lg:hidden pointer-events-none z-0" />

      {/* Right Column: Hotel Onboarding Card Overlay */}
      <div className="relative z-10 w-full lg:w-[45%] xl:w-[42%] h-full flex flex-col justify-center items-center p-4 sm:p-6 lg:mr-8 xl:mr-16">
        <div className="w-full max-w-[420px]">
          <div className="bg-white rounded-[24px] shadow-[0_20px_50px_-12px_rgba(26,104,251,0.14)] p-6 sm:p-7 border border-blue-50/80 transition-all duration-300">
            
            {/* Header & Back Button */}
            <div className="flex items-center justify-between mb-5 pb-3 border-b border-slate-100">
              <button
                type="button"
                onClick={onNavigateBack}
                className="w-10 h-10 flex items-center justify-center text-slate-500 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer"
                aria-label="Back to OTP Verification"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-1.5 text-xs font-extrabold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>OTP Verified</span>
              </div>
            </div>

            {/* Title */}
            <div className="mb-5">
              <h2 className="text-2xl font-black text-slate-900 tracking-tight leading-tight">
                Hotel Onboarding
              </h2>
              <p className="text-slate-500 text-xs sm:text-sm mt-0.5 font-medium">
                Step 3 of 4: Enter your property details
              </p>
            </div>

            {/* Error Banner */}
            {error && (
              <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-600 text-xs sm:text-sm font-medium rounded-2xl p-3 mb-4 animate-fade-in" role="alert">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                <span>{error}</span>
              </div>
            )}

            {/* Verified Owner Summary Card */}
            <div className="bg-[#f4f8ff] border border-[#dce7fa] rounded-xl p-3 mb-4 flex items-center justify-between">
              <div>
                <span className="block text-[9px] font-bold text-[#1a68fb] uppercase tracking-wider">
                  Verified Owner / Admin
                </span>
                <p className="font-extrabold text-slate-900 text-xs mt-0.5">{ownerName}</p>
                <p className="text-slate-500 text-[11px] font-medium">{ownerEmail} • +91 {ownerMobile}</p>
              </div>
              <span className="text-[10px] font-extrabold text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-md">
                Verified
              </span>
            </div>

            <form onSubmit={handleSubmit} className="space-y-2.5">
              {/* Hotel Name & Property Code Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="sm:col-span-2 bg-[#f4f8ff] border border-[#dce7fa] focus-within:border-[#1a68fb] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#1a68fb]/20 rounded-xl px-3 py-1.5 h-[48px] transition-all duration-200 flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-[#1a68fb] shrink-0" />
                  <div className="flex-1 min-w-0">
                    <label htmlFor="onboard-hotel-name" className="block text-[9px] font-bold text-[#1a68fb] uppercase tracking-wider cursor-pointer">
                      Hotel Name
                    </label>
                    <input
                      id="onboard-hotel-name"
                      type="text"
                      value={hotelName}
                      onChange={(e) => setHotelName(e.target.value)}
                      placeholder="Hotel Royal Palace"
                      required
                      className="w-full bg-transparent text-slate-900 font-semibold text-xs outline-none border-none p-0 placeholder:text-slate-400/70"
                    />
                  </div>
                </div>

                <div className="bg-[#f4f8ff] border border-[#dce7fa] focus-within:border-[#1a68fb] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#1a68fb]/20 rounded-xl px-3 py-1.5 h-[48px] transition-all duration-200 flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <label htmlFor="onboard-prop-code" className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider cursor-pointer">
                      Prop Code
                    </label>
                    <input
                      id="onboard-prop-code"
                      type="text"
                      value={propertyCode}
                      onChange={(e) => setPropertyCode(e.target.value)}
                      placeholder="HM-101"
                      className="w-full bg-transparent text-slate-900 font-semibold text-xs outline-none border-none p-0 placeholder:text-slate-400/70"
                    />
                  </div>
                </div>
              </div>

              {/* City & State Grid */}
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-[#f4f8ff] border border-[#dce7fa] focus-within:border-[#1a68fb] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#1a68fb]/20 rounded-xl px-3 py-1.5 h-[48px] transition-all duration-200 flex items-center gap-2">
                  <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <label htmlFor="onboard-city" className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider cursor-pointer">
                      City
                    </label>
                    <input
                      id="onboard-city"
                      type="text"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="Jaipur"
                      className="w-full bg-transparent text-slate-900 font-semibold text-xs outline-none border-none p-0 placeholder:text-slate-400/70"
                    />
                  </div>
                </div>

                <div className="bg-[#f4f8ff] border border-[#dce7fa] focus-within:border-[#1a68fb] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#1a68fb]/20 rounded-xl px-3 py-1.5 h-[48px] transition-all duration-200 flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <label htmlFor="onboard-state" className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider cursor-pointer">
                      State
                    </label>
                    <input
                      id="onboard-state"
                      type="text"
                      value={stateName}
                      onChange={(e) => setStateName(e.target.value)}
                      placeholder="Rajasthan"
                      className="w-full bg-transparent text-slate-900 font-semibold text-xs outline-none border-none p-0 placeholder:text-slate-400/70"
                    />
                  </div>
                </div>
              </div>

              {/* Full Address & PIN Code Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="sm:col-span-2 bg-[#f4f8ff] border border-[#dce7fa] focus-within:border-[#1a68fb] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#1a68fb]/20 rounded-xl px-3 py-1.5 h-[48px] transition-all duration-200 flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <label htmlFor="onboard-address" className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider cursor-pointer">
                      Full Address
                    </label>
                    <input
                      id="onboard-address"
                      type="text"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="MG Road, Civil Lines"
                      className="w-full bg-transparent text-slate-900 font-semibold text-xs outline-none border-none p-0 placeholder:text-slate-400/70"
                    />
                  </div>
                </div>

                <div className="bg-[#f4f8ff] border border-[#dce7fa] focus-within:border-[#1a68fb] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#1a68fb]/20 rounded-xl px-3 py-1.5 h-[48px] transition-all duration-200 flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <label htmlFor="onboard-pincode" className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider cursor-pointer">
                      PIN Code
                    </label>
                    <input
                      id="onboard-pincode"
                      type="text"
                      value={pincode}
                      onChange={(e) => setPincode(e.target.value)}
                      placeholder="302001"
                      maxLength={6}
                      className="w-full bg-transparent text-slate-900 font-semibold text-xs outline-none border-none p-0 placeholder:text-slate-400/70"
                    />
                  </div>
                </div>
              </div>

              {/* Total Rooms & Floors Grid */}
              <div className="grid grid-cols-2 gap-2">
                <label
                  htmlFor="onboard-rooms"
                  className="bg-[#f4f8ff] border border-[#dce7fa] focus-within:border-[#1a68fb] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#1a68fb]/20 rounded-xl px-3 py-1.5 h-[48px] transition-all duration-200 flex items-center gap-2 cursor-pointer"
                >
                  <Hash className="w-3.5 h-3.5 text-[#1a68fb] shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="block text-[9px] font-bold text-[#1a68fb] uppercase tracking-wider">
                      Total Rooms
                    </span>
                    <input
                      id="onboard-rooms"
                      type="number"
                      min="1"
                      value={totalRooms}
                      onChange={(e) => setTotalRooms(e.target.value)}
                      placeholder="25"
                      required
                      className="w-full bg-transparent text-slate-900 font-semibold text-xs outline-none border-none p-0 placeholder:text-slate-400/70 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </div>
                </label>

                <label
                  htmlFor="onboard-floors"
                  className="bg-[#f4f8ff] border border-[#dce7fa] focus-within:border-[#1a68fb] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#1a68fb]/20 rounded-xl px-3 py-1.5 h-[48px] transition-all duration-200 flex items-center gap-2 cursor-pointer"
                >
                  <Layers className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                      Floors (Opt)
                    </span>
                    <input
                      id="onboard-floors"
                      type="number"
                      min="1"
                      value={floors}
                      onChange={(e) => setFloors(e.target.value)}
                      placeholder="3"
                      className="w-full bg-transparent text-slate-900 font-semibold text-xs outline-none border-none p-0 placeholder:text-slate-400/70 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </div>
                </label>
              </div>

              {/* Complete Setup & Proceed to Payment Button */}
              <button
                type="submit"
                disabled={loading}
                className="group w-full mt-2 bg-[#1a68fb] hover:bg-blue-600 active:bg-blue-700 disabled:opacity-80 text-white font-extrabold h-[48px] rounded-xl shadow-md shadow-blue-500/25 transition-all duration-200 flex items-center justify-center gap-2 text-xs sm:text-sm cursor-pointer transform hover:-translate-y-0.5"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Saving Hotel Setup…
                  </>
                ) : (
                  <>
                    <span>Complete Setup & Proceed to Payment</span>
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
