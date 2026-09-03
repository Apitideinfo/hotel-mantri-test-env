import React, { useState, useRef, useEffect } from 'react';
import { Mail, Lock, AlertCircle, ArrowLeft, Loader2, Eye, EyeOff, Check, ShieldCheck, ArrowRight } from 'lucide-react';
import { Logo } from './Logo';

interface AuthCardProps {
  onLogin: (email: string, pass: string) => Promise<void>;
  onForgot: (email: string) => Promise<void>;
  onNavigateToSignup?: () => void;
  loading: boolean;
  success: boolean;
  error: string | null;
  setError: (msg: string | null) => void;
}

export const AuthCard: React.FC<AuthCardProps> = ({
  onLogin,
  onForgot,
  onNavigateToSignup,
  loading,
  success,
  error,
  setError,
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [mode, setMode] = useState<'login' | 'forgot'>('login');
  const [resetSent, setResetSent] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    emailRef.current?.focus();
  }, [mode]);

  const handleSubmitLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase().replace(/,/g, '.');
    if (!cleanEmail || !password) {
      setError('Please enter your email address and password.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError('Please enter a valid email address (e.g. name@domain.com).');
      return;
    }
    await onLogin(cleanEmail, password);
  };

  const handleSubmitForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase().replace(/,/g, '.');
    if (!cleanEmail) {
      setError('Please enter your email address.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError('Please enter a valid email address (e.g. name@domain.com).');
      return;
    }
    await onForgot(cleanEmail);
    setResetSent(true);
  };

  return (
    <div className="w-full flex flex-col justify-center items-center relative select-none">
      <div className="w-full max-w-[410px]">
        {/* Main White Authentication Card */}
        <div className="bg-white rounded-[24px] shadow-[0_20px_50px_-12px_rgba(26,104,251,0.14)] p-6 sm:p-8 border border-blue-50/80 transition-all duration-300">
          {/* Centered Brand Logo */}
          <div className="flex justify-center mb-5">
            <Logo />
          </div>

          {mode === 'login' ? (
            <>
              {/* Form Header */}
              <div className="text-left mb-5">
                <h2 className="text-2xl font-black text-slate-900 tracking-tight">Welcome back</h2>
                <p className="text-slate-500 text-xs sm:text-sm mt-0.5 font-medium">Sign in to your dashboard</p>
              </div>

              {/* Error Banner */}
              {error && (
                <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-600 text-xs sm:text-sm font-medium rounded-xl p-3 mb-4 animate-fade-in" role="alert">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmitLogin} className="space-y-3.5">
                {/* 52px Email Input Container */}
                <div className="bg-[#f4f8ff] border border-[#dce7fa] focus-within:border-[#1a68fb] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#1a68fb]/20 rounded-xl px-3.5 py-2 h-[52px] transition-all duration-200 flex items-center gap-3">
                  <div className="text-[#1a68fb] shrink-0">
                    <Mail className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <label htmlFor="auth-email-input" className="block text-[10px] font-bold text-[#1a68fb] uppercase tracking-wider cursor-pointer">
                      Email Address
                    </label>
                    <input
                      id="auth-email-input"
                      ref={emailRef}
                      type="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value.replace(/,/g, '.'));
                        if (error) setError(null);
                      }}
                      placeholder="admin@gmail.com"
                      required
                      autoComplete="email"
                      className="w-full bg-transparent text-slate-900 font-semibold text-xs sm:text-sm outline-none border-none p-0 placeholder:text-slate-400/70"
                    />
                  </div>
                </div>

                {/* 52px Password Input Container */}
                <div className="bg-[#f4f8ff] border border-[#dce7fa] focus-within:border-[#1a68fb] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#1a68fb]/20 rounded-xl px-3.5 py-2 h-[52px] transition-all duration-200 flex items-center gap-3">
                  <div className="text-slate-400 shrink-0">
                    <Lock className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <label htmlFor="auth-password-input" className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider cursor-pointer">
                      Password
                    </label>
                    <input
                      id="auth-password-input"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      autoComplete="current-password"
                      className="w-full bg-transparent text-slate-900 font-semibold text-xs sm:text-sm outline-none border-none p-0 placeholder:text-slate-400/70"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="w-9 h-9 flex items-center justify-center text-slate-400 hover:text-slate-600 transition rounded-lg focus:outline-none"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {/* Remember Me & Forgot Password Options */}
                <div className="flex items-center justify-between text-xs sm:text-sm pt-0.5">
                  <label className="flex items-center gap-2 cursor-pointer select-none group">
                    <input
                      type="checkbox"
                      checked={remember}
                      onChange={(e) => setRemember(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-[#1a68fb] focus:ring-[#1a68fb]/30 accent-[#1a68fb] cursor-pointer"
                    />
                    <span className="text-slate-600 font-medium group-hover:text-slate-900 transition">
                      Remember me
                    </span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('forgot');
                      setError(null);
                    }}
                    className="text-[#1a68fb] hover:text-blue-700 font-semibold transition cursor-pointer"
                  >
                    Forgot password?
                  </button>
                </div>

                {/* Primary 50px Sign In Button */}
                <button
                  type="submit"
                  disabled={loading || success}
                  className="group w-full mt-1 bg-[#1a68fb] hover:bg-blue-600 active:bg-blue-700 disabled:opacity-70 text-white font-extrabold h-[50px] rounded-xl shadow-md shadow-blue-500/25 transition-all duration-200 flex items-center justify-center gap-2 text-sm sm:text-base cursor-pointer transform hover:-translate-y-0.5"
                >
                  {success ? (
                    <>
                      <Check className="w-4 h-4" /> Success
                    </>
                  ) : loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Signing in…
                    </>
                  ) : (
                    <>
                      <span>Sign In</span>
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-200" />
                    </>
                  )}
                </button>
              </form>

              {/* OR Divider */}
              <div className="relative my-5 text-center">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200/80" />
                </div>
                <span className="relative bg-white px-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  OR
                </span>
              </div>

              {/* Sign Up Navigation */}
              {onNavigateToSignup && (
                <div className="text-center">
                  <p className="text-slate-500 text-xs sm:text-sm font-medium">
                    Don't have an account?{' '}
                    <button
                      type="button"
                      onClick={onNavigateToSignup}
                      className="text-[#1a68fb] font-bold hover:underline cursor-pointer ml-1"
                    >
                      Sign Up
                    </button>
                  </p>
                </div>
              )}
            </>
          ) : (
            /* Forgot Password Flow */
            <>
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError(null);
                  setResetSent(false);
                }}
                className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 transition mb-3 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back to login
              </button>
              <div className="text-left mb-5">
                <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Reset Password</h2>
                <p className="text-slate-500 text-xs sm:text-sm mt-0.5">We'll email you a link to reset your password.</p>
              </div>

              {resetSent ? (
                <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs sm:text-sm font-medium rounded-xl p-3.5">
                  <Check className="w-4 h-4 shrink-0 text-emerald-600" />
                  <span>Reset instructions sent to your email.</span>
                </div>
              ) : (
                <>
                  {error && (
                    <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-600 text-xs sm:text-sm font-medium rounded-xl p-3 mb-4" role="alert">
                      <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                      <span>{error}</span>
                    </div>
                  )}
                  <form onSubmit={handleSubmitForgot} className="space-y-3.5">
                    <div className="bg-[#f4f8ff] border border-[#dce7fa] focus-within:border-[#1a68fb] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#1a68fb]/20 rounded-xl px-3.5 py-2 h-[52px] transition-all duration-200 flex items-center gap-3">
                      <div className="text-[#1a68fb] shrink-0">
                        <Mail className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <label htmlFor="reset-email-input" className="block text-[10px] font-bold text-[#1a68fb] uppercase tracking-wider cursor-pointer">
                          Email Address
                        </label>
                        <input
                          id="reset-email-input"
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="admin@gmail.com"
                          required
                          className="w-full bg-transparent text-slate-900 font-semibold text-xs sm:text-sm outline-none border-none p-0 placeholder:text-slate-400/70"
                        />
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full bg-[#1a68fb] hover:bg-blue-600 text-white font-extrabold h-[50px] rounded-xl shadow-md shadow-blue-500/25 transition-all duration-200 flex items-center justify-center gap-2 text-sm sm:text-base cursor-pointer"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" /> Sending…
                        </>
                      ) : (
                        'Send Reset Link'
                      )}
                    </button>
                  </form>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};






