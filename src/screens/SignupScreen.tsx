import React, { useState, useRef, useEffect } from 'react';
import { Mail, Lock, AlertCircle, ArrowLeft, Loader2, Eye, EyeOff, Check, User, Phone, Building2, Hash, Layers, ShieldCheck, ArrowRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { BrandSection } from '@/components/login/BrandSection';

interface SignupScreenProps {
  onNavigateToLogin: () => void;
  onPersonalDetailsSuccess: (email: string, details: { fullName: string; email: string; mobile: string; password: string }) => void;
}


export const SignupScreen: React.FC<SignupScreenProps> = ({ onNavigateToLogin, onPersonalDetailsSuccess }) => {
  // Personal Info
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  // Password Strength Calculation
  const calculatePasswordStrength = (pass: string) => {
    let score = 0;
    if (pass.length >= 8) score++;
    if (/[A-Z]/.test(pass)) score++;
    if (/[0-9]/.test(pass)) score++;
    if (/[^A-Za-z0-9]/.test(pass)) score++;
    return score;
  };

  const passStrength = calculatePasswordStrength(password);

  const getStrengthLabel = (score: number) => {
    if (score === 0) return { label: '', color: 'bg-slate-200' };
    if (score <= 1) return { label: 'Weak', color: 'bg-rose-500' };
    if (score <= 2) return { label: 'Fair', color: 'bg-amber-500' };
    if (score <= 3) return { label: 'Good', color: 'bg-blue-500' };
    return { label: 'Strong', color: 'bg-emerald-500' };
  };

  const strengthInfo = getStrengthLabel(passStrength);

  const validateStep1 = () => {
    if (!fullName.trim()) return 'Please enter your full name.';
    if (!email.trim() || !/^\S+@\S+\.\S+$/.test(email)) return 'Please enter a valid email address.';
    if (!mobile.trim() || !/^\d{10}$/.test(mobile.replace(/\D/g, ''))) return 'Please enter a valid 10-digit mobile number.';
    if (!password || password.length < 6) return 'Password must be at least 6 characters.';
    if (password !== confirmPassword) return 'Passwords do not match.';
    return null;
  };

  const handleProceedToOtp = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const err = validateStep1();
    if (err) {
      setError(err);
      return;
    }

    onPersonalDetailsSuccess(email.trim(), {
      fullName: fullName.trim(),
      email: email.trim(),
      mobile: mobile.replace(/\D/g, ''),
      password,
    });
  };


  return (
    <div className="relative h-screen w-screen flex items-center justify-center lg:justify-end bg-[#06152F] font-sans antialiased overflow-hidden select-none">
      {/* 100% Fixed Edge-to-Edge Full Screen Background Image for Signup */}
      <img
        src="/signup_bg_image.png"
        alt="HotelMantri Signup - Welcome & Setup"
        className="absolute inset-0 w-full h-full object-cover object-left lg:object-center pointer-events-none z-0"
      />

      {/* Mobile Dark Backdrop Overlay */}
      <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm lg:hidden pointer-events-none z-0" />

      {/* Right Column: De-congested Onboarding Card Overlay */}
      <div className="relative z-10 w-full lg:w-[45%] xl:w-[42%] h-full flex flex-col justify-center items-center p-4 sm:p-6 lg:mr-8 xl:mr-16">
        <div className="w-full max-w-[410px]">
          {/* White Elevated Card */}
          <div className="bg-white rounded-[24px] shadow-[0_20px_50px_-12px_rgba(26,104,251,0.14)] p-6 sm:p-7 border border-blue-50/80 transition-all duration-300">

            {/* Step Progress Indicator */}
            <div className="flex items-center justify-between mb-5 pb-3 border-b border-slate-100 text-[11px] font-extrabold tracking-wider">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] bg-[#1a68fb] text-white shadow-md shadow-blue-500/30">
                  1
                </span>
                <span className="text-slate-900 font-bold">01 Personal</span>
              </div>
              <div className="w-6 h-[2px] bg-slate-200" />
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] bg-slate-100 text-slate-400">
                  2
                </span>
                <span className="text-slate-400 font-bold">02 OTP</span>
              </div>
              <div className="w-6 h-[2px] bg-slate-200" />
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] bg-slate-100 text-slate-400">
                  3
                </span>
                <span className="text-slate-400 font-bold">03 Hotel</span>
              </div>
            </div>

            {/* Form Title */}
            <div className="mb-6">
              <h2 className="text-2xl font-black text-slate-900 tracking-tight leading-tight">Create Account</h2>
              <p className="text-slate-500 text-xs sm:text-sm mt-0.5 font-medium">
                Step 1 of 4: Personal Information & Password
              </p>
            </div>

            {/* Error Banner */}
            {error && (
              <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-600 text-xs sm:text-sm font-medium rounded-2xl p-3.5 mb-5 animate-fade-in" role="alert">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleProceedToOtp} className="space-y-3">
              <div className="space-y-3 animate-fade-in">
                {/* Full Name Input */}
                <div className="bg-[#f4f8ff] border border-[#dce7fa] focus-within:border-[#1a68fb] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#1a68fb]/20 rounded-xl px-3.5 py-2 h-[50px] transition-all duration-200 flex items-center gap-2.5">
                  <User className="w-4 h-4 text-slate-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <label htmlFor="signup-name" className="block text-[10px] font-bold text-[#1a68fb] uppercase tracking-wider cursor-pointer">
                      Full Name
                    </label>
                    <input
                      id="signup-name"
                      ref={nameRef}
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Rajesh Sharma"
                      required
                      className="w-full bg-transparent text-slate-900 font-semibold text-xs sm:text-sm outline-none border-none p-0 placeholder:text-slate-400/70"
                    />
                  </div>
                </div>

                {/* Email Input */}
                <div className="bg-[#f4f8ff] border border-[#dce7fa] focus-within:border-[#1a68fb] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#1a68fb]/20 rounded-xl px-3.5 py-2 h-[50px] transition-all duration-200 flex items-center gap-2.5">
                  <Mail className="w-4 h-4 text-slate-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <label htmlFor="signup-email" className="block text-[10px] font-bold text-[#1a68fb] uppercase tracking-wider cursor-pointer">
                      Email Address
                    </label>
                    <input
                      id="signup-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="rajesh@hotelroyal.com"
                      required
                      className="w-full bg-transparent text-slate-900 font-semibold text-xs sm:text-sm outline-none border-none p-0 placeholder:text-slate-400/70"
                    />
                  </div>
                </div>

                {/* Mobile Input */}
                <div className="bg-[#f4f8ff] border border-[#dce7fa] focus-within:border-[#1a68fb] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#1a68fb]/20 rounded-xl px-3.5 py-2 h-[50px] transition-all duration-200 flex items-center gap-2.5">
                  <Phone className="w-4 h-4 text-slate-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <label htmlFor="signup-mobile" className="block text-[10px] font-bold text-[#1a68fb] uppercase tracking-wider cursor-pointer">
                      Mobile Number (India)
                    </label>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-slate-400">+91</span>
                      <input
                        id="signup-mobile"
                        type="tel"
                        value={mobile}
                        onChange={(e) => setMobile(e.target.value)}
                        placeholder="9876543210"
                        maxLength={10}
                        required
                        className="w-full bg-transparent text-slate-900 font-semibold text-xs sm:text-sm outline-none border-none p-0 placeholder:text-slate-400/70"
                      />
                    </div>
                  </div>
                </div>

                {/* Passwords Row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="bg-[#f4f8ff] border border-[#dce7fa] focus-within:border-[#1a68fb] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#1a68fb]/20 rounded-xl px-3 py-1.5 h-[48px] transition-all duration-200 flex items-center gap-2">
                    <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <label htmlFor="signup-pass" className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider cursor-pointer">
                        Password
                      </label>
                      <input
                        id="signup-pass"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        required
                        className="w-full bg-transparent text-slate-900 font-semibold text-xs outline-none border-none p-0 placeholder:text-slate-400/70"
                      />
                    </div>
                  </div>

                  <div className="bg-[#f4f8ff] border border-[#dce7fa] focus-within:border-[#1a68fb] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#1a68fb]/20 rounded-xl px-3 py-1.5 h-[48px] transition-all duration-200 flex items-center gap-2">
                    <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <label htmlFor="signup-confirm-pass" className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider cursor-pointer">
                        Confirm
                      </label>
                      <input
                        id="signup-confirm-pass"
                        type={showPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        required
                        className="w-full bg-transparent text-slate-900 font-semibold text-xs outline-none border-none p-0 placeholder:text-slate-400/70"
                      />
                    </div>
                  </div>
                </div>

                {/* Password Strength Indicator & Match Status */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="text-slate-500 hover:text-slate-900 transition flex items-center gap-1 cursor-pointer py-0.5"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      <span>{showPassword ? 'Hide' : 'Show'} Password</span>
                    </button>
                    {password && (
                      <span className={`font-bold text-[10px] ${
                        confirmPassword && password === confirmPassword ? 'text-emerald-600' : 'text-rose-500'
                      }`}>
                        {confirmPassword && password === confirmPassword ? '✓ Match' : 'Mismatch'}
                      </span>
                    )}
                  </div>

                  {password && (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1 bg-slate-100 rounded-full overflow-hidden flex gap-1 p-0.5">
                        {[1, 2, 3, 4].map((stepIdx) => (
                          <div
                            key={stepIdx}
                            className={`h-full flex-1 rounded-full transition-all duration-300 ${
                              passStrength >= stepIdx ? strengthInfo.color : 'bg-slate-200'
                            }`}
                          />
                        ))}
                      </div>
                      <span className="text-[9px] font-bold uppercase text-slate-400">
                        {strengthInfo.label}
                      </span>
                    </div>
                  )}
                </div>

                {/* Proceed to OTP Verification Button */}
                <button
                  type="submit"
                  className="group w-full bg-[#1a68fb] hover:bg-blue-600 active:bg-blue-700 text-white font-extrabold h-[48px] rounded-xl shadow-md shadow-blue-500/25 transition-all duration-200 flex items-center justify-center gap-2 text-sm sm:text-base cursor-pointer transform hover:-translate-y-0.5"
                >
                  <span>Continue to OTP Verification</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </form>

            {/* Back to Login */}
            <div className="mt-6 text-center">
              <button
                type="button"
                onClick={onNavigateToLogin}
                className="text-slate-500 hover:text-slate-900 text-xs sm:text-sm font-semibold transition cursor-pointer py-2 px-1"
              >
                Already registered? <span className="text-[#1a68fb] font-bold hover:underline">Sign In</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};



