import React, { useState, useEffect, useRef } from 'react';
import { Mail, ArrowLeft, ArrowRight, RefreshCw, CheckCircle2, ShieldCheck, AlertCircle, KeyRound } from 'lucide-react';
import { Logo } from '../components/login/Logo';

interface OtpVerificationScreenProps {
  email: string;
  onVerifySuccess: () => void;
  onNavigateBack: () => void;
}

export const OtpVerificationScreen: React.FC<OtpVerificationScreenProps> = ({
  email,
  onVerifySuccess,
  onNavigateBack,
}) => {
  const [otp, setOtp] = useState<string[]>(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [resendTimer, setResendTimer] = useState(30);
  const [canResend, setCanResend] = useState(false);
  const [resendNotice, setResendNotice] = useState<string | null>(null);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Demo OTP Code for immediate developer & user testing
  const DEMO_OTP = '123456';

  // 30-second countdown timer for Resend OTP
  useEffect(() => {
    if (resendTimer > 0) {
      const timer = setTimeout(() => setResendTimer((prev) => prev - 1), 1000);
      return () => clearTimeout(timer);
    } else {
      setCanResend(true);
    }
  }, [resendTimer]);

  // Focus first input on mount
  useEffect(() => {
    if (inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, []);

  const handleChange = (index: number, value: string) => {
    // Only allow numbers
    if (value && !/^\d+$/.test(value)) return;

    const newOtp = [...otp];
    // Handle paste of 6 digits
    if (value.length > 1) {
      const pasted = value.slice(0, 6).split('');
      for (let i = 0; i < 6; i++) {
        newOtp[i] = pasted[i] || '';
      }
      setOtp(newOtp);
      const nextIndex = Math.min(pasted.length, 5);
      inputRefs.current[nextIndex]?.focus();
      return;
    }

    newOtp[index] = value;
    setOtp(newOtp);
    setError(null);

    // Auto-advance to next input field
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleResendOtp = () => {
    if (!canResend) return;
    setCanResend(false);
    setResendTimer(30);
    setOtp(['', '', '', '', '', '']);
    setError(null);
    setResendNotice('New 6-digit OTP has been sent to your email.');
    setTimeout(() => setResendNotice(null), 4000);
    inputRefs.current[0]?.focus();
  };

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    const enteredCode = otp.join('');

    if (enteredCode.length < 6) {
      setError('Please enter all 6 digits of the OTP code.');
      return;
    }

    setLoading(true);
    setError(null);

    setTimeout(() => {
      setLoading(false);
      if (enteredCode.length === 6) {
        setSuccess(true);
        setTimeout(() => {
          onVerifySuccess();
        }, 800);
      } else {
        setError('Please enter a valid 6-digit OTP code.');
      }
    }, 800);
  };


  return (
    <div className="relative h-screen w-screen flex items-center justify-center lg:justify-end bg-[#06152F] font-sans antialiased overflow-hidden select-none">
      {/* 100% Fixed Edge-to-Edge Full Screen Background Image */}
      <img
        src="/signup_bg_image.png"
        alt="HotelMantri Signup - OTP Verification"
        className="absolute inset-0 w-full h-full object-cover object-left lg:object-center pointer-events-none z-0"
      />

      {/* Mobile Dark Backdrop Overlay */}
      <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm lg:hidden pointer-events-none z-0" />

      {/* Right Column: Centered OTP Verification Card Overlay */}
      <div className="relative z-10 w-full lg:w-[45%] xl:w-[42%] h-full flex flex-col justify-center items-center p-4 sm:p-6 lg:mr-8 xl:mr-16">
        <div className="w-full max-w-[410px]">
          <div className="bg-white rounded-[28px] shadow-[0_20px_50px_-12px_rgba(26,104,251,0.14)] p-6 sm:p-8 border border-blue-50/80 transition-all duration-300">
            {/* Back Button & Logo */}
            <div className="flex items-center justify-between mb-6 pb-3 border-b border-slate-100">
              <button
                type="button"
                onClick={onNavigateBack}
                className="w-10 h-10 flex items-center justify-center text-slate-500 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer"
                aria-label="Go back to signup"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-1.5 text-xs font-extrabold text-[#1a68fb] bg-blue-50 px-3 py-1 rounded-full border border-blue-100">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Email Verification</span>
              </div>
            </div>

            {/* Icon & Heading */}
            <div className="text-center mb-6">
              <div className="w-14 h-14 bg-blue-50 text-[#1a68fb] border border-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-md shadow-blue-500/10">
                <KeyRound className="w-7 h-7" />
              </div>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight leading-tight">
                Enter Verification Code
              </h2>
              <p className="text-slate-500 text-xs sm:text-sm mt-1 font-medium">
                We sent a 6-digit OTP code to:
              </p>
              <div className="inline-flex items-center gap-1.5 mt-1 bg-slate-100 px-3 py-1 rounded-lg text-slate-900 font-bold text-xs">
                <Mail className="w-3.5 h-3.5 text-[#1a68fb]" />
                <span>{email || 'user@hotelmantri.com'}</span>
              </div>

              {/* Quick Auto-Fill Action */}
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => {
                    setOtp(['1', '2', '3', '4', '5', '6']);
                    setError(null);
                  }}
                  className="text-[11px] font-extrabold text-[#1a68fb] bg-blue-50 hover:bg-blue-100 border border-blue-200 px-3.5 py-1.5 rounded-full transition cursor-pointer inline-flex items-center gap-1.5 shadow-sm"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>Click to Auto-fill OTP (123456)</span>
                </button>
              </div>
            </div>




            {/* Resend Notice */}
            {resendNotice && (
              <div className="mb-4 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold rounded-xl p-3 text-center animate-fade-in flex items-center justify-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>{resendNotice}</span>
              </div>
            )}

            {/* Error Banner */}
            {error && (
              <div className="mb-4 bg-rose-50 border border-rose-200 text-rose-600 text-xs font-semibold rounded-xl p-3 text-center animate-fade-in flex items-center justify-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-rose-500" />
                <span>{error}</span>
              </div>
            )}

            {/* OTP Form */}
            <form onSubmit={handleVerify} className="space-y-6">
              {/* 6 Digit Input Boxes */}
              <div className="flex items-center justify-between gap-1.5 sm:gap-2">
                {otp.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={(el) => (inputRefs.current[idx] = el)}
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={digit}
                    onChange={(e) => handleChange(idx, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(idx, e)}
                    className="w-11 h-13 sm:w-12 sm:h-14 text-center font-mono font-bold text-xl sm:text-2xl text-slate-900 bg-[#f4f8ff] border border-[#dce7fa] rounded-xl outline-none focus:border-[#1a68fb] focus:bg-white focus:ring-2 focus:ring-[#1a68fb]/20 transition-all duration-200"
                  />
                ))}
              </div>

              {/* Verify Button */}
              <button
                type="submit"
                disabled={loading || success}
                className="w-full bg-[#1a68fb] hover:bg-blue-600 active:bg-blue-700 disabled:opacity-80 text-white font-extrabold h-[50px] rounded-xl shadow-md shadow-blue-500/25 transition-all duration-200 flex items-center justify-center gap-2 text-sm sm:text-base cursor-pointer transform hover:-translate-y-0.5"
              >
                {loading ? (
                  <span>Verifying OTP…</span>
                ) : success ? (
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-5 h-5" /> OTP Verified!
                  </span>
                ) : (
                  <>
                    <span>Verify & Continue</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            {/* Resend OTP Section */}
            <div className="mt-6 text-center pt-4 border-t border-slate-100">
              <p className="text-slate-500 text-xs font-medium mb-2">Didn't receive the OTP code?</p>
              {canResend ? (
                <button
                  type="button"
                  onClick={handleResendOtp}
                  className="inline-flex items-center gap-1.5 text-[#1a68fb] hover:text-blue-700 text-xs sm:text-sm font-bold transition cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Resend OTP Code</span>
                </button>
              ) : (
                <span className="text-slate-400 text-xs font-semibold inline-flex items-center gap-1">
                  Resend code in <strong className="text-slate-700 font-mono">{resendTimer}s</strong>
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
