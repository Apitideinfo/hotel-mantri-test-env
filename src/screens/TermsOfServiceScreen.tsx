import React, { useEffect } from 'react';
import {
  FileText,
  ShieldCheck,
  ArrowLeft,
  CheckCircle2,
  Mail,
  Phone,
  Scale,
  CreditCard,
  MessageSquare,
  Lock,
} from 'lucide-react';

interface TermsOfServiceScreenProps {
  onNavigateHome?: () => void;
  onNavigatePrivacy?: () => void;
  onNavigateDeletion?: () => void;
  isAuthenticated?: boolean;
}

export const TermsOfServiceScreen: React.FC<TermsOfServiceScreenProps> = ({
  onNavigateHome,
  onNavigatePrivacy,
  onNavigateDeletion,
  isAuthenticated = false,
}) => {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = 'Terms of Service — HotelMantri Cloud Hotel Management Platform';

    let metaDesc = document.querySelector('meta[name="description"]');
    const prevDesc = metaDesc ? metaDesc.getAttribute('content') : '';
    if (metaDesc) {
      metaDesc.setAttribute(
        'content',
        'Official Terms of Service for HotelMantri PMS. Terms governing SaaS licensing, hotel subscriptions, billing, acceptable use, and WhatsApp messaging compliance.'
      );
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });

    return () => {
      document.title = prevTitle;
      if (metaDesc && prevDesc) {
        metaDesc.setAttribute('content', prevDesc);
      }
    };
  }, []);

  const handleBack = () => {
    if (onNavigateHome) {
      onNavigateHome();
    } else {
      window.location.href = '/';
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans antialiased selection:bg-brand-500 selection:text-white">
      {/* ── Top Header ── */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={handleBack}
              className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-slate-700 hover:text-slate-900 transition-colors p-2 -ml-2 rounded-lg hover:bg-slate-100"
              aria-label="Return"
            >
              <ArrowLeft className="w-4 h-4 text-slate-600" />
              <span>{isAuthenticated ? 'Back to Dashboard' : 'Back to Home'}</span>
            </button>
            <div className="h-4 w-px bg-slate-300 hidden sm:block" />
            <a href="/" className="flex items-center gap-1.5 focus:outline-none">
              <span className="text-xl font-black tracking-tight font-sans">
                <span className="text-[#7B5CF5]">Hotel</span>
                <span className="text-[#22B8CF]">Mantri</span>
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full ml-1 border border-slate-200 hidden md:inline-block">
                Legal
              </span>
            </a>
          </div>

          <div className="flex items-center gap-2 sm:gap-4 text-xs font-semibold">
            {onNavigatePrivacy ? (
              <button
                onClick={onNavigatePrivacy}
                className="text-slate-600 hover:text-brand-600 transition-colors px-2.5 py-1.5 rounded-lg hover:bg-brand-50"
              >
                Privacy Policy
              </button>
            ) : (
              <a
                href="/privacy-policy"
                className="text-slate-600 hover:text-brand-600 transition-colors px-2.5 py-1.5 rounded-lg hover:bg-brand-50"
              >
                Privacy Policy
              </a>
            )}
            {onNavigateDeletion ? (
              <button
                onClick={onNavigateDeletion}
                className="text-slate-600 hover:text-brand-600 transition-colors px-2.5 py-1.5 rounded-lg hover:bg-brand-50"
              >
                Data Deletion
              </button>
            ) : (
              <a
                href="/data-deletion"
                className="text-slate-600 hover:text-brand-600 transition-colors px-2.5 py-1.5 rounded-lg hover:bg-brand-50"
              >
                Data Deletion
              </a>
            )}
          </div>
        </div>
      </header>

      {/* ── Hero Banner ── */}
      <section className="bg-gradient-to-b from-slate-900 via-slate-900 to-slate-800 text-white py-12 sm:py-16 px-4 sm:px-6 lg:px-8 border-b border-slate-800">
        <div className="max-w-5xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-500/10 border border-brand-400/30 text-brand-300 text-xs font-bold uppercase tracking-wider mb-4">
            <Scale className="w-4 h-4 text-brand-400" />
            Terms of Service & Master SaaS Agreement
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-white mb-4">
            Terms of Service
          </h1>
          <p className="text-slate-300 text-sm sm:text-base max-w-3xl leading-relaxed">
            These Terms govern access to and use of the HotelMantri hotel management platform, software APIs, point-of-sale services, and integrated communication features.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-4 text-xs text-slate-400">
            <span>Effective Date: <strong className="text-slate-200">October 15, 2026</strong></span>
            <span className="text-slate-600">•</span>
            <span>Version: <strong className="text-slate-200">3.0 (Production)</strong></span>
          </div>
        </div>
      </section>

      {/* ── Main Terms Content ── */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 space-y-8 text-slate-800 text-sm sm:text-base leading-relaxed">
        
        <section className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm space-y-3">
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-brand-600" />
            1. Acceptance of Terms
          </h2>
          <p>
            By subscribing to, creating an account on, or accessing the HotelMantri platform (including <code>www.hotelmantri.com</code> and related domains), the hotel enterprise, property owner, manager, or authorized staff member ("Customer", "Subscriber", or "User") agrees to be bound by these Terms of Service. If you are entering into this agreement on behalf of a hotel or hospitality entity, you represent that you possess legal authority to bind that entity.
          </p>
        </section>

        <section className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm space-y-3">
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-brand-600" />
            2. Scope of SaaS Services
          </h2>
          <p>
            HotelMantri provides cloud-hosted hospitality operations software, including room inventory management, reservation tracking, guest check-in/out, GST-compliant invoicing, housekeeping task management, POS dining operations, channel distribution management, and automated WhatsApp service notifications.
          </p>
          <p className="text-xs sm:text-sm text-slate-600">
            HotelMantri grants Customer a non-exclusive, non-transferable, subscription-based license to access and use the platform solely for internal hotel business operations during the active subscription period.
          </p>
        </section>

        <section className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm space-y-3">
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-brand-600" />
            3. Subscription Fees, Invoicing & Billing
          </h2>
          <p>
            Subscription plans are billed on a recurring monthly or annual basis as specified during signup. All fees are quoted in Indian Rupees (INR) or applicable local currency, exclusive of applicable GST or statutory taxes.
          </p>
          <p>
            Payments are processed securely via certified third-party payment gateways (including Razorpay). Customers are responsible for providing valid payment information. Failure to renew subscription fees upon expiration may result in restricted account access after a designated grace period.
          </p>
        </section>

        <section className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm space-y-3">
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-brand-600" />
            4. WhatsApp & Messaging Integration Compliance
          </h2>
          <p>
            HotelMantri integrates with Meta Platforms Inc. technologies, including the WhatsApp Business Cloud API. Subscribers agree to use WhatsApp messaging features strictly in compliance with <strong>Meta's Business Messaging Policy</strong> and <strong>Commerce Policy</strong>:
          </p>
          <ul className="list-disc list-inside space-y-1.5 text-xs sm:text-sm text-slate-700">
            <li>Subscribers may only send transactional messages (such as reservation confirmations and tax invoices) to guests who have provided their phone number in connection with an authentic reservation or inquiry.</li>
            <li>Subscribers are strictly prohibited from utilizing the integration to conduct unsolicited spam, cold promotional blasts, or prohibited marketing campaigns.</li>
            <li>HotelMantri reserves the right to immediately suspend messaging access for any account found in violation of Meta’s messaging policies.</li>
          </ul>
        </section>

        <section className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm space-y-3">
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Lock className="w-5 h-5 text-brand-600" />
            5. Customer Responsibilities & Data Protection
          </h2>
          <p>
            The hotel subscriber acts as the <strong>Data Controller</strong> for guest personal data captured during operations. The subscriber is responsible for ensuring that guest information is obtained lawfully and that local hospitality requirements (such as guest identity verification and police registers) are adhered to.
          </p>
          <p className="text-xs sm:text-sm text-slate-600">
            Subscribers must maintain the confidentiality of staff login credentials and immediately notify HotelMantri of any suspected unauthorized access to their tenant account.
          </p>
        </section>

        <section className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm space-y-3">
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-brand-600" />
            6. Service Availability & Limitation of Liability
          </h2>
          <p>
            HotelMantri strives for high availability and industry-standard uptime. However, services are provided on an "as is" and "as available" basis. To the maximum extent permitted by applicable law, HotelMantri shall not be liable for indirect, incidental, or consequential damages resulting from third-party gateway outages (e.g., OTA connection downtime, Meta API disruptions, or power/internet failures at the hotel property).
          </p>
        </section>

        <section className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm space-y-3">
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Scale className="w-5 h-5 text-brand-600" />
            7. Governing Law & Dispute Resolution
          </h2>
          <p>
            These Terms shall be governed by and construed in accordance with the laws of <strong>India</strong>. Any disputes arising out of or in connection with these Terms shall be subject to the exclusive jurisdiction of the competent courts in <strong>Navi Mumbai / Bhubaneswar, India</strong>.
          </p>
        </section>

        <section className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm space-y-3">
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Mail className="w-5 h-5 text-brand-600" />
            8. Contact Information
          </h2>
          <p>For inquiries regarding these Terms of Service, contact our legal desk:</p>
          <div className="flex flex-col sm:flex-row gap-4 text-xs sm:text-sm pt-2">
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-brand-600" />
              <span>Email: <a href="mailto:privacy@hotelmantri.com" className="font-semibold text-brand-600 underline">privacy@hotelmantri.com</a></span>
            </div>
            <div className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-emerald-600" />
              <span>Helpline: <a href="tel:+919925958831" className="font-semibold hover:underline">+91 99259 58831</a></span>
            </div>
          </div>
        </section>

      </main>

      {/* ── Footer ── */}
      <footer className="bg-slate-900 text-slate-400 py-8 border-t border-slate-800 text-xs text-center">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© {new Date().getFullYear()} HotelMantri (Apitide Information Technologies). All rights reserved.</p>
          <div className="flex items-center gap-4">
            <a href="/privacy-policy" className="text-slate-300 hover:text-white transition">Privacy Policy</a>
            <span>•</span>
            <a href="/data-deletion" className="text-slate-300 hover:text-white transition">Data Deletion</a>
            <span>•</span>
            <a href="/terms" className="text-slate-300 hover:text-white transition">Terms of Service</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default TermsOfServiceScreen;
