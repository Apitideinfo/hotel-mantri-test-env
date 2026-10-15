import React from 'react';
import {
  ShieldCheck,
  Zap,
  MessageSquare,
  Globe2,
  CheckCircle2,
  FileText,
  Smartphone,
  Lock,
} from 'lucide-react';

export const WhyHotelMantri: React.FC = () => {
  const pillars = [
    {
      icon: FileText,
      tag: 'INDIA-FIRST',
      title: 'Built Specifically for Indian Hotels',
      desc: 'Native GST calculation, HSN/SAC codes, multi-payment tracking (UPI, Cash, Card), and instant Aadhaar/ID scanning.',
      benefits: ['100% GST & SAC compliant', 'UPI QR & multi-split payments', 'Aadhaar / Passport scanner'],
    },
    {
      icon: Smartphone,
      tag: 'CLOUD ACCESS',
      title: 'Zero Installation & Multi-Device Sync',
      desc: 'Access your full hotel operations securely from any browser, tablet, or phone — anytime, anywhere in real-time.',
      benefits: ['Instant cloud updates', 'Unlimited staff logins', 'Owner mobile app dashboard'],
    },
    {
      icon: MessageSquare,
      tag: 'AUTOMATION',
      title: 'Automated WhatsApp Communication',
      desc: 'Send instant booking confirmations, digital check-in slips, GST tax invoices, and feedback requests via WhatsApp.',
      benefits: ['98% open rate delivery', 'Digital guest registration', 'Automated review collector'],
    },
    {
      icon: Lock,
      tag: 'SECURITY',
      title: 'Enterprise Security & Audit Trails',
      desc: 'Role-based access permissions, complete audit trail logs for every cashier transaction, and automated day-end closing.',
      benefits: ['Role-based staff security', 'Complete cashier audit logs', 'Automated nightly cloud backup'],
    },
  ];

  return (
    <section
      id="why-hotelmantri"
      className="relative w-full py-20 lg:py-28 bg-[#fafafa] text-slate-900 select-none overflow-hidden border-b border-gray-200/80"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* ── Section Header ── */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="text-xs font-bold tracking-[0.25em] text-gray-500 uppercase">
            WHY CHOOSE US
          </span>
          <h2 className="text-3xl sm:text-5xl lg:text-[50px] font-extrabold text-black tracking-tight leading-[1.12] mt-2 mb-3">
            Engineered for Modern Hospitality
          </h2>
          <p className="text-gray-600 text-base sm:text-lg font-normal leading-relaxed">
            The all-in-one software that replaces messy paperwork, complex spreadsheets, and fragmented tools.
          </p>
        </div>

        {/* ── 4 Pillars 2x2 Grid ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {pillars.map((item, idx) => {
            const Icon = item.icon;

            return (
              <div
                key={idx}
                className="bg-white rounded-3xl p-8 sm:p-9 border border-gray-200/90 shadow-[0_2px_16px_rgba(0,0,0,0.03)] hover:shadow-[0_16px_36px_rgba(0,0,0,0.07)] hover:border-gray-300 transition-all duration-300 flex flex-col justify-between group hover:-translate-y-1"
              >
                <div>
                  {/* Tag + Icon */}
                  <div className="flex items-center justify-between mb-6">
                    <span className="text-xs font-bold px-3 py-1 rounded-full bg-gray-100 text-gray-800 tracking-wider">
                      {item.tag}
                    </span>
                    <div className="w-12 h-12 rounded-2xl bg-black text-white flex items-center justify-center group-hover:bg-[#0891b2] transition-colors shadow-sm">
                      <Icon className="w-6 h-6 stroke-[1.8]" />
                    </div>
                  </div>

                  {/* Title & Description */}
                  <h3 className="text-xl sm:text-2xl font-bold text-gray-950 tracking-tight mb-3">
                    {item.title}
                  </h3>
                  <p className="text-gray-500 text-sm sm:text-[15px] leading-relaxed mb-6">
                    {item.desc}
                  </p>

                  {/* Checklist */}
                  <div className="space-y-2.5 pt-4 border-t border-gray-100">
                    {item.benefits.map((b, i) => (
                      <div key={i} className="flex items-center gap-2.5 text-xs sm:text-sm font-semibold text-gray-700">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>{b}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
};
