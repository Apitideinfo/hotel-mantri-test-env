import React from 'react';
import { UserPlus, Building2, TrendingUp, CheckCircle2, ArrowRight } from 'lucide-react';

export const HowItWorks: React.FC = () => {
  const steps = [
    {
      step: '01',
      icon: UserPlus,
      title: 'Create Your Property Account',
      desc: 'Sign up in under 60 seconds. Set up your hotel profile and staff logins with zero technical setup required.',
      highlights: ['Instant activation', 'Free trial included', 'No hardware needed'],
    },
    {
      step: '02',
      icon: Building2,
      title: 'Configure Rooms & Rates',
      desc: 'Add your room categories, pricing tiers, and connect 2-way OTA channel manager with 100+ booking portals.',
      highlights: ['Bulk room inventory', 'Dynamic pricing rules', 'Instant OTA sync'],
    },
    {
      step: '03',
      icon: TrendingUp,
      title: 'Automate & Grow Daily Revenue',
      desc: 'Manage express 30s check-ins, automated WhatsApp billing, GST invoicing, and real-time revenue analytics.',
      highlights: ['WhatsApp guest slips', '1-Click night audit', '100% GST compliant'],
    },
  ];

  return (
    <section
      id="how-it-works"
      className="relative w-full py-20 lg:py-28 bg-white text-slate-900 select-none overflow-hidden border-b border-gray-100"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* ── Section Header ── */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="text-xs font-bold tracking-[0.25em] text-gray-500 uppercase">
            ONBOARDING
          </span>
          <h2 className="text-3xl sm:text-5xl lg:text-[50px] font-extrabold text-black tracking-tight leading-[1.12] mt-2 mb-3">
            Get Started in 3 Simple Steps
          </h2>
          <p className="text-gray-600 text-base sm:text-lg font-normal leading-relaxed">
            From account setup to your first check-in in under 10 minutes.
          </p>
        </div>

        {/* ── 3 Steps Grid ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {steps.map((st, i) => {
            const Icon = st.icon;

            return (
              <div
                key={i}
                className="bg-white rounded-3xl p-8 border border-gray-200/90 shadow-[0_2px_16px_rgba(0,0,0,0.03)] hover:shadow-[0_16px_36px_rgba(0,0,0,0.07)] hover:border-gray-300 transition-all duration-300 flex flex-col justify-between group hover:-translate-y-1"
              >
                <div>
                  {/* Step Number + Icon Header */}
                  <div className="flex items-center justify-between mb-6">
                    <span className="text-3xl font-black text-gray-900 tracking-tight">
                      {st.step}
                    </span>
                    <div className="w-12 h-12 rounded-2xl bg-black text-white flex items-center justify-center group-hover:bg-[#1d63ed] transition-colors shadow-sm">
                      <Icon className="w-6 h-6 stroke-[1.8]" />
                    </div>
                  </div>

                  {/* Title & Description */}
                  <h3 className="text-xl font-bold text-gray-950 tracking-tight mb-3">
                    {st.title}
                  </h3>
                  <p className="text-gray-500 text-sm leading-relaxed mb-6">
                    {st.desc}
                  </p>

                  {/* Highlight Checklist */}
                  <div className="space-y-2.5 pt-4 border-t border-gray-100">
                    {st.highlights.map((h, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-xs font-semibold text-gray-700">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>{h}</span>
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
