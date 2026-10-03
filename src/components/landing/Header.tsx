import React, { useState, useEffect } from 'react';
import { Menu, X, ChevronDown } from 'lucide-react';

interface HeaderProps {
  onNavigateLogin: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onNavigateLogin }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  const NAV_ITEMS = [
    { label: 'Solutions', id: 'features', hasDropdown: true },
    { label: 'Platform', id: 'overview', hasDropdown: true },
    { label: 'Services', id: 'integrations', hasDropdown: true },
    { label: 'Resources', id: 'testimonials', hasDropdown: true },
    { label: 'Pricing', id: 'overview', hasDropdown: false },
  ];

  return (
    <header
      className="fixed top-0 left-0 right-0 w-full z-50 bg-white shadow-[0_1px_15px_rgba(0,0,0,0.06)] border-b border-gray-100 py-3.5"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">

        {/* ── Brand Name — "HotelMantri" with H and M capital ── */}
        <button
          onClick={() => handleNavClick('home')}
          className="shrink-0 cursor-pointer select-none"
        >
          <span className="text-xl font-black tracking-tight">
            <span className="text-[#7B5CF5]">Hotel</span>
            <span className="text-[#22B8CF]">Mantri</span>
          </span>
        </button>

        {/* ── Desktop Nav — centered, matching video ── */}
        <nav className="hidden md:flex items-center gap-1">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => handleNavClick(item.id)}
              className="flex items-center gap-1 px-3.5 py-2 text-sm font-medium text-gray-700 hover:text-black hover:bg-gray-50 rounded-lg transition-all duration-150 cursor-pointer"
            >
              {item.label}
              {item.hasDropdown && <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
            </button>
          ))}
        </nav>

        {/* ── Right CTAs — Book a Demo (filled) + Login (outline) ── */}
        <div className="hidden md:flex items-center gap-3">
          <button
            id="header-book-demo-btn"
            onClick={onNavigateLogin}
            className="bg-black hover:bg-neutral-800 text-white text-sm font-bold px-5 py-2.5 rounded-lg transition-all duration-200 cursor-pointer shadow-sm hover:shadow-md"
          >
            Book a Demo
          </button>
          <button
            id="header-login-btn"
            onClick={onNavigateLogin}
            className="text-sm font-semibold text-gray-700 hover:text-black border border-gray-300 hover:border-gray-400 px-4 py-2.5 rounded-lg transition-all duration-200 cursor-pointer bg-white hover:bg-gray-50"
          >
            Login
          </button>
        </div>

        {/* ── Mobile hamburger ── */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden p-2 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition focus:outline-none"
          aria-label="Toggle menu"
          aria-expanded={mobileMenuOpen}
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* ── Mobile Menu Drawer ── */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-white border-t border-gray-100 px-5 py-5 space-y-1 shadow-xl">
          <nav className="flex flex-col">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className="flex items-center justify-between w-full py-3 text-left text-sm font-semibold text-gray-800 border-b border-gray-50 hover:text-blue-600"
              >
                <span>{item.label}</span>
                <ChevronDown className="w-4 h-4 text-gray-400" />
              </button>
            ))}
          </nav>
          <div className="pt-4 flex flex-col gap-2.5">
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                onNavigateLogin();
              }}
              className="w-full bg-[#111827] text-white py-3 rounded-xl font-bold text-sm text-center"
            >
              Get Started
            </button>
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                onNavigateLogin();
              }}
              className="w-full border border-gray-300 text-gray-800 py-2.5 rounded-xl font-semibold text-sm text-center bg-white"
            >
              Login
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
