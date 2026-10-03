import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface FAQItem {
  q: string;
  a: string;
}

const FAQ_ITEMS: FAQItem[] = [
  {
    q: 'What types of properties can use HotelMantri?',
    a: 'HotelMantri is purpose-built for Indian hospitality properties — boutique hotels, business hotels, guest houses, heritage properties, resorts, and multi-property chains. Whether you manage 5 rooms or 500, HotelMantri scales seamlessly.',
  },
  {
    q: 'Is HotelMantri 100% GST-compliant for Indian hotels?',
    a: 'Yes. HotelMantri automatically generates GST-compliant tax invoices with GSTIN, SAC/HSN codes, and proper tax bifurcation (CGST + SGST or IGST). Monthly GSTR-1 ready reports are also generated in one click.',
  },
  {
    q: 'Can I use HotelMantri on my mobile, tablet, and PC?',
    a: 'Absolutely. HotelMantri is fully cloud-based and responsive. You and your staff can access live room charts, express check-in, and bills from any device without installing heavy desktop software.',
  },
  {
    q: 'How does the Channel Manager & OTA sync work?',
    a: 'HotelMantri connects 2-way with MakeMyTrip, Booking.com, Goibibo, Agoda, and Expedia. When a room is booked on any channel or walk-in, inventory and rates sync instantly across all OTAs to eliminate overbookings.',
  },
  {
    q: 'Can I send invoices and booking slips on WhatsApp?',
    a: 'Yes! HotelMantri features built-in WhatsApp automation. You can send digital check-in slips, advance booking vouchers, and final GST tax invoices directly to guests on WhatsApp in one click.',
  },
  {
    q: 'Can I try HotelMantri before purchasing?',
    a: 'Yes, we offer a free trial with full feature access so you can test live room charts and billing on your property with zero commitment and no credit card required.',
  },
];

export const FAQSection: React.FC = () => {
  const [open, setOpen] = useState<number | null>(0);

  const toggle = (idx: number) => {
    setOpen(open === idx ? null : idx);
  };

  return (
    <section
      id="faq"
      className="relative w-full py-20 lg:py-28 bg-[#fafafa] text-slate-900 select-none overflow-hidden border-b border-gray-200/80"
    >
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* ── Section Header ── */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="text-xs font-bold tracking-[0.25em] text-gray-500 uppercase">
            FAQ
          </span>
          <h2 className="text-3xl sm:text-5xl lg:text-[50px] font-extrabold text-black tracking-tight leading-[1.12] mt-2 mb-3">
            Frequently Asked Questions
          </h2>
          <p className="text-gray-600 text-base sm:text-lg font-normal leading-relaxed">
            Everything you need to know about HotelMantri setup and features.
          </p>
        </div>

        {/* ── FAQ Accordion List ── */}
        <div className="space-y-3.5">
          {FAQ_ITEMS.map((item, idx) => {
            const isOpen = open === idx;

            return (
              <div
                key={idx}
                className="bg-white rounded-2xl border border-gray-200/90 shadow-sm overflow-hidden transition-all duration-200"
              >
                <button
                  onClick={() => toggle(idx)}
                  className="w-full text-left px-6 py-5 flex items-center justify-between gap-4 cursor-pointer hover:bg-gray-50/50 transition-colors"
                >
                  <span className="font-bold text-gray-950 text-base sm:text-[17px] tracking-tight">
                    {item.q}
                  </span>
                  <div
                    className={`w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center shrink-0 transition-transform duration-200 ${
                      isOpen ? 'rotate-180 bg-black text-white border-black' : 'text-gray-500 bg-white'
                    }`}
                  >
                    <ChevronDown className="w-4 h-4" />
                  </div>
                </button>

                {isOpen && (
                  <div className="px-6 pb-6 pt-1 text-gray-600 text-sm sm:text-base leading-relaxed border-t border-gray-100">
                    {item.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
};
