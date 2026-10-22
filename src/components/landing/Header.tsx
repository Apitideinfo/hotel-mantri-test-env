import React, { useState, useEffect } from 'react';
import { Menu, X, ChevronDown, Sparkles } from 'lucide-react';
import { BrandLogo } from '@/components/BrandLogo';

interface HeaderProps {
  onNavigateLogin: () => void;
  onOpenBookDemo: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onNavigateLogin, onOpenBookDemo }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Keyboard Escape & Body Scroll Lock
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mobileMenuOpen) setMobileMenuOpen(false);
    };
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [mobileMenuOpen]);

  const handleNavClick = (id: string) => {
    setMobileMenuOpen(false);
    if (id === 'home') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const el = document.getElementById(id);
    if (el) {
      const yOffset = -80;
      const y = el.getBoundingClientRect().top + window.pageYOffset + yOffset;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }
  };

  const NAV_ITEMS = [
    { label: 'Product', id: 'modules' },
    { label: 'Solutions', id: 'architecture' },
    { label: 'Features', id: 'modules' },
    { label: 'Channel Manager', id: 'channel-manager' },
    { label: 'Resources', id: 'whatsapp' },
    { label: 'Pricing', id: 'cta' },
  ];

  return (
    <header
      className={`fixed top-0 left-0 right-0 w-full z-40 transition-all duration-300 ${
        isScrolled
          ? 'bg-slate-950/90 backdrop-blur-md border-b border-slate-800/80 shadow-xl shadow-black/20 py-3'
          : 'bg-slate-950/70 backdrop-blur-sm border-b border-slate-800/40 py-4'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
        {/* Brand Logo on Dark Navy */}
        <button
          onClick={() => handleNavClick('home')}
          className="shrink-0 cursor-pointer select-none flex items-center text-left focus:outline-none"
          aria-label="HotelMantri Home"
        >
          <BrandLogo variant="landing-header" onDark={true} />
        </button>

        {/* Center Desktop Navigation */}
        <nav className="hidden lg:flex items-center gap-1 xl:gap-2">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.label}
              onClick={() => handleNavClick(item.id)}
              className="px-3.5 py-1.5 text-[13.5px] font-medium text-slate-300 hover:text-white hover:bg-slate-800/60 rounded-full transition-all duration-150 cursor-pointer flex items-center gap-1"
            >
              {item.label}
              {(item.label === 'Product' || item.label === 'Solutions' || item.label === 'Features' || item.label === 'Resources') && (
                <ChevronDown className="w-3 h-3 text-slate-500" />
              )}
            </button>
          ))}
        </nav>

        {/* Right CTAs: Login + Book Free Demo */}
        <div className="hidden sm:flex items-center gap-3">
          <button
            onClick={onNavigateLogin}
            className="text-xs sm:text-sm font-semibold text-slate-200 hover:text-white px-4 py-2 rounded-full border border-slate-700 hover:border-slate-500 bg-slate-900/60 hover:bg-slate-800 transition cursor-pointer"
          >
            Login
          </button>
          <button
            onClick={onOpenBookDemo}
            className="bg-gradient-to-r from-amber-400 via-amber-400 to-yellow-400 hover:from-amber-300 hover:to-yellow-300 text-slate-950 text-xs sm:text-sm font-extrabold px-5 py-2.5 rounded-full shadow-md shadow-amber-500/20 hover:shadow-amber-500/30 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 cursor-pointer flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-900 fill-amber-900" /> Book Free Demo
          </button>
        </div>

        {/* Mobile Hamburger Button */}
        <div className="flex sm:hidden items-center gap-2">
          <button
            onClick={onOpenBookDemo}
            className="bg-gradient-to-r from-amber-400 to-yellow-400 text-slate-950 text-xs font-extrabold px-3 py-1.5 rounded-full"
          >
            Demo
          </button>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition focus:outline-none"
            aria-label="Toggle menu"
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-x-0 top-[60px] bottom-0 bg-slate-950/95 backdrop-blur-xl border-t border-slate-800/80 p-6 flex flex-col justify-between overflow-y-auto animate-in slide-in-from-top-4 duration-200">
          <div className="space-y-2">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.label}
                onClick={() => handleNavClick(item.id)}
                className="w-full text-left px-4 py-3 text-base font-semibold text-slate-200 hover:text-white hover:bg-slate-900 rounded-xl transition cursor-pointer flex items-center justify-between"
              >
                <span>{item.label}</span>
                <ChevronDown className="w-4 h-4 text-slate-600 -rotate-90" />
              </button>
            ))}
          </div>

          <div className="pt-6 border-t border-slate-800 space-y-3">
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                onOpenBookDemo();
              }}
              className="w-full py-3.5 bg-gradient-to-r from-amber-400 to-yellow-400 text-slate-950 font-extrabold text-sm rounded-xl text-center shadow-lg shadow-amber-500/20"
            >
              Book Free Demo
            </button>
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                onNavigateLogin();
              }}
              className="w-full py-3 bg-slate-900 border border-slate-700 text-white font-bold text-sm rounded-xl text-center hover:bg-slate-800"
            >
              Login to HotelMantri
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
