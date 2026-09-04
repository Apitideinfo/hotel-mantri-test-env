import React from 'react';
import { Logo } from '../login/Logo';

interface FooterProps {
  onNavigateLogin: () => void;
}

export const Footer: React.FC<FooterProps> = ({ onNavigateLogin }) => {
  const handleNav = (id: string) => {
    if (id === 'login') {
      onNavigateLogin();
      return;
    }
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <footer className="bg-[#030917] border-t border-white/10 text-slate-400 text-sm py-16 select-none">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10 pb-12 border-b border-white/10">
          {/* Col 1 & 2: Brand Description */}
          <div className="md:col-span-2">
            <p className="text-slate-400 text-xs sm:text-sm leading-relaxed max-w-sm">
              HotelMantri is a modern hospitality management platform designed to simplify room chart management, booking tracking, GST invoicing, staff duty, and guest experiences.
            </p>
          </div>

          {/* Col 3: Product Links */}
          <div>
            <h4 className="text-xs font-extrabold uppercase tracking-widest text-white mb-4">Product</h4>
            <ul className="space-y-2.5 text-xs font-semibold">
              <li>
                <button onClick={() => handleNav('features')} className="hover:text-white transition cursor-pointer">Platform Capabilities</button>
              </li>
              <li>
                <button onClick={() => handleNav('product')} className="hover:text-white transition cursor-pointer">Product Showcase</button>
              </li>
              <li>
                <button onClick={() => handleNav('about')} className="hover:text-white transition cursor-pointer">About HotelMantri</button>
              </li>
            </ul>
          </div>

          {/* Col 4: Account & Access */}
          <div>
            <h4 className="text-xs font-extrabold uppercase tracking-widest text-white mb-4">Account & Access</h4>
            <ul className="space-y-2.5 text-xs font-semibold">
              <li>
                <button onClick={() => handleNav('login')} className="hover:text-white transition cursor-pointer">Customer Login</button>
              </li>
              <li>
                <button onClick={() => handleNav('why-hotelmantri')} className="hover:text-white transition cursor-pointer">Why Choose Us</button>
              </li>
            </ul>
          </div>
        </div>

        {/* Copyright Bar */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-400 gap-4">
          <p>© 2026 HotelMantri. All rights reserved.</p>
          <p className="flex items-center gap-2 text-slate-400 font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
            <span>Built for Modern Indian Hotels</span>
          </p>
        </div>
      </div>
    </footer>
  );
};

