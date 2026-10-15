import React, { useState, useEffect } from 'react';
import {
  Trash2,
  ShieldCheck,
  Search,
  CheckCircle2,
  AlertCircle,
  Clock,
  FileText,
  Lock,
  ArrowLeft,
  Mail,
  Phone,
  HelpCircle,
  Loader2,
  ExternalLink,
  Info,
} from 'lucide-react';

interface DataDeletionScreenProps {
  onNavigateHome?: () => void;
  onNavigatePrivacy?: () => void;
  onNavigateTerms?: () => void;
  isAuthenticated?: boolean;
}

export const DataDeletionScreen: React.FC<DataDeletionScreenProps> = ({
  onNavigateHome,
  onNavigatePrivacy,
  onNavigateTerms,
  isAuthenticated = false,
}) => {
  // Form State
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<'guest' | 'staff' | 'hotel_owner' | 'whatsapp_recipient'>('guest');
  const [hotelName, setHotelName] = useState('');
  const [bookingRef, setBookingRef] = useState('');
  const [requestType, setRequestType] = useState('full_deletion');
  const [reason, setReason] = useState('');
  const [confirmedAccuracy, setConfirmedAccuracy] = useState(false);

  // Submission State
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Status Lookup State
  const [searchCode, setSearchCode] = useState('');
  const [searching, setSearching] = useState(false);
  const [statusResult, setStatusResult] = useState<any | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  useEffect(() => {
    const prevTitle = document.title;
    document.title = 'User Data Deletion & Privacy Instructions — HotelMantri';

    let metaDesc = document.querySelector('meta[name="description"]');
    const prevDesc = metaDesc ? metaDesc.getAttribute('content') : '';
    if (metaDesc) {
      metaDesc.setAttribute(
        'content',
        'Official instructions and interactive portal for requesting user data deletion, WhatsApp opt-outs, and tracking deletion request status on HotelMantri.'
      );
    }

    // Auto-check URL query param for code (?code=...)
    try {
      const params = new URLSearchParams(window.location.search);
      const codeFromUrl = params.get('code');
      if (codeFromUrl) {
        setSearchCode(codeFromUrl);
        handleLookupStatus(codeFromUrl);
      }
    } catch {}

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

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setSubmitSuccess(null);

    if (!confirmedAccuracy) {
      setSubmitError('Please certify that you are the data subject or authorized representative.');
      return;
    }

    if (!email.trim() && !phone.trim()) {
      setSubmitError('Please provide at least a valid email address or phone number.');
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch('/api/compliance/deletion-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
          role,
          hotelName: hotelName.trim(),
          bookingRef: bookingRef.trim(),
          requestType,
          reason: reason.trim(),
          confirmedAccuracy,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || data.message || 'Failed to submit deletion request.');
      }

      setSubmitSuccess(data.confirmationCode);
      setSearchCode(data.confirmationCode);
      // Auto fetch status
      handleLookupStatus(data.confirmationCode);
    } catch (err: any) {
      setSubmitError(err.message || 'An error occurred while submitting your request.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLookupStatus = async (codeToSearch?: string) => {
    const code = (codeToSearch || searchCode).trim();
    if (!code) {
      setStatusError('Please enter a confirmation code.');
      return;
    }

    setStatusError(null);
    setStatusResult(null);

    try {
      setSearching(true);
      const res = await fetch(`/api/meta/deletion-status/${encodeURIComponent(code)}`);
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || 'No deletion request found for this confirmation code.');
      }

      setStatusResult(data);
    } catch (err: any) {
      setStatusError(err.message || 'Failed to retrieve request status.');
    } finally {
      setSearching(false);
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
              <span className="text-[10px] font-bold uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-200 px-2 py-0.5 rounded-full ml-1 hidden md:inline-block">
                Data Deletion
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

      {/* ── Hero Banner ── */}
      <section className="bg-gradient-to-b from-slate-900 via-slate-900 to-slate-800 text-white py-12 sm:py-16 px-4 sm:px-6 lg:px-8 border-b border-slate-800">
        <div className="max-w-5xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-500/10 border border-rose-400/30 text-rose-300 text-xs font-bold uppercase tracking-wider mb-4">
            <Trash2 className="w-4 h-4 text-rose-400" />
            Meta Platform & Statutory Deletion Framework
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-white mb-4">
            User Data Deletion & Privacy Instructions
          </h1>
          <p className="text-slate-300 text-sm sm:text-base max-w-3xl leading-relaxed">
            In accordance with Meta Platform policies, the Indian Digital Personal Data Protection Act (DPDP Act), and international privacy standards, this page provides clear instructions on how hotel guests, staff, hotel operators, and WhatsApp message recipients can request deletion of personal information.
          </p>
        </div>
      </section>

      {/* ── Main Body ── */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 space-y-10">

        {/* 1. Track Request Status Box */}
        <section className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <Search className="w-5 h-5 text-brand-600" />
            <h2 className="text-lg sm:text-xl font-bold text-slate-900">
              Check Deletion Request Status
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-slate-600 mb-4">
            If you submitted a request or uninstalled the HotelMantri Meta/WhatsApp app, enter your Confirmation Code (e.g. <code>HM-DEL-20261015-A1B2C3D4</code>) below to view its real-time disposition.
          </p>

          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={searchCode}
              onChange={(e) => setSearchCode(e.target.value.toUpperCase())}
              placeholder="e.g. HM-DEL-20261015-9F4B182C"
              className="flex-1 px-4 py-2.5 rounded-xl border border-slate-300 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 bg-slate-50"
            />
            <button
              onClick={() => handleLookupStatus()}
              disabled={searching || !searchCode.trim()}
              className="px-6 py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-bold text-sm rounded-xl transition flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Check Status'}
            </button>
          </div>

          {statusError && (
            <div className="mt-4 p-3.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
              <span>{statusError}</span>
            </div>
          )}

          {statusResult && (
            <div className="mt-5 p-5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-500">Confirmation Code</span>
                  <p className="font-mono font-bold text-sm text-slate-900">{statusResult.confirmationCode}</p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] uppercase font-bold text-slate-500">Current Status</span>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    {statusResult.statusLabel || statusResult.status}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-600">
                <div>
                  <span className="font-semibold text-slate-700">Source:</span> {statusResult.source}
                </div>
                <div>
                  <span className="font-semibold text-slate-700">Submitted:</span> {new Date(statusResult.submittedAt).toLocaleString()}
                </div>
              </div>

              <div className="p-3 bg-white rounded-lg border border-slate-200 text-xs text-slate-700">
                <strong className="block text-slate-900 mb-1">Disposition Notes:</strong>
                <p>{statusResult.dispositionNotes}</p>
              </div>

              {statusResult.retentionNotice && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-900 flex items-start gap-2">
                  <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>{statusResult.retentionNotice}</span>
                </div>
              )}
            </div>
          )}
        </section>

        {/* 2. Step-by-Step Instructions */}
        <section className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-6">
          <div className="flex items-center gap-3">
            <FileText className="w-5 h-5 text-brand-600" />
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              How Data Deletion Works at HotelMantri
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-brand-100 text-brand-700 font-bold text-xs">
                Step 1
              </span>
              <h3 className="font-bold text-slate-900 text-sm">Submit Request</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Provide your name, contact phone/email, and relationship (guest, staff, or WhatsApp recipient) via the form below or email <a href="mailto:privacy@hotelmantri.com" className="text-brand-600 underline">privacy@hotelmantri.com</a>.
              </p>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-brand-100 text-brand-700 font-bold text-xs">
                Step 2
              </span>
              <h3 className="font-bold text-slate-900 text-sm">Identity & Scope Verification</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Our compliance desk verifies that the request originates from the actual data subject to prevent malicious third-party account deletions.
              </p>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-brand-100 text-brand-700 font-bold text-xs">
                Step 3
              </span>
              <h3 className="font-bold text-slate-900 text-sm">Purge & Status Update</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Non-financial personal data is permanently deleted or anonymized within 30 days. You receive an auditable Confirmation Code to track progress.
              </p>
            </div>
          </div>

          {/* Statutory Retentions Disclosure */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs sm:text-sm text-amber-950 space-y-2">
            <h4 className="font-bold text-amber-900 flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 text-amber-600" />
              Statutory Accounting & Tax Retention Exceptions
            </h4>
            <p className="text-amber-900 leading-relaxed">
              Under <strong>Section 44AA of the Indian Income Tax Act, 1961</strong> and <strong>Section 36 of the Central Goods and Services Tax (CGST) Act, 2017</strong>, hotel establishments and technology processors are legally obligated to maintain books of accounts, tax invoices, folio statements, and payment reconciliation records for a mandatory statutory period of <strong>6 to 8 years</strong>.
            </p>
            <p className="text-amber-900 leading-relaxed">
              When a deletion request is completed for a guest with finalized billing records, <strong>non-financial contact details</strong> (mobile number, personal email, marketing preferences) are permanently scrubbed, while underlying tax invoice numbers and payment ledgers are anonymized and retained strictly for legal compliance.
            </p>
          </div>
        </section>

        {/* 3. Interactive Deletion Request Form */}
        <section className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <Trash2 className="w-5 h-5 text-rose-600" />
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Submit a Data Deletion Request
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-slate-600 mb-6">
            Complete the form below to initiate an auditable deletion ticket. We will acknowledge your request within 48 hours and process it within 30 days.
          </p>

          {submitSuccess && (
            <div className="mb-6 p-5 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2">
              <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                Request Successfully Registered!
              </div>
              <p className="text-xs text-emerald-700">
                Your Confirmation Code is: <strong className="font-mono text-emerald-900 text-sm">{submitSuccess}</strong>. Please bookmark or save this code to check your status.
              </p>
            </div>
          )}

          {submitError && (
            <div className="mb-6 p-4 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
              <span>{submitError}</span>
            </div>
          )}

          <form onSubmit={handleSubmitForm} className="space-y-4 text-xs sm:text-sm">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Full Legal Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Rahul Sharma"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Your Role / Relationship <span className="text-rose-500">*</span>
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as any)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="guest">Hotel Guest (Stayed at a HotelMantri property)</option>
                  <option value="whatsapp_recipient">WhatsApp Notification Recipient</option>
                  <option value="staff">Former Hotel Staff Member</option>
                  <option value="hotel_owner">Hotel Owner / Former Client Account</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Email Address <span className="text-slate-400 font-normal">(Required if phone not provided)</span>
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Mobile Number with Country Code <span className="text-slate-400 font-normal">(e.g. +91 98765 43210)</span>
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 99259 58831"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Hotel Name or Property Visited <span className="text-slate-400 font-normal">(if known)</span>
                </label>
                <input
                  type="text"
                  value={hotelName}
                  onChange={(e) => setHotelName(e.target.value)}
                  placeholder="e.g. Hotel Mantri Staging / Hotel Gopal"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Booking Reference or Invoice # <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={bookingRef}
                  onChange={(e) => setBookingRef(e.target.value)}
                  placeholder="e.g. HM-BK-2026-0042"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Type of Request <span className="text-rose-500">*</span>
              </label>
              <select
                value={requestType}
                onChange={(e) => setRequestType(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="full_deletion">Full Personal Data Deletion & Anonymization</option>
                <option value="whatsapp_opt_out">WhatsApp Notification Opt-Out & Number Purge</option>
                <option value="staff_account_deletion">Staff Profile & Credentials Deletion</option>
                <option value="hotel_data_archive">Hotel Property Closure & Master Data Archival</option>
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Additional Notes or Specific Instructions <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <textarea
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Please describe any specific records, check-in dates, or phone numbers you wish to have removed."
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            <div className="pt-2">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  required
                  checked={confirmedAccuracy}
                  onChange={(e) => setConfirmedAccuracy(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500 w-4 h-4 shrink-0"
                />
                <span className="text-xs text-slate-600">
                  I certify that I am the data subject or authorized to act on their behalf. I understand that statutory tax invoices and payment vouchers are subject to statutory retention under Indian GST/Income Tax laws and will be restricted rather than deleted.
                </span>
              </label>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full sm:w-auto px-8 py-3 bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm rounded-xl shadow-md transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Submitting Request…
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4" /> Submit Deletion Request
                </>
              )}
            </button>
          </form>
        </section>

        {/* 4. Contact & Support Details */}
        <section className="bg-slate-100 rounded-2xl p-6 sm:p-8 border border-slate-200 space-y-4">
          <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-brand-600" />
            Questions or Appeals Concerning Data Deletion?
          </h3>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
            If you need assistance with an existing deletion ticket, wish to submit identity verification documents, or need clarification on why a tax invoice is retained under Section 44AA / CGST regulations, contact our Data Protection Desk:
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs sm:text-sm pt-2">
            <div className="flex items-center gap-3">
              <Mail className="w-4 h-4 text-brand-600 shrink-0" />
              <span>Email: <a href="mailto:privacy@hotelmantri.com" className="font-semibold text-brand-600 underline">privacy@hotelmantri.com</a></span>
            </div>
            <div className="flex items-center gap-3">
              <Phone className="w-4 h-4 text-emerald-600 shrink-0" />
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

export default DataDeletionScreen;
