import React, { useState } from 'react';
import { Phone, Mail, MapPin } from 'lucide-react';
import { RevealOnScroll } from './RevealOnScroll';

interface FooterProps {
  onNavigateLogin?: () => void;
}

export const Footer: React.FC<FooterProps> = ({ onNavigateLogin }) => {
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim()) {
      setSubscribed(true);
      setTimeout(() => setSubscribed(false), 4000);
      setEmail('');
    }
  };

  const handleNav = (id: string) => {
    if (id === 'login' && onNavigateLogin) {
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
    <footer className="bg-black text-gray-400 text-xs sm:text-sm select-none border-t border-neutral-900 pt-16 sm:pt-20 pb-12">
      <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-10">
        
        {/* ── Main 5-Column Grid ── */}
        <RevealOnScroll variant="fade-up" duration={700}>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-10 lg:gap-8 pb-14 border-b border-neutral-800/80">
            
            {/* Column 1: Brand Logo & Contact Details (lg:col-span-3) */}
            <div className="lg:col-span-3 flex flex-col justify-start">
              <button
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                className="shrink-0 cursor-pointer select-none text-left mb-6 inline-block"
              >
                <span className="text-2xl font-black tracking-tight text-white font-sans">
                  <span className="text-[#7B5CF5]">Hotel</span>
                  <span className="text-[#22B8CF]">Mantri</span>
                </span>
              </button>

              <div className="flex flex-col gap-3.5 text-xs text-gray-300">
                <a
                  href="tel:+919925958831"
                  className="flex items-center gap-2.5 hover:text-white transition-colors"
                >
                  <Phone className="w-4 h-4 text-[#16A34A] shrink-0" />
                  <span className="font-semibold">+91 99259 58831</span>
                </a>
                <a
                  href="mailto:booking@hotelmantri.com"
                  className="flex items-center gap-2.5 hover:text-white transition-colors"
                >
                  <Mail className="w-4 h-4 text-[#0070F3] shrink-0" />
                  <span className="font-semibold">booking@hotelmantri.com</span>
                </a>
              </div>
            </div>

            {/* Column 2: Our Branches (lg:col-span-3) */}
            <div className="lg:col-span-3 flex flex-col">
              <h4 className="text-sm font-bold text-white tracking-tight mb-4 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-cyan-400" />
                Our Branches
              </h4>
              <div className="space-y-4 text-xs leading-relaxed text-gray-400">
                <div>
                  <p className="font-semibold text-gray-200">New Zealand Office</p>
                  <p className="text-gray-400 text-[11px] mt-0.5">
                    2 Khyber Pass Road, Eden Terrace, Auckland 1010
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-gray-200">Mumbai Office</p>
                  <p className="text-gray-400 text-[11px] mt-0.5">
                    Sector 17, Vashi, Navi Mumbai, Maharashtra 400703
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-gray-200">Bhubaneswar Office</p>
                  <p className="text-gray-400 text-[11px] mt-0.5">
                    DCB 915, DLF CYBER CITY, Chandaka Industrial Estate, Patia, Bhubaneswar, Odisha 751024
                  </p>
                </div>
              </div>
            </div>

            {/* Column 3: Products (lg:col-span-2) */}
            <div className="lg:col-span-2 flex flex-col">
              <h4 className="text-sm font-bold text-white tracking-tight mb-4">
                Products
              </h4>
              <ul className="space-y-2.5 text-xs text-gray-400">
                <li>
                  <button onClick={() => handleNav('features')} className="hover:text-white transition-colors cursor-pointer text-left">
                    HotelMantri PMS
                  </button>
                </li>
                <li>
                  <button onClick={() => handleNav('features')} className="hover:text-white transition-colors cursor-pointer text-left">
                    HotelMantri POS
                  </button>
                </li>
                <li>
                  <button onClick={() => handleNav('integrations')} className="hover:text-white transition-colors cursor-pointer text-left">
                    Channel Manager
                  </button>
                </li>
                <li>
                  <button onClick={() => handleNav('features')} className="hover:text-white transition-colors cursor-pointer text-left">
                    Direct Booking Engine
                  </button>
                </li>
                <li>
                  <button onClick={() => handleNav('overview')} className="hover:text-white transition-colors cursor-pointer text-left">
                    Reports & Analytics
                  </button>
                </li>
                <li>
                  <button onClick={() => handleNav('overview')} className="hover:text-white transition-colors cursor-pointer text-left">
                    Guest Management
                  </button>
                </li>
              </ul>
            </div>

            {/* Column 4: Services (lg:col-span-2) */}
            <div className="lg:col-span-2 flex flex-col">
              <h4 className="text-sm font-bold text-white tracking-tight mb-4">
                Services
              </h4>
              <ul className="space-y-2.5 text-xs text-gray-400">
                <li>
                  <button onClick={() => handleNav('features')} className="hover:text-white transition-colors cursor-pointer text-left">
                    Digital Marketing
                  </button>
                </li>
                <li>
                  <button onClick={() => handleNav('overview')} className="hover:text-white transition-colors cursor-pointer text-left">
                    Google Business Listing
                  </button>
                </li>
                <li>
                  <button onClick={() => handleNav('integrations')} className="hover:text-white transition-colors cursor-pointer text-left">
                    OTA Setup & Onboarding
                  </button>
                </li>
                <li>
                  <button onClick={() => handleNav('features')} className="hover:text-white transition-colors cursor-pointer text-left">
                    Photography & Videography
                  </button>
                </li>
              </ul>
            </div>

            {/* Column 5: Subscribe (lg:col-span-2) */}
            <div className="lg:col-span-2 flex flex-col">
              <h4 className="text-sm font-bold text-white tracking-tight mb-2">
                Subscribe
              </h4>
              <p className="text-xs text-gray-400 mb-3">
                Get product updates and hospitality tips.
              </p>
              <form onSubmit={handleSubscribe} className="flex flex-col gap-2">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-900 border border-neutral-700 text-white text-xs placeholder:text-gray-500 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-all"
                />
                <button
                  type="submit"
                  className="w-full py-2.5 px-4 rounded-xl bg-white text-black font-bold text-xs hover:bg-gray-100 active:scale-95 transition-all cursor-pointer shadow-sm"
                >
                  {subscribed ? 'Subscribed ✓' : 'Subscribe'}
                </button>
              </form>
            </div>

          </div>
        </RevealOnScroll>

        {/* ── Sub-Footer Bottom Bar ── */}
        <div className="pt-8 flex flex-col md:flex-row items-center justify-between text-[11px] text-gray-500 gap-4 text-center md:text-left">
          {/* Left: Policy links */}
          <div className="flex flex-wrap items-center justify-center gap-5">
            <button onClick={() => handleNav('privacy')} className="hover:text-gray-300 transition-colors cursor-pointer">
              Privacy Policy
            </button>
            <span className="text-neutral-700">|</span>
            <button onClick={() => handleNav('terms')} className="hover:text-gray-300 transition-colors cursor-pointer">
              Terms & Conditions
            </button>
            <span className="text-neutral-700">|</span>
            <button onClick={() => handleNav('docs')} className="hover:text-gray-300 transition-colors cursor-pointer">
              Developer Docs
            </button>
          </div>

          {/* Center: Attribution */}
          <div className="text-gray-400 font-medium">
            Designed and Developed by <span className="text-white font-semibold">HotelMantri</span>
          </div>

          {/* Right: Copyright */}
          <div>
            © {new Date().getFullYear()} HotelMantri. All Rights Reserved.
          </div>
        </div>

      </div>
    </footer>
  );
};
