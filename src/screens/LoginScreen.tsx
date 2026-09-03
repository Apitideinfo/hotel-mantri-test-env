import React, { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { AuthCard } from '@/components/login/AuthCard';

interface LoginScreenProps {
  onAuthSuccess: () => void;
  onNavigateToSignup?: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onAuthSuccess: _onAuthSuccess, onNavigateToSignup }) => {
  const { signIn, resetPassword } = useAuth();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (email: string, pass: string) => {
    setError(null);
    try {
      setLoading(true);
      await signIn(email, pass);
      setSuccess(true);
      _onAuthSuccess();
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : 'Login failed';
      if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
        setError('Unable to reach authentication server. Please check your internet connection and try again.');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async (email: string) => {
    setError(null);
    try {
      setLoading(true);
      await resetPassword(email);
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : 'Failed to send reset email';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="relative h-screen w-screen flex items-center justify-center lg:justify-end bg-[#06152F] font-sans antialiased overflow-hidden select-none">
      {/* 100% Fixed Edge-to-Edge Full Screen Background Image */}
      <img
        src="/login_bg_image.png"
        alt="HotelMantri Hospitality Platform"
        className="absolute inset-0 w-full h-full object-cover object-left lg:object-center pointer-events-none z-0"
      />

      {/* Mobile Dark Backdrop Overlay */}
      <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm lg:hidden pointer-events-none z-0" />

      {/* Right Column: De-congested Centered Auth Card Overlay */}
      <div className="relative z-10 w-full lg:w-[45%] xl:w-[42%] h-full flex flex-col justify-center items-center p-4 sm:p-8 lg:mr-8 xl:mr-16">
        <AuthCard
          onLogin={handleLogin}
          onForgot={handleForgot}
          onNavigateToSignup={onNavigateToSignup}
          loading={loading}
          success={success}
          error={error}
          setError={setError}
        />
      </div>
    </div>
  );
};



