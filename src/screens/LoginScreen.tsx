import { useState, useRef, useEffect } from 'react';
import { Mail, Lock, AlertCircle, ArrowLeft, Loader2, Eye, EyeOff, Check } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { BrandLogo } from '@/components/BrandLogo';
import { HotelScene } from '@/components/HotelScene';

interface LoginScreenProps {
  onAuthSuccess: () => void;
}

export const LoginScreen = ({ onAuthSuccess: _onAuthSuccess }: LoginScreenProps) => {
  const { signIn, resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'login' | 'forgot'>('login');
  const [resetSent, setResetSent] = useState(false);
  const [ripple, setRipple] = useState<{ x: number; y: number; id: number } | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => { emailRef.current?.focus(); }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) { setError('Enter email and password.'); return; }
    try {
      setLoading(true);
      await signIn(email.trim(), password);
      setSuccess(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Login failed';
      setError(msg.includes('Invalid login') ? 'Invalid email or password.' : msg);
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim()) { setError('Enter your email address.'); return; }
    try {
      setLoading(true);
      await resetPassword(email.trim());
      setResetSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send reset email');
    } finally {
      setLoading(false);
    }
  };

  const handleRipple = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setRipple({ x: e.clientX - rect.left, y: e.clientY - rect.top, id: Date.now() });
  };

  // Floating particles
  const particles = Array.from({ length: 18 }, (_, i) => ({
    left: `${(i * 5.5 + 3) % 100}%`,
    delay: `${(i * 1.7) % 20}s`,
    duration: `${18 + (i % 6) * 3}s`,
    size: 2 + (i % 3),
  }));

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0a1628] flex flex-col lg:flex-row">
      {/* ===== Animated background ===== */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Mesh gradient base */}
        <div className="absolute inset-0 login-mesh" style={{
          background: 'radial-gradient(at 20% 30%, rgba(30,58,95,0.6) 0%, transparent 50%), radial-gradient(at 80% 70%, rgba(37,99,235,0.25) 0%, transparent 50%), radial-gradient(at 50% 100%, rgba(15,23,42,0.8) 0%, transparent 60%)',
        }} />
        {/* Glow orbs */}
        <div className="absolute top-10 left-1/4 w-96 h-96 rounded-full opacity-30 blur-3xl login-mesh" style={{ background: 'radial-gradient(circle, rgba(59,130,246,0.4), transparent 70%)' }} />
        <div className="absolute bottom-0 right-1/4 w-80 h-80 rounded-full opacity-20 blur-3xl login-mesh" style={{ background: 'radial-gradient(circle, rgba(251,191,36,0.25), transparent 70%)', animationDelay: '4s' }} />
        {/* Dot grid */}
        <div className="absolute inset-0 opacity-[0.05]" style={{ backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
        {/* Particles */}
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
              Hospitality, <span className="text-blue-400">reimagined.</span>
            </h1>
            <p className="text-slate-400 text-base leading-relaxed">
              Manage rooms, revenue, staff, and guest experiences — all from one elegant dashboard built for modern Indian hotels.
            </p>
          </div>
          <div className="relative">
            <div className="absolute inset-0 bg-blue-500/5 rounded-3xl blur-2xl" />
            <HotelScene />
          </div>
          {/* Feature pills */}
          <div className="flex flex-wrap gap-2 mt-6">
            {['Room Management', 'Finance & GST', 'Reports', 'WhatsApp Billing'].map((f) => (
              <span key={f} className="px-3 py-1.5 rounded-full text-xs font-medium text-blue-200 bg-white/5 border border-white/10 backdrop-blur-sm">
                {f}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ===== Right: Login form ===== */}
      <div className="flex-1 lg:w-[45%] relative z-10 flex items-center justify-center p-5 sm:p-8">
        <div className="w-full max-w-[420px]">
          {/* Mobile scene (compact) */}
          <div className="lg:hidden mb-4 max-h-44 overflow-hidden login-fade-in">
            <HotelScene />
          </div>

          {/* Logo */}
          <div className="flex justify-center mb-4 login-logo-fade">
            <div className="bg-white rounded-2xl p-3.5 shadow-xl shadow-blue-900/30">
              <BrandLogo variant="login" />
            </div>
          </div>

          {/* Brand name + tagline */}
          <div className="text-center mb-6 login-fade-in" style={{ animationDelay: '0.1s' }}>
            <h1 className="text-xl font-bold text-white tracking-tight">Hotel Mantri</h1>
            <p className="text-blue-300/70 text-sm mt-1">Hospitality Management Platform</p>
          </div>

          {/* Glass card */}
          <div className="login-card-slide rounded-[24px] p-8 sm:p-10 backdrop-blur-xl border border-white/10"
            style={{
              background: 'rgba(255,255,255,0.05)',
              boxShadow: '0 24px 70px -12px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.06) inset',
            }}>
            {mode === 'login' ? (
              <>
                <h2 className="text-lg font-bold text-white tracking-tight mb-1">Welcome back</h2>
                <p className="text-slate-400 text-sm mb-5">Sign in to your dashboard</p>

                {error && (
                  <div className="flex items-center gap-2 bg-red-500/10 border border-red-400/20 text-red-300 text-sm rounded-xl p-3 mb-4 login-fade-in">
                    <AlertCircle className="w-4 h-4 shrink-0" /> {error}
                  </div>
                )}

                <form onSubmit={handleLogin} className="space-y-4">
                  {/* Email */}
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
                    <input
                      ref={emailRef} type="email" value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder=" "
                      autoComplete="email" aria-label="Email address"
                      className="peer w-full pl-11 pr-4 pt-5 pb-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition placeholder:text-transparent" />
                    <span className="login-float-label peer-focus:top-2 peer-focus:text-[0.6875rem] peer-focus:font-semibold peer-focus:uppercase peer-focus:tracking-wider peer-focus:text-blue-400 peer-[:not(:placeholder-shown)]:top-2 peer-[:not(:placeholder-shown)]:text-[0.6875rem] peer-[:not(:placeholder-shown)]:font-semibold peer-[:not(:placeholder-shown)]:uppercase peer-[:not(:placeholder-shown)]:tracking-wider peer-[:not(:placeholder-shown)]:text-blue-400">Email address</span>
                  </div>

                  {/* Password */}
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
                    <input
                      type={showPassword ? 'text' : 'password'} value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder=" "
                      autoComplete="current-password" aria-label="Password"
                      className="peer w-full pl-11 pr-11 pt-5 pb-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition placeholder:text-transparent" />
                    <span className="login-float-label peer-focus:top-2 peer-focus:text-[0.6875rem] peer-focus:font-semibold peer-focus:uppercase peer-focus:tracking-wider peer-focus:text-blue-400 peer-[:not(:placeholder-shown)]:top-2 peer-[:not(:placeholder-shown)]:text-[0.6875rem] peer-[:not(:placeholder-shown)]:font-semibold peer-[:not(:placeholder-shown)]:uppercase peer-[:not(:placeholder-shown)]:tracking-wider peer-[:not(:placeholder-shown)]:text-blue-400">Password</span>
                    <button type="button" onClick={() => setShowPassword(v => !v)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition z-10">
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>

                  {/* Remember + Forgot */}
                  <div className="flex items-center justify-between text-sm">
                    <label className="flex items-center gap-2 cursor-pointer select-none group">
                      <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)}
                        className="w-4 h-4 rounded border-white/20 bg-white/5 text-blue-600 focus:ring-2 focus:ring-blue-500/50" />
                      <span className="text-slate-300 group-hover:text-white transition">Remember me</span>
                    </label>
                    <button type="button" onClick={() => { setMode('forgot'); setError(null); }}
                      className="text-blue-400 hover:text-blue-300 font-medium transition">
                      Forgot password?
                    </button>
                  </div>

                  {/* Sign in button */}
                  <button type="submit" disabled={loading || success} onClick={handleRipple}
                    aria-label="Sign in"
                    className="relative overflow-hidden w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-70 text-white font-semibold py-3.5 rounded-xl shadow-lg shadow-blue-500/30 hover:shadow-blue-400/50 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 flex items-center justify-center gap-2">
                    {ripple && (
                      <span key={ripple.id} className="absolute rounded-full bg-white/40 pointer-events-none"
                        style={{ left: ripple.x - 20, top: ripple.y - 20, width: 40, height: 40, animation: 'login-ripple 0.6s ease-out forwards' }} />
                    )}
                    {success ? (
                      <><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path className="login-check" d="M5 13l4 4L19 7" /></svg> Success</>
                    ) : loading ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Signing in…</>
                    ) : (
                      'Sign In'
                    )}
                  </button>
                </form>
              </>
            ) : (
              <>
                <button onClick={() => { setMode('login'); setError(null); setResetSent(false); }}
                  className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition mb-4">
                  <ArrowLeft className="w-4 h-4" /> Back to login
                </button>
                <h2 className="text-lg font-bold text-white tracking-tight mb-1">Reset Password</h2>
                <p className="text-slate-400 text-sm mb-5">We'll email you a reset link</p>

                {resetSent ? (
                  <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-400/20 text-emerald-300 text-sm rounded-xl p-3">
                    <Check className="w-4 h-4 shrink-0" /> Reset instructions sent to your email.
                  </div>
                ) : (
                  <>
                    {error && (
                      <div className="flex items-center gap-2 bg-red-500/10 border border-red-400/20 text-red-300 text-sm rounded-xl p-3 mb-4 login-fade-in">
                        <AlertCircle className="w-4 h-4 shrink-0" /> {error}
                      </div>
                    )}
                    <form onSubmit={handleForgot} className="space-y-4">
                      <div className="relative">
                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
                        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                          placeholder=" " aria-label="Email address"
                          className="peer w-full pl-11 pr-4 pt-5 pb-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition placeholder:text-transparent" />
                        <span className="login-float-label peer-focus:top-2 peer-focus:text-[0.6875rem] peer-focus:font-semibold peer-focus:uppercase peer-focus:tracking-wider peer-focus:text-blue-400 peer-[:not(:placeholder-shown)]:top-2 peer-[:not(:placeholder-shown)]:text-[0.6875rem] peer-[:not(:placeholder-shown)]:font-semibold peer-[:not(:placeholder-shown)]:uppercase peer-[:not(:placeholder-shown)]:tracking-wider peer-[:not(:placeholder-shown)]:text-blue-400">Email address</span>
                      </div>
                      <button type="submit" disabled={loading} onClick={handleRipple}
                        className="relative overflow-hidden w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-70 text-white font-semibold py-3.5 rounded-xl shadow-lg shadow-blue-500/30 hover:shadow-blue-400/50 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 flex items-center justify-center gap-2">
                        {ripple && (
                          <span key={ripple.id} className="absolute rounded-full bg-white/40 pointer-events-none"
                            style={{ left: ripple.x - 20, top: ripple.y - 20, width: 40, height: 40, animation: 'login-ripple 0.6s ease-out forwards' }} />
                        )}
                        {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</> : 'Send Reset Link'}
                      </button>
                    </form>
                  </>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <p className="text-center text-slate-500 text-xs mt-6 tracking-wide login-fade-in" style={{ animationDelay: '0.3s' }}>
            Secure access · Authorized personnel only
          </p>
        </div>
      </div>
    </div>
  );
};
