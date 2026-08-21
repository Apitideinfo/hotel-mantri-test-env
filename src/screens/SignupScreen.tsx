import { useState, useRef, useEffect } from 'react';
import { Mail, Lock, AlertCircle, ArrowLeft, Loader2, Eye, EyeOff, Check, User, Phone, Building, Building2, Hash, Layers } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { BrandLogo } from '@/components/BrandLogo';
import { HotelScene } from '@/components/HotelScene';

interface SignupScreenProps {
  onNavigateToLogin: () => void;
  onAuthSuccess: () => void;
}

export const SignupScreen = ({ onNavigateToLogin, onAuthSuccess }: SignupScreenProps) => {
  const [step, setStep] = useState<1 | 2>(1);
  // Personal Info
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  // Hotel Info
  const [hotelName, setHotelName] = useState('');
  const [address, setAddress] = useState('');
  const [floors, setFloors] = useState('');
  const [totalRooms, setTotalRooms] = useState('');

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ripple, setRipple] = useState<{ x: number; y: number; id: number } | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => { nameRef.current?.focus(); }, []);

  const handleRipple = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setRipple({ x: e.clientX - rect.left, y: e.clientY - rect.top, id: Date.now() });
  };

  const validateStep1 = () => {
    if (!fullName.trim()) return 'Please enter your full name.';
    if (!email.trim() || !/^\S+@\S+\.\S+$/.test(email)) return 'Please enter a valid email address.';
    if (!mobile.trim() || !/^\d{10}$/.test(mobile.replace(/\D/g, ''))) return 'Please enter a valid 10-digit mobile number.';
    if (!password || password.length < 6) return 'Password must be at least 6 characters.';
    if (password !== confirmPassword) return 'Passwords do not match.';
    return null;
  };

  const validateStep2 = () => {
    if (!hotelName.trim()) return 'Please enter a hotel name.';
    const f = parseInt(floors, 10);
    const r = parseInt(totalRooms, 10);
    if (isNaN(f) || f <= 0) return 'Number of floors must be a positive number.';
    if (isNaN(r) || r <= 0) return 'Total rooms must be a positive number.';
    return null;
  };

  const handleNext = () => {
    setError(null);
    const err = validateStep1();
    if (err) {
      setError(err);
      return;
    }
    setStep(2);
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    const err = validateStep2();
    if (err) {
      setError(err);
      return;
    }

    try {
      setLoading(true);

      // 1. Sign up user via Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullName.trim(),
            mobile: mobile.replace(/\D/g, ''),
          },
        },
      });

      if (authError) throw authError;

      let currentSession = authData.session;

      // If Supabase returned no session, try logging in immediately (in case our auto-confirm DB trigger activated)
      if (!currentSession) {
        const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        
        if (loginError) {
          // If login fails (meaning email confirmation is STILL strictly required), show the success message asking them to check email.
          setSuccess(true);
          setLoading(false);
          return;
        }
        currentSession = loginData.session;
      }

      // 2. Call RPC to create hotel and admin mapping
      // We are guaranteed to have a session here if the auto-confirm worked.
      const { data: hotelId, error: rpcError } = await supabase.rpc('register_new_hotel', {
        p_hotel_name: hotelName.trim(),
        p_owner_name: fullName.trim(),
        p_mobile: mobile.replace(/\D/g, ''),
        p_address: address.trim(),
        p_total_rooms: parseInt(totalRooms, 10),
        p_number_of_floors: parseInt(floors, 10),
      });

      if (rpcError) throw rpcError;

      // 3. Trigger app reload or success callback
      onAuthSuccess();

    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Registration failed. Please try again.';
      setError(msg);
      setLoading(false);
    }
  };

  // Floating particles
  const particles = Array.from({ length: 18 }, (_, i) => ({
    left: `${(i * 5.5 + 3) % 100}%`,
    delay: `${(i * 1.7) % 20}s`,
    duration: `${18 + (i % 6) * 3}s`,
    size: 2 + (i % 3),
  }));

  if (success) {
    return (
      <div className="min-h-screen bg-[#0a1628] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white/5 border border-white/10 rounded-[24px] p-8 text-center backdrop-blur-xl shadow-2xl">
          <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-6">
            <Check className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Registration Successful</h2>
          <p className="text-slate-400 mb-8">
            Your account has been created successfully. Please check your email inbox to verify your account before logging in.
          </p>
          <button onClick={onNavigateToLogin} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3.5 rounded-xl transition-all">
            Return to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0a1628] flex flex-col lg:flex-row">
      {/* ===== Animated background ===== */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 login-mesh" style={{
          background: 'radial-gradient(at 20% 30%, rgba(30,58,95,0.6) 0%, transparent 50%), radial-gradient(at 80% 70%, rgba(37,99,235,0.25) 0%, transparent 50%), radial-gradient(at 50% 100%, rgba(15,23,42,0.8) 0%, transparent 60%)',
        }} />
        <div className="absolute top-10 left-1/4 w-96 h-96 rounded-full opacity-30 blur-3xl login-mesh" style={{ background: 'radial-gradient(circle, rgba(59,130,246,0.4), transparent 70%)' }} />
        <div className="absolute bottom-0 right-1/4 w-80 h-80 rounded-full opacity-20 blur-3xl login-mesh" style={{ background: 'radial-gradient(circle, rgba(251,191,36,0.25), transparent 70%)', animationDelay: '4s' }} />
        <div className="absolute inset-0 opacity-[0.05]" style={{ backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
        {particles.map((p, i) => (
          <div key={i} className="absolute rounded-full bg-blue-300/40" style={{
            left: p.left, bottom: '-10px', width: p.size, height: p.size,
            animation: `login-particle ${p.duration} linear ${p.delay} infinite`,
          }} />
        ))}
      </div>

      {/* ===== Left: Animated hotel scene (desktop) ===== */}
      <div className="hidden lg:flex lg:w-[55%] relative z-10 items-center justify-center p-12">
        <div className="w-full max-w-lg login-fade-in">
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-white tracking-tight mb-2">
              Start your <span className="text-blue-400">journey.</span>
            </h1>
            <p className="text-slate-400 text-base leading-relaxed">
              Create your free Hotel Mantri account in minutes and transform the way you manage your property.
            </p>
          </div>
          <div className="relative">
            <div className="absolute inset-0 bg-blue-500/5 rounded-3xl blur-2xl" />
            <HotelScene />
          </div>
        </div>
      </div>

      {/* ===== Right: Signup form ===== */}
      <div className="flex-1 lg:w-[45%] relative z-10 flex items-center justify-center p-5 sm:p-8">
        <div className="w-full max-w-[420px]">
          {/* Logo */}
          <div className="flex justify-center mb-4 login-logo-fade lg:hidden">
            <div className="bg-white rounded-2xl p-3.5 shadow-xl shadow-blue-900/30">
              <BrandLogo variant="login" />
            </div>
          </div>

          <div className="login-card-slide rounded-[24px] p-8 sm:p-10 backdrop-blur-xl border border-white/10"
            style={{
              background: 'rgba(255,255,255,0.05)',
              boxShadow: '0 24px 70px -12px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.06) inset',
            }}>
            
            <div className="flex items-center gap-3 mb-6">
              {step === 2 && (
                <button onClick={() => setStep(1)} className="p-1 text-slate-400 hover:text-white transition">
                  <ArrowLeft className="w-5 h-5" />
                </button>
              )}
              <div>
                <h2 className="text-lg font-bold text-white tracking-tight leading-tight">Create Account</h2>
                <p className="text-slate-400 text-sm">{step === 1 ? 'Personal Information' : 'Hotel Information'}</p>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 bg-red-500/10 border border-red-400/20 text-red-300 text-sm rounded-xl p-3 mb-5 login-fade-in">
                <AlertCircle className="w-4 h-4 shrink-0" /> {error}
              </div>
            )}

            <form onSubmit={step === 1 ? (e) => { e.preventDefault(); handleNext(); } : handleSignup} className="space-y-4">
              
              {step === 1 && (
                <div className="space-y-4 login-fade-in">
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
                    <input ref={nameRef} type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder=" " className="peer w-full pl-11 pr-4 pt-5 pb-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition placeholder:text-transparent" />
                    <span className="login-float-label peer-focus:top-2 peer-focus:text-[0.6875rem] peer-focus:font-semibold peer-focus:uppercase peer-focus:tracking-wider peer-focus:text-blue-400 peer-[:not(:placeholder-shown)]:top-2 peer-[:not(:placeholder-shown)]:text-[0.6875rem] peer-[:not(:placeholder-shown)]:font-semibold peer-[:not(:placeholder-shown)]:uppercase peer-[:not(:placeholder-shown)]:text-blue-400">Full Name</span>
                  </div>

                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder=" " className="peer w-full pl-11 pr-4 pt-5 pb-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition placeholder:text-transparent" />
                    <span className="login-float-label peer-focus:top-2 peer-focus:text-[0.6875rem] peer-focus:font-semibold peer-focus:uppercase peer-focus:tracking-wider peer-focus:text-blue-400 peer-[:not(:placeholder-shown)]:top-2 peer-[:not(:placeholder-shown)]:text-[0.6875rem] peer-[:not(:placeholder-shown)]:font-semibold peer-[:not(:placeholder-shown)]:uppercase peer-[:not(:placeholder-shown)]:text-blue-400">Email Address</span>
                  </div>

                  <div className="relative">
                    <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
                    <input type="tel" value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder=" " className="peer w-full pl-11 pr-4 pt-5 pb-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition placeholder:text-transparent" />
                    <span className="login-float-label peer-focus:top-2 peer-focus:text-[0.6875rem] peer-focus:font-semibold peer-focus:uppercase peer-focus:tracking-wider peer-focus:text-blue-400 peer-[:not(:placeholder-shown)]:top-2 peer-[:not(:placeholder-shown)]:text-[0.6875rem] peer-[:not(:placeholder-shown)]:font-semibold peer-[:not(:placeholder-shown)]:uppercase peer-[:not(:placeholder-shown)]:text-blue-400">Mobile Number (10 digits)</span>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
                      <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder=" " className="peer w-full pl-11 pr-4 pt-5 pb-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition placeholder:text-transparent" />
                      <span className="login-float-label peer-focus:top-2 peer-focus:text-[0.6875rem] peer-focus:font-semibold peer-focus:uppercase peer-focus:tracking-wider peer-focus:text-blue-400 peer-[:not(:placeholder-shown)]:top-2 peer-[:not(:placeholder-shown)]:text-[0.6875rem] peer-[:not(:placeholder-shown)]:font-semibold peer-[:not(:placeholder-shown)]:uppercase peer-[:not(:placeholder-shown)]:text-blue-400">Password</span>
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
                      <input type={showPassword ? 'text' : 'password'} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder=" " className="peer w-full pl-11 pr-4 pt-5 pb-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition placeholder:text-transparent" />
                      <span className="login-float-label peer-focus:top-2 peer-focus:text-[0.6875rem] peer-focus:font-semibold peer-focus:uppercase peer-focus:tracking-wider peer-focus:text-blue-400 peer-[:not(:placeholder-shown)]:top-2 peer-[:not(:placeholder-shown)]:text-[0.6875rem] peer-[:not(:placeholder-shown)]:font-semibold peer-[:not(:placeholder-shown)]:uppercase peer-[:not(:placeholder-shown)]:text-blue-400">Confirm</span>
                    </div>
                  </div>

                  <button type="button" onClick={() => setShowPassword(v => !v)} className="text-xs text-slate-400 hover:text-white transition flex items-center gap-1.5 ml-1 mt-1">
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />} {showPassword ? 'Hide' : 'Show'} Password
                  </button>

                  <button type="submit" onClick={handleRipple} className="relative overflow-hidden w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-70 text-white font-semibold py-3.5 mt-2 rounded-xl shadow-lg shadow-blue-500/30 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200">
                    Continue to Hotel Info
                  </button>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-4 login-fade-in">
                  <div className="relative">
                    <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
                    <input type="text" required value={hotelName} onChange={(e) => setHotelName(e.target.value)} placeholder=" " className="peer w-full pl-11 pr-4 pt-5 pb-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition placeholder:text-transparent" />
                    <span className="login-float-label peer-focus:top-2 peer-focus:text-[0.6875rem] peer-focus:font-semibold peer-focus:uppercase peer-focus:tracking-wider peer-focus:text-blue-400 peer-[:not(:placeholder-shown)]:top-2 peer-[:not(:placeholder-shown)]:text-[0.6875rem] peer-[:not(:placeholder-shown)]:font-semibold peer-[:not(:placeholder-shown)]:uppercase peer-[:not(:placeholder-shown)]:text-blue-400">Hotel Name</span>
                  </div>

                  <div className="relative">
                    <input type="text" required value={address} onChange={(e) => setAddress(e.target.value)} placeholder=" " className="peer w-full px-4 pt-5 pb-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition placeholder:text-transparent" />
                    <span className="login-float-label peer-focus:top-2 peer-focus:text-[0.6875rem] peer-focus:font-semibold peer-focus:uppercase peer-focus:tracking-wider peer-focus:text-blue-400 peer-[:not(:placeholder-shown)]:top-2 peer-[:not(:placeholder-shown)]:text-[0.6875rem] peer-[:not(:placeholder-shown)]:font-semibold peer-[:not(:placeholder-shown)]:uppercase peer-[:not(:placeholder-shown)]:text-blue-400">Address</span>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="relative">
                      <Layers className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
                      <input type="number" min="1" value={floors} onChange={(e) => setFloors(e.target.value)} placeholder=" " className="peer w-full pl-11 pr-4 pt-5 pb-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition placeholder:text-transparent" />
                      <span className="login-float-label peer-focus:top-2 peer-focus:text-[0.6875rem] peer-focus:font-semibold peer-focus:uppercase peer-focus:tracking-wider peer-focus:text-blue-400 peer-[:not(:placeholder-shown)]:top-2 peer-[:not(:placeholder-shown)]:text-[0.6875rem] peer-[:not(:placeholder-shown)]:font-semibold peer-[:not(:placeholder-shown)]:uppercase peer-[:not(:placeholder-shown)]:text-blue-400">Total Floors</span>
                    </div>
                    <div className="relative">
                      <Hash className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
                      <input type="number" min="1" value={totalRooms} onChange={(e) => setTotalRooms(e.target.value)} placeholder=" " className="peer w-full pl-11 pr-4 pt-5 pb-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition placeholder:text-transparent" />
                      <span className="login-float-label peer-focus:top-2 peer-focus:text-[0.6875rem] peer-focus:font-semibold peer-focus:uppercase peer-focus:tracking-wider peer-focus:text-blue-400 peer-[:not(:placeholder-shown)]:top-2 peer-[:not(:placeholder-shown)]:text-[0.6875rem] peer-[:not(:placeholder-shown)]:font-semibold peer-[:not(:placeholder-shown)]:uppercase peer-[:not(:placeholder-shown)]:text-blue-400">Total Rooms</span>
                    </div>
                  </div>

                  <button type="submit" disabled={loading} onClick={handleRipple} className="relative overflow-hidden w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-70 text-white font-semibold py-3.5 mt-2 rounded-xl shadow-lg shadow-blue-500/30 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 flex items-center justify-center gap-2">
                    {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating Account…</> : 'Complete Registration'}
                  </button>
                </div>
              )}

            </form>

            <div className="mt-6 text-center">
              <button type="button" onClick={onNavigateToLogin} className="text-slate-400 hover:text-white text-sm transition">
                Already have an account? <span className="text-blue-400 font-medium">Login</span>
              </button>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};
