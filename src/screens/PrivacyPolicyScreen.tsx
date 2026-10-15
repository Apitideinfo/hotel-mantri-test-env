import React, { useEffect } from 'react';
import {
  ShieldCheck,
  Lock,
  Server,
  FileText,
  UserCheck,
  Trash2,
  Mail,
  Phone,
  MapPin,
  ArrowLeft,
  ChevronRight,
  Database,
  Share2,
  CheckCircle2,
  ExternalLink,
  Clock,
  AlertTriangle,
} from 'lucide-react';

interface PrivacyPolicyScreenProps {
  onNavigateHome?: () => void;
  onNavigateDeletion?: () => void;
  onNavigateTerms?: () => void;
  isAuthenticated?: boolean;
}

export const PrivacyPolicyScreen: React.FC<PrivacyPolicyScreenProps> = ({
  onNavigateHome,
  onNavigateDeletion,
  onNavigateTerms,
  isAuthenticated = false,
}) => {
  // Update document title and canonical meta tags
  useEffect(() => {
    const prevTitle = document.title;
    document.title = 'Privacy Policy — HotelMantri Cloud Hotel Management Platform';

    let metaDesc = document.querySelector('meta[name="description"]');
    const prevDesc = metaDesc ? metaDesc.getAttribute('content') : '';
    if (metaDesc) {
      metaDesc.setAttribute(
        'content',
        'Official Privacy Policy for HotelMantri PMS. Disclosures on guest data processing, WhatsApp Meta integrations, data protection, security, and statutory retention.'
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

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const sections = [
    { id: 'section-1', num: '1', title: 'Introduction & Scope' },
    { id: 'section-2', num: '2', title: 'Information Collected' },
    { id: 'section-3', num: '3', title: 'How Information is Collected' },
    { id: 'section-4', num: '4', title: 'Purposes of Data Processing' },
    { id: 'section-5', num: '5', title: 'Hotel Reservation & Guest Processing' },
    { id: 'section-6', num: '6', title: 'WhatsApp & Meta Integrations' },
    { id: 'section-7', num: '7', title: 'Third-Party Service Providers & Sharing' },
    { id: 'section-8', num: '8', title: 'Storage, Security & Access Controls' },
    { id: 'section-9', num: '9', title: 'Data Retention' },
    { id: 'section-10', num: '10', title: 'User Privacy Rights & Access Requests' },
    { id: 'section-11', num: '11', title: 'Account & Personal-Data Deletion' },
    { id: 'section-12', num: '12', title: 'Cookies & Technical Information' },
    { id: 'section-13', num: '13', title: 'International Transfers' },
    { id: 'section-14', num: '14', title: "Children's Privacy" },
    { id: 'section-15', num: '15', title: 'Policy Updates' },
    { id: 'section-16', num: '16', title: 'Contact Information & Grievance Desk' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans antialiased selection:bg-brand-500 selection:text-white">
      {/* ── Header Navigation Bar ── */}
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
                Trust & Compliance
              </span>
            </a>
          </div>

          <div className="flex items-center gap-2 sm:gap-4 text-xs font-semibold">
            {onNavigateDeletion ? (
              <button
                onClick={onNavigateDeletion}
                className="text-slate-600 hover:text-brand-600 transition-colors px-2.5 py-1.5 rounded-lg hover:bg-brand-50"
              >
                Data Deletion Instructions
              </button>
            ) : (
              <a
                href="/data-deletion"
                className="text-slate-600 hover:text-brand-600 transition-colors px-2.5 py-1.5 rounded-lg hover:bg-brand-50"
              >
                Data Deletion
              </a>
            )}
            {onNavigateTerms ? (
              <button
                onClick={onNavigateTerms}
                className="text-slate-600 hover:text-brand-600 transition-colors px-2.5 py-1.5 rounded-lg hover:bg-brand-50 hidden sm:block"
              >
                Terms of Service
              </button>
            ) : (
              <a
                href="/terms"
                className="text-slate-600 hover:text-brand-600 transition-colors px-2.5 py-1.5 rounded-lg hover:bg-brand-50 hidden sm:block"
              >
                Terms of Service
              </a>
            )}
          </div>
        </div>
      </header>

      {/* ── Hero / Page Title ── */}
      <section className="bg-gradient-to-b from-slate-900 via-slate-900 to-slate-800 text-white py-12 sm:py-16 px-4 sm:px-6 lg:px-8 border-b border-slate-800">
        <div className="max-w-5xl mx-auto text-center sm:text-left">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-500/10 border border-brand-400/30 text-brand-300 text-xs font-bold uppercase tracking-wider mb-4">
            <ShieldCheck className="w-4 h-4 text-brand-400" />
            Meta Verified Compliance & Data Privacy Notice
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-white mb-4">
            Privacy Policy
          </h1>
          <p className="text-slate-300 text-sm sm:text-base max-w-3xl leading-relaxed">
            HotelMantri is committed to transparent, secure, and compliant data stewardship. This policy explains how we collect, process, safeguard, and retain information across our cloud PMS platform, guest communication channels, and Meta/WhatsApp integrations.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-4 text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              Effective Date: <strong className="text-slate-200">October 15, 2026</strong>
            </span>
            <span className="text-slate-600">•</span>
            <span>Version: <strong className="text-slate-200">3.2 (Production Release)</strong></span>
            <span className="text-slate-600">•</span>
            <span>Canonical URL: <code className="text-brand-300 bg-slate-800/80 px-2 py-0.5 rounded">https://www.hotelmantri.com/privacy-policy</code></span>
          </div>
        </div>
      </section>

      {/* ── Main Content Grid with Sticky Table of Contents ── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          {/* Left Column: Sticky Table of Contents */}
          <aside className="hidden lg:block lg:col-span-4 xl:col-span-3">
            <div className="sticky top-24 bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-2">
                <FileText className="w-3.5 h-3.5 text-brand-600" />
                Table of Contents
              </h2>
              <nav className="space-y-1 text-xs max-h-[calc(100vh-160px)] overflow-y-auto pr-1">
                {sections.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => scrollToSection(s.id)}
                    className="w-full text-left py-1.5 px-2 rounded-lg text-slate-600 hover:text-brand-600 hover:bg-slate-50 transition-colors flex items-center justify-between group"
                  >
                    <span className="truncate">
                      <span className="font-semibold text-slate-400 mr-1.5">{s.num}.</span>
                      {s.title}
                    </span>
                    <ChevronRight className="w-3 h-3 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-1" />
                  </button>
                ))}
              </nav>

              <div className="mt-6 pt-4 border-t border-slate-100">
                <a
                  href="/data-deletion"
                  className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-xl transition border border-rose-200"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Submit Deletion Request
                </a>
              </div>
            </div>
          </aside>

          {/* Right Column: Complete 16 Sections of Policy */}
          <article className="lg:col-span-8 xl:col-span-9 space-y-12 text-slate-800 leading-relaxed text-sm sm:text-base">
            
            {/* Section 1 */}
            <section id="section-1" className="scroll-mt-24 bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <span className="flex items-center justify-center w-8 h-8 rounded-xl bg-brand-50 text-brand-600 font-bold text-sm border border-brand-200">
                  1
                </span>
                <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  Introduction and Scope
                </h2>
              </div>
              <p className="mb-4">
                <strong>HotelMantri</strong> (operated under Apitide Information Technologies) is a comprehensive cloud-native hospitality management software platform. Our services include Property Management System (PMS) operations, Point of Sale (POS) dining operations, Channel Manager integration, Direct Booking Engine, GST invoicing, financial reporting, and automated guest messaging notifications.
              </p>
              <p className="mb-4">
                This Privacy Policy applies to all interactions with the HotelMantri website (<code>www.hotelmantri.com</code>), the HotelMantri web software application, authorized mobile interfaces, APIs, and integrated communications channels such as WhatsApp and transactional email.
              </p>
              <div className="bg-slate-50 border-l-4 border-brand-600 p-4 rounded-r-xl my-4 text-xs sm:text-sm">
                <h4 className="font-bold text-slate-900 mb-1">Key Legal Distinctions: Roles in Data Processing</h4>
                <p className="text-slate-600 mb-2">
                  To ensure complete regulatory clarity under the <strong>Indian Digital Personal Data Protection Act (DPDP Act)</strong>, <strong>General Data Protection Regulation (GDPR)</strong>, and applicable international privacy frameworks:
                </p>
                <ul className="list-disc list-inside space-y-1.5 text-slate-700">
                  <li>
                    <strong>The Hotel Operator as Data Controller / Data Fiduciary:</strong> The hotel, resort, guest house, or hospitality enterprise utilizing HotelMantri acts as the Controller of guest records. The hotel determines what guest information is required for room reservations, check-in, identity verification, local police verification (such as Form C in India), and stay arrangements.
                  </li>
                  <li>
                    <strong>HotelMantri as Data Processor:</strong> HotelMantri acts strictly as a technology service provider and Data Processor. We store, transmit, and organize guest information solely on behalf of, and under the explicit direction and contractual agreement with, the respective hotel operator.
                  </li>
                </ul>
              </div>
            </section>

            {/* Section 2 */}
            <section id="section-2" className="scroll-mt-24 bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <span className="flex items-center justify-center w-8 h-8 rounded-xl bg-brand-50 text-brand-600 font-bold text-sm border border-brand-200">
                  2
                </span>
                <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  Information Collected
                </h2>
              </div>
              <p className="mb-4">
                Depending on how you interact with HotelMantri (as a hotel owner, staff member, guest, or website visitor), we process the following genuine categories of personal and operational information:
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-4">
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                  <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2 mb-2">
                    <UserCheck className="w-4 h-4 text-brand-600" />
                    Guest & Reservation Data
                  </h4>
                  <ul className="text-xs text-slate-600 space-y-1.5">
                    <li>• Guest full legal name, contact phone number, and email.</li>
                    <li>• Physical address, city, state, country, and postal pincode.</li>
                    <li>• Government ID proof type (Passport, Driving License, Voter ID, Aadhaar) and verified masked identification number as mandated by local hospitality compliance.</li>
                    <li>• Booking dates (check-in, check-out), room assignments, guest count (adults/children), and specific requests.</li>
                    <li>• Booking channel (Direct, Walk-in, OTA partners, Corporate, Travel Agent).</li>
                  </ul>
                </div>

                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                  <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2 mb-2">
                    <Lock className="w-4 h-4 text-brand-600" />
                    Hotel & Staff Accounts
                  </h4>
                  <ul className="text-xs text-slate-600 space-y-1.5">
                    <li>• Property business name, legal entity name, GSTIN number, and registered address.</li>
                    <li>• Administrator name, official mobile number, and billing email.</li>
                    <li>• Staff employee usernames, mobile numbers, assigned roles (Admin, Manager, Reception, Housekeeping, Accounts), and shift logs.</li>
                    <li>• Encrypted authentication credentials and multi-tenant session tokens.</li>
                  </ul>
                </div>

                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                  <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2 mb-2">
                    <FileText className="w-4 h-4 text-brand-600" />
                    Financial & Invoice Records
                  </h4>
                  <ul className="text-xs text-slate-600 space-y-1.5">
                    <li>• Room tariffs, applicable taxes (CGST, SGST, IGST), and HSN/SAC codes.</li>
                    <li>• Payment methods (Cash, UPI, Bank Transfer, Card POS, Online Payment Gateway).</li>
                    <li>• Payment transaction IDs, advance deposits, refunds, and final balances.</li>
                    <li>• <em>Note:</em> HotelMantri does NOT collect, store, or process raw 16-digit credit card numbers or CVVs. All online transactions are handled through certified PCI-DSS Level 1 payment gateways (such as Razorpay).</li>
                  </ul>
                </div>

                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                  <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2 mb-2">
                    <Server className="w-4 h-4 text-brand-600" />
                    WhatsApp, Meta & Technical Data
                  </h4>
                  <ul className="text-xs text-slate-600 space-y-1.5">
                    <li>• Guest phone numbers for transactional WhatsApp alerts (booking confirmation, digital invoice link).</li>
                    <li>• Message transmission timestamps and delivery statuses (sent, delivered, read, failed).</li>
                    <li>• Server access logs, IP addresses (used strictly for session validation, security rate limiting, and DDoS defense).</li>
                    <li>• Device user-agent, browser type, and internal correlation IDs (<code>X-Request-Id</code>).</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* Section 3 */}
            <section id="section-3" className="scroll-mt-24 bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <span className="flex items-center justify-center w-8 h-8 rounded-xl bg-brand-50 text-brand-600 font-bold text-sm border border-brand-200">
                  3
                </span>
                <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  How Information is Collected
                </h2>
              </div>
              <p className="mb-3">Information is collected through the following authentic avenues:</p>
              <ul className="list-disc list-inside space-y-2 text-slate-700 text-xs sm:text-sm">
                <li>
                  <strong>Direct Input by Hoteliers & Front Office Staff:</strong> During front-desk check-in, telephone reservations, walk-in bookings, staff onboarding, and daily ledger entry.
                </li>
                <li>
                  <strong>Direct Guest Interactions:</strong> When guests complete pre-check-in forms, interact with direct booking links, make payments, or request digital invoices.
                </li>
                <li>
                  <strong>Third-Party Online Travel Agencies (OTAs):</strong> Synchronized automatically via our Channel Manager integration (e.g., Aiosell, Channex, Booking.com, MakeMyTrip, Agoda, Expedia) when a traveler books a stay online.
                </li>
                <li>
                  <strong>Automated Technical Collection:</strong> Session management headers, system cookies, and security telemetry captured automatically during platform use to maintain authentication state.
                </li>
                <li>
                  <strong>Messaging Webhooks:</strong> Webhook delivery receipts received from the Meta WhatsApp Cloud API / Whinta platform to confirm that transactional booking slips were successfully delivered.
                </li>
              </ul>
            </section>

            {/* Section 4 */}
            <section id="section-4" className="scroll-mt-24 bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <span className="flex items-center justify-center w-8 h-8 rounded-xl bg-brand-50 text-brand-600 font-bold text-sm border border-brand-200">
                  4
                </span>
                <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  Purposes of Data Processing
                </h2>
              </div>
              <p className="mb-4">We process information exclusively for lawful, legitimate, and operational purposes:</p>
              <div className="space-y-3 text-xs sm:text-sm">
                <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-slate-900">Hospitality Front-Office & Booking Operations:</strong>
                    <p className="text-slate-600 mt-0.5">Managing room charts, checking guests in/out, tracking room clean status, and coordinating housekeeping shifts.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-slate-900">Statutory Tax & Financial Invoicing:</strong>
                    <p className="text-slate-600 mt-0.5">Generating legal GST tax invoices, calculating correct CGST/SGST/IGST tax splits, creating balance sheets, and reconciling daily cash/bank ledgers.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-slate-900">Service Communications via WhatsApp & Email:</strong>
                    <p className="text-slate-600 mt-0.5">Sending transactional booking confirmations, check-in information, secure digital invoice download links, and daily owner revenue reports.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-slate-900">Platform Security & Tenant Isolation:</strong>
                    <p className="text-slate-600 mt-0.5">Enforcing strict multi-tenant database row-level security, defending against automated attacks, and preventing unauthorized cross-property data exposure.</p>
                  </div>
                </div>
              </div>
            </section>

            {/* Section 5 */}
            <section id="section-5" className="scroll-mt-24 bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <span className="flex items-center justify-center w-8 h-8 rounded-xl bg-brand-50 text-brand-600 font-bold text-sm border border-brand-200">
                  5
                </span>
                <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  Hotel Reservation and Guest Information Processing
                </h2>
              </div>
              <p className="mb-3">
                Because HotelMantri is a software provider to hotels, individual hotel operators are responsible for establishing legal grounds for collecting guest data (such as fulfilling a reservation contract or complying with local innkeeper regulations).
              </p>
              <p className="mb-3">
                When a guest stays at a hotel powered by HotelMantri, their data is isolated within the specific hotel’s secure partition. HotelMantri will never disclose, cross-reference, or sell guest lists across different hotels or to advertising networks.
              </p>
              <p className="text-xs sm:text-sm text-slate-600">
                Guests seeking to access, correct, or update their stay details should direct requests primarily to the hotel where they held a reservation. Guests may also submit a verification request via our central compliance desk at <a href="mailto:privacy@hotelmantri.com" className="text-brand-600 font-semibold underline">privacy@hotelmantri.com</a>.
              </p>
            </section>

            {/* Section 6 */}
            <section id="section-6" className="scroll-mt-24 bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <span className="flex items-center justify-center w-8 h-8 rounded-xl bg-brand-50 text-brand-600 font-bold text-sm border border-brand-200">
                  6
                </span>
                <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  WhatsApp and Meta Integrations
                </h2>
              </div>
              <p className="mb-3">
                HotelMantri integrates with <strong>Meta Platforms, Inc.</strong> technologies, including the <strong>WhatsApp Business Cloud API</strong> (operated in conjunction with certified Business Solution Provider Whinta).
              </p>
              
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 my-4 space-y-2 text-xs sm:text-sm text-emerald-950">
                <h4 className="font-bold flex items-center gap-2 text-emerald-900">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Meta & WhatsApp Compliance Highlights
                </h4>
                <ul className="list-disc list-inside space-y-1.5 text-emerald-900">
                  <li>
                    <strong>Strictly Transactional Utility:</strong> WhatsApp messaging is employed exclusively for direct service notifications requested by the user or hotel, such as reservation confirmation cards, room allocation details, PDF tax invoice links, and scheduled operational reports for verified hotel managers.
                  </li>
                  <li>
                    <strong>No Spam or Unsolicited Marketing:</strong> We strictly prohibit and do not conduct bulk marketing blasts, unsolicited promotional broadcasts, or cold messaging over WhatsApp.
                  </li>
                  <li>
                    <strong>Pre-Approved Templates:</strong> All automated outbound messages use utility templates pre-reviewed and approved by Meta under Meta's Business Messaging Policies.
                  </li>
                  <li>
                    <strong>Opt-Out Capability:</strong> Any recipient can opt out of automated WhatsApp alerts by replying <code>STOP</code> to any message or submitting a request at <a href="/data-deletion" className="underline font-semibold">https://www.hotelmantri.com/data-deletion</a>.
                  </li>
                </ul>
              </div>

              <p className="text-xs sm:text-sm text-slate-600">
                In transmitting messages, technical payload data (such as recipient mobile number and message delivery timestamps) passes through Meta’s infrastructure subject to Meta’s Terms of Service and Privacy Policy. HotelMantri maintains a dedicated Data Deletion Callback endpoint for Meta App reviews and user privacy enforcement.
              </p>
            </section>

            {/* Section 7 */}
            <section id="section-7" className="scroll-mt-24 bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <span className="flex items-center justify-center w-8 h-8 rounded-xl bg-brand-50 text-brand-600 font-bold text-sm border border-brand-200">
                  7
                </span>
                <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  Third-Party Service Providers and Data Sharing
                </h2>
              </div>
              <p className="mb-4">
                <strong>We do not sell, rent, monetize, or trade personal data to brokers, advertising networks, or third parties.</strong>
              </p>
              <p className="mb-4">
                To provide high-availability cloud infrastructure, we work with trusted, industry-standard sub-processors under strict confidentiality and data-protection covenants:
              </p>

              <div className="overflow-x-auto my-4">
                <table className="w-full text-left text-xs sm:text-sm border border-slate-200 rounded-xl overflow-hidden">
                  <thead className="bg-slate-100 text-slate-700 font-bold">
                    <tr>
                      <th className="p-3 border-b border-slate-200">Sub-Processor</th>
                      <th className="p-3 border-b border-slate-200">Primary Function</th>
                      <th className="p-3 border-b border-slate-200">Data Shared</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-slate-600">
                    <tr>
                      <td className="p-3 font-semibold text-slate-900">Supabase Inc.</td>
                      <td className="p-3">Managed PostgreSQL Database, Encrypted Storage & Authentication</td>
                      <td className="p-3">Encrypted reservation data, hotel configurations, staff credentials.</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-semibold text-slate-900">Vercel Inc. / AWS</td>
                      <td className="p-3">Cloud Application Hosting & Serverless Execution</td>
                      <td className="p-3">HTTP request routing, encrypted session headers.</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-semibold text-slate-900">Razorpay Software Pvt. Ltd.</td>
                      <td className="p-3">PCI-DSS Level 1 Payment Processing Gateway</td>
                      <td className="p-3">Order IDs, payment amounts, customer contact tokens.</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-semibold text-slate-900">Meta Platforms Inc. / Whinta</td>
                      <td className="p-3">WhatsApp Business Cloud API Messaging Gateway</td>
                      <td className="p-3">Mobile numbers, pre-approved utility notification templates.</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-semibold text-slate-900">Aiosell / Channex</td>
                      <td className="p-3">Channel Manager & OTA Distribution Hub</td>
                      <td className="p-3">Room rates, availability, inbound OTA reservation payloads.</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <p className="text-xs sm:text-sm text-slate-600">
                <strong>Legal Disclosures:</strong> We may disclose information if strictly required to do so by applicable law, search warrant, court order, or authorized government regulator (such as tax authorities conducting statutory GST audits or law enforcement officials exercising statutory hotel guest register inspections).
              </p>
            </section>

            {/* Section 8 */}
            <section id="section-8" className="scroll-mt-24 bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <span className="flex items-center justify-center w-8 h-8 rounded-xl bg-brand-50 text-brand-600 font-bold text-sm border border-brand-200">
                  8
                </span>
                <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  Storage, Security, and Access Controls
                </h2>
              </div>
              <p className="mb-4">
                We implement rigorous technical, organizational, and physical security measures to safeguard all data:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs sm:text-sm">
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                  <h4 className="font-bold text-slate-900 mb-1 flex items-center gap-1.5">
                    <Lock className="w-4 h-4 text-emerald-600" />
                    End-to-End Encryption
                  </h4>
                  <p className="text-slate-600">All data in transit is encrypted using Modern TLS 1.2/1.3 with HTTPS strictly enforced. Data at rest is encrypted using AES-256 standard.</p>
                </div>
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                  <h4 className="font-bold text-slate-900 mb-1 flex items-center gap-1.5">
                    <Database className="w-4 h-4 text-brand-600" />
                    PostgreSQL Row-Level Security (RLS)
                  </h4>
                  <p className="text-slate-600">Strict multi-tenant database policies ensure that Hotel A can never query, read, or modify data belonging to Hotel B.</p>
                </div>
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                  <h4 className="font-bold text-slate-900 mb-1 flex items-center gap-1.5">
                    <UserCheck className="w-4 h-4 text-indigo-600" />
                    Role-Based Access Control (RBAC)
                  </h4>
                  <p className="text-slate-600">Granular permission gates restrict staff access by role (e.g., Housekeeping accounts cannot view owner accounting ledgers or payment orders).</p>
                </div>
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                  <h4 className="font-bold text-slate-900 mb-1 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-purple-600" />
                    Rate Limiting & Anti-Abuse
                  </h4>
                  <p className="text-slate-600">Automated rate-limiters protect authentication endpoints, payment order generation, and public request forms against brute-force attacks.</p>
                </div>
              </div>
            </section>

            {/* Section 9 */}
            <section id="section-9" className="scroll-mt-24 bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <span className="flex items-center justify-center w-8 h-8 rounded-xl bg-brand-50 text-brand-600 font-bold text-sm border border-brand-200">
                  9
                </span>
                <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  Data Retention
                </h2>
              </div>
              <p className="mb-3">
                We retain personal and financial records only for as long as necessary to satisfy operational, legal, tax, and accounting mandates:
              </p>
              <ul className="list-disc list-inside space-y-2 text-xs sm:text-sm text-slate-700">
                <li>
                  <strong>Active Hotel Accounts:</strong> Operational data is maintained for the duration of the hotel’s active subscription to provide historical booking registers and analytics.
                </li>
                <li>
                  <strong>Statutory Financial & Tax Invoices:</strong> In accordance with <strong>Section 44AA of the Indian Income Tax Act</strong> and <strong>Section 36 of the Central Goods and Services Tax (CGST) Act</strong>, financial books of account, tax invoices, and payment receipts must be preserved for a minimum of <strong>6 to 8 years</strong>. Financial transactions cannot be deleted prematurely.
                </li>
                <li>
                  <strong>Guest Contact Records:</strong> Non-financial contact details (e.g. promotional opt-ins, optional notes) may be purged or anonymized upon validated request.
                </li>
                <li>
                  <strong>System & Technical Logs:</strong> Web server access logs, routing metrics, and security diagnostics are rotated and purged within <strong>30 to 90 days</strong>.
                </li>
              </ul>
            </section>

            {/* Section 10 */}
            <section id="section-10" className="scroll-mt-24 bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <span className="flex items-center justify-center w-8 h-8 rounded-xl bg-brand-50 text-brand-600 font-bold text-sm border border-brand-200">
                  10
                </span>
                <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  User Privacy Rights and Access/Correction Requests
                </h2>
              </div>
              <p className="mb-3">
                Under applicable privacy regulations (including India's DPDP Act and international privacy laws), data subjects possess fundamental rights regarding their personal information:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs sm:text-sm my-3">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <strong>Right to Access:</strong> You may request a summary of the personal data held about you.
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <strong>Right to Correction:</strong> You may request correction of inaccurate, outdated, or incomplete records.
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <strong>Right to Withdraw Consent:</strong> You may withdraw consent for optional processing or opt out of messaging.
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <strong>Right to Grievance Redressal:</strong> You may register concerns with our designated Grievance Officer.
                </div>
              </div>
              <p className="text-xs sm:text-sm text-slate-600">
                To exercise any of these rights, please email <a href="mailto:privacy@hotelmantri.com" className="text-brand-600 font-semibold underline">privacy@hotelmantri.com</a> with your identification details.
              </p>
            </section>

            {/* Section 11 */}
            <section id="section-11" className="scroll-mt-24 bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <span className="flex items-center justify-center w-8 h-8 rounded-xl bg-brand-50 text-brand-600 font-bold text-sm border border-brand-200">
                  11
                </span>
                <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  Account and Personal-Data Deletion
                </h2>
              </div>
              <p className="mb-3">
                Individuals, hotel operators, and WhatsApp message recipients have the right to request deletion of personal information processed through HotelMantri or connected Meta integrations.
              </p>
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 my-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h4 className="font-bold text-rose-900 text-sm flex items-center gap-1.5">
                    <Trash2 className="w-4 h-4 text-rose-600" />
                    Dedicated Data Deletion Portal
                  </h4>
                  <p className="text-xs text-rose-800 mt-1">
                    Visit our canonical data deletion page to submit an auditable deletion ticket or track an existing request with your Confirmation Code.
                  </p>
                </div>
                <a
                  href="/data-deletion"
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-sm transition whitespace-nowrap"
                >
                  Go to Data Deletion Page →
                </a>
              </div>
              <p className="text-xs sm:text-sm text-slate-600">
                <em>Important Retention Note:</em> To prevent fraudulent erasure and adhere to tax compliance, financial invoices and audit logs are restricted rather than immediately scrubbed. Non-financial PII is permanently erased or pseudonymized.
              </p>
            </section>

            {/* Section 12 */}
            <section id="section-12" className="scroll-mt-24 bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <span className="flex items-center justify-center w-8 h-8 rounded-xl bg-brand-50 text-brand-600 font-bold text-sm border border-brand-200">
                  12
                </span>
                <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  Cookies and Technical Information
                </h2>
              </div>
              <p className="mb-3">
                HotelMantri utilizes strictly essential technical storage (cookies and browser localStorage) required for the core functioning of our application:
              </p>
              <ul className="list-disc list-inside space-y-1.5 text-xs sm:text-sm text-slate-700">
                <li><strong>Authentication Tokens:</strong> Secure session identifiers stored to keep authorized staff logged into their property dashboard.</li>
                <li><strong>Property Context:</strong> Local keys storing the active hotel identifier when a user administers multiple properties.</li>
                <li><strong>Security & CSRF Protection:</strong> Cryptographic tokens to defend against cross-site request forgery attacks.</li>
              </ul>
              <p className="mt-3 text-xs sm:text-sm text-slate-600">
                We do NOT install third-party tracking cookies or behavioral advertising beacons that follow you across the internet.
              </p>
            </section>

            {/* Section 13 */}
            <section id="section-13" className="scroll-mt-24 bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <span className="flex items-center justify-center w-8 h-8 rounded-xl bg-brand-50 text-brand-600 font-bold text-sm border border-brand-200">
                  13
                </span>
                <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  International Transfers
                </h2>
              </div>
              <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
                HotelMantri operates internationally with physical representation in India and New Zealand. Our serverless compute and database infrastructure utilizes certified global cloud providers (AWS, Supabase, Vercel) adhering to strict encryption standards, ISO 27001 certifications, and Standard Contractual Clauses (SCCs). By using our services, you acknowledge that your information may be processed in secure facilities located across these operational regions.
              </p>
            </section>

            {/* Section 14 */}
            <section id="section-14" className="scroll-mt-24 bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <span className="flex items-center justify-center w-8 h-8 rounded-xl bg-brand-50 text-brand-600 font-bold text-sm border border-brand-200">
                  14
                </span>
                <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  Children's Privacy
                </h2>
              </div>
              <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
                HotelMantri is a business-to-business (B2B) hotel operations platform and is not intended for use by individuals under the age of 18. Where minor guests stay at a client hotel with adult parents or legal guardians, their guest count is recorded strictly as part of the family reservation under the registered adult's authorization. We do not knowingly collect personal data directly from minors.
              </p>
            </section>

            {/* Section 15 */}
            <section id="section-15" className="scroll-mt-24 bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <span className="flex items-center justify-center w-8 h-8 rounded-xl bg-brand-50 text-brand-600 font-bold text-sm border border-brand-200">
                  15
                </span>
                <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  Policy Updates
                </h2>
              </div>
              <p className="text-xs sm:text-sm text-slate-700 leading-relaxed mb-3">
                We may periodically update this Privacy Policy to reflect enhancements in our software, changes in Meta Developer Platform policies, or evolving statutory requirements.
              </p>
              <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
                When material modifications occur, we will update the "Effective Date" at the top of this document and notify subscribed hotel account administrators through dashboard notices or email communication prior to the changes taking effect. Continued use of HotelMantri constitutes acknowledgment of the updated terms.
              </p>
            </section>

            {/* Section 16 */}
            <section id="section-16" className="scroll-mt-24 bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <span className="flex items-center justify-center w-8 h-8 rounded-xl bg-brand-50 text-brand-600 font-bold text-sm border border-brand-200">
                  16
                </span>
                <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  Contact Information & Grievance Desk
                </h2>
              </div>
              <p className="mb-4 text-xs sm:text-sm text-slate-700">
                For questions regarding this policy, exercising your data rights, or contacting our designated Grievance Officer, please reach out through our official channels:
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs sm:text-sm">
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                  <h4 className="font-bold text-slate-900">Direct Compliance Desk</h4>
                  <div className="flex items-center gap-2 text-slate-700">
                    <Mail className="w-4 h-4 text-brand-600 shrink-0" />
                    <span>Compliance Email: <a href="mailto:privacy@hotelmantri.com" className="font-semibold text-brand-600 underline">privacy@hotelmantri.com</a></span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-700">
                    <Mail className="w-4 h-4 text-brand-600 shrink-0" />
                    <span>Support Email: <a href="mailto:booking@hotelmantri.com" className="font-semibold text-brand-600 underline">booking@hotelmantri.com</a></span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-700">
                    <Phone className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Helpline: <a href="tel:+919925958831" className="font-semibold hover:underline">+91 99259 58831</a></span>
                  </div>
                </div>

                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
                  <h4 className="font-bold text-slate-900 flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-cyan-600" />
                    Registered & Operating Offices
                  </h4>
                  <p className="text-slate-600 text-xs">
                    <strong className="text-slate-900">Mumbai:</strong> Sector 17, Vashi, Navi Mumbai, Maharashtra 400703, India
                  </p>
                  <p className="text-slate-600 text-xs">
                    <strong className="text-slate-900">Bhubaneswar:</strong> DCB 915, DLF CYBER CITY, Chandaka Industrial Estate, Patia, Bhubaneswar, Odisha 751024, India
                  </p>
                  <p className="text-slate-600 text-xs">
                    <strong className="text-slate-900">New Zealand:</strong> 2 Khyber Pass Road, Eden Terrace, Auckland 1010, New Zealand
                  </p>
                </div>
              </div>

              <div className="mt-4 p-3 bg-slate-100 rounded-xl text-xs text-slate-600 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-brand-600 shrink-0" />
                <span>Under the DPDP Act guidelines, our Grievance Desk acknowledges requests within 48 hours and provides definitive resolution within 30 days.</span>
              </div>
            </section>

          </article>
        </div>
      </main>

      {/* ── Sub-Footer ── */}
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

export default PrivacyPolicyScreen;
