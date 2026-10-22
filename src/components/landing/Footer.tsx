import React from 'react';
import { Phone, Mail, Globe, Sparkles } from 'lucide-react';
import { BrandLogo } from '@/components/BrandLogo';

interface FooterProps {
  onNavigateLogin?: () => void;
  onOpenBookDemo?: () => void;
  onNavigatePrivacy?: () => void;
  onNavigateDeletion?: () => void;
  onNavigateTerms?: () => void;
}

export const Footer: React.FC<FooterProps> = ({
  onNavigateLogin,
  onOpenBookDemo,
  onNavigatePrivacy,
  onNavigateDeletion,
  onNavigateTerms,
}) => {
  const navigateTo = (path: string, callback?: () => void) => {
    if (callback) {
      callback();
      return;
    }
    if (typeof window !== 'undefined') {
      window.history.pushState(null, '', path);
      window.dispatchEvent(new PopStateEvent('popstate'));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleScrollTo = (id: string) => {
    if (id === 'home') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <footer className="bg-[#050914] text-slate-400 text-xs sm:text-sm select-none border-t border-slate-800/80 pt-16 sm:pt-20 pb-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* ── Main Footer Columns Grid ── */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-8 sm:gap-10 pb-14 border-b border-slate-800/80 text-left">
          
          {/* Brand Info (col-span-2 on lg) */}
          <div className="col-span-2 space-y-4">
            <button
              onClick={() => handleScrollTo('home')}
              className="shrink-0 cursor-pointer select-none text-left inline-block"
              aria-label="HotelMantri Home"
            >
              <BrandLogo variant="landing-footer" onDark={true} />
            </button>
            <p className="text-xs text-slate-400 max-w-sm leading-relaxed">
              Your Hotel's Digital Manager — All-in-one hotel management software designed for independent hotels, resorts and boutique properties across India.
            </p>
            <div className="space-y-2 pt-1 text-xs">
              <a
                href="tel:+919925958831"
                className="flex items-center gap-2 text-slate-300 hover:text-amber-400 transition"
              >
                <Phone className="w-3.5 h-3.5 text-amber-400" /> +91 99259 58831
              </a>
              <a
                href="mailto:booking@hotelmantri.com"
                className="flex items-center gap-2 text-slate-300 hover:text-amber-400 transition"
              >
                <Mail className="w-3.5 h-3.5 text-sky-400" /> booking@hotelmantri.com
              </a>
            </div>
          </div>

          {/* Column 1: Product */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">Product</h4>
            <ul className="space-y-2 text-xs text-slate-400">
              <li>
                <button onClick={() => handleScrollTo('modules')} className="hover:text-white transition cursor-pointer">
                  PMS
                </button>
              </li>
              <li>
                <button onClick={() => handleScrollTo('channel-manager')} className="hover:text-white transition cursor-pointer">
                  Channel Manager
                </button>
              </li>
              <li>
                <button onClick={() => handleScrollTo('modules')} className="hover:text-white transition cursor-pointer">
                  Housekeeping
                </button>
              </li>
              <li>
                <button onClick={() => handleScrollTo('modules')} className="hover:text-white transition cursor-pointer">
                  Finance
                </button>
              </li>
              <li>
                <button onClick={() => handleScrollTo('modules')} className="hover:text-white transition cursor-pointer">
                  Reports
                </button>
              </li>
              <li>
                <button onClick={() => handleScrollTo('modules')} className="hover:text-white transition cursor-pointer">
                  POS
                </button>
              </li>
            </ul>
          </div>

          {/* Column 2: Company */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">Company</h4>
            <ul className="space-y-2 text-xs text-slate-400">
              <li>
                <button onClick={() => handleScrollTo('architecture')} className="hover:text-white transition cursor-pointer">
                  About
                </button>
              </li>
              <li>
                <a href="mailto:booking@hotelmantri.com" className="hover:text-white transition">
                  Contact
                </a>
              </li>
              <li>
                <a href="mailto:careers@hotelmantri.com" className="hover:text-white transition">
                  Careers
                </a>
              </li>
            </ul>
          </div>

          {/* Column 3: Resources */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">Resources</h4>
            <ul className="space-y-2 text-xs text-slate-400">
              <li>
                <button onClick={() => handleScrollTo('how-it-works')} className="hover:text-white transition cursor-pointer">
                  Help Center
                </button>
              </li>
              <li>
                <button onClick={() => handleScrollTo('whatsapp')} className="hover:text-white transition cursor-pointer">
                  WhatsApp Support
                </button>
              </li>
              <li>
                <a href="mailto:support@hotelmantri.com" className="hover:text-white transition">
                  Support
                </a>
              </li>
            </ul>
          </div>

          {/* Column 4: Account & Social */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">Account</h4>
            <ul className="space-y-2 text-xs text-slate-400">
              <li>
                <button onClick={onNavigateLogin} className="hover:text-white transition cursor-pointer font-semibold text-slate-200">
                  Login
                </button>
              </li>
              <li>
                <button onClick={onOpenBookDemo} className="hover:text-amber-400 transition cursor-pointer font-bold text-amber-400">
                  Book Demo
                </button>
              </li>
            </ul>

            <div className="pt-3">
              <h5 className="text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-2">Follow Us</h5>
              <div className="flex items-center gap-2.5 text-slate-400">
                <a
                  href="https://facebook.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-7 h-7 rounded-lg bg-slate-800/80 border border-slate-700/80 flex items-center justify-center hover:text-white hover:bg-slate-700 transition"
                  aria-label="Facebook"
                >
                  <span className="font-bold text-[11px]">f</span>
                </a>
                <a
                  href="https://instagram.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-7 h-7 rounded-lg bg-slate-800/80 border border-slate-700/80 flex items-center justify-center hover:text-white hover:bg-slate-700 transition"
                  aria-label="Instagram"
                >
                  <span className="font-bold text-[11px]">ig</span>
                </a>
                <a
                  href="https://linkedin.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-7 h-7 rounded-lg bg-slate-800/80 border border-slate-700/80 flex items-center justify-center hover:text-white hover:bg-slate-700 transition"
                  aria-label="LinkedIn"
                >
                  <span className="font-bold text-[11px]">in</span>
                </a>
                <a
                  href="https://youtube.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-7 h-7 rounded-lg bg-slate-800/80 border border-slate-700/80 flex items-center justify-center hover:text-white hover:bg-slate-700 transition"
                  aria-label="YouTube"
                >
                  <span className="font-bold text-[11px]">yt</span>
                </a>
              </div>
            </div>
          </div>

        </div>

        {/* ── Sub-Footer Bottom Bar ── */}
        <div className="pt-8 flex flex-col md:flex-row items-center justify-between text-[11.5px] text-slate-500 gap-4 text-center md:text-left">
          {/* Left: Copyright */}
          <div>
            © {new Date().getFullYear()} HotelMantri. All Rights Reserved.
          </div>

          {/* Right: Policy links */}
          <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-5">
            <a
              href="/privacy-policy"
              onClick={(e) => {
                if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
                  e.preventDefault();
                  navigateTo('/privacy-policy', onNavigatePrivacy);
                }
              }}
              className="hover:text-slate-300 transition-colors cursor-pointer"
            >
              Privacy Policy
            </a>
            <span className="text-slate-800">•</span>
            <a
              href="/data-deletion"
              onClick={(e) => {
                if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
                  e.preventDefault();
                  navigateTo('/data-deletion', onNavigateDeletion);
                }
              }}
              className="hover:text-slate-300 transition-colors cursor-pointer"
            >
              Data Deletion
            </a>
            <span className="text-slate-800">•</span>
            <a
              href="/terms"
              onClick={(e) => {
                if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
                  e.preventDefault();
                  navigateTo('/terms', onNavigateTerms);
                }
              }}
              className="hover:text-slate-300 transition-colors cursor-pointer"
            >
              Terms of Service
            </a>
          </div>
        </div>

      </div>
    </footer>
  );
};
