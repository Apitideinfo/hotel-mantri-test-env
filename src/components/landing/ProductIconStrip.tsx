import React from 'react';
import { Bed, Share2, CalendarDays, BarChart3, Users } from 'lucide-react';
import { RevealOnScroll } from './RevealOnScroll';

interface ProductItem {
  id: string;
  name: string;
  iconBg: string;
  iconColor: string;
  hoverBorder: string;
  icon: React.ReactNode;
  description?: string;
}

interface ProductIconStripProps {
  onSelectProduct?: (productId: string) => void;
}

export const ProductIconStrip: React.FC<ProductIconStripProps> = ({ onSelectProduct }) => {
  const products: ProductItem[] = [
    {
      id: 'pms',
      name: 'PMS',
      iconBg: 'bg-[#E0F2FE]',
      iconColor: 'text-[#0284C7]',
      hoverBorder: 'hover:border-[#0284C7]',
      icon: <Bed className="w-6 h-6 stroke-[2.2]" />,
      description: 'Cloud Front Desk & Reservations',
    },
    {
      id: 'channel-manager',
      name: 'Channel Manager',
      iconBg: 'bg-[#F3E8FF]',
      iconColor: 'text-[#9333EA]',
      hoverBorder: 'hover:border-[#9333EA]',
      icon: <Share2 className="w-6 h-6 stroke-[2.2]" />,
      description: 'Instant 2-Way OTA Synchronization',
    },
    {
      id: 'booking-engine',
      name: 'Booking Engine',
      iconBg: 'bg-[#DCFCE7]',
      iconColor: 'text-[#16A34A]',
      hoverBorder: 'hover:border-[#16A34A]',
      icon: <CalendarDays className="w-6 h-6 stroke-[2.2]" />,
      description: 'Commission-Free Direct Bookings',
    },
    {
      id: 'pos',
      name: 'POS',
      iconBg: 'bg-[#FFEDD5]',
      iconColor: 'text-[#EA580C]',
      hoverBorder: 'hover:border-[#EA580C]',
      icon: (
        <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
          {/* Food service cloche tray icon matching Screenshot 2 */}
          <path d="M12 4a1.5 1.5 0 0 0-1.5 1.5c0 .24.06.46.16.66C6.7 6.64 3.5 10.43 3.5 15h17c0-4.57-3.2-8.36-7.16-8.84.1-.2.16-.42.16-.66A1.5 1.5 0 0 0 12 4zm-9 13v2h18v-2H3z" />
          <circle cx="15.5" cy="2.5" r="1" fill="#EA580C" opacity="0.8" />
        </svg>
      ),
      description: 'Restaurant, Bar & Room Service Billing',
    },
    {
      id: 'reports',
      name: 'Reports',
      iconBg: 'bg-[#FEE2E2]',
      iconColor: 'text-[#DC2626]',
      hoverBorder: 'hover:border-[#DC2626]',
      icon: <BarChart3 className="w-6 h-6 stroke-[2.4]" />,
      description: 'Real-time Financial & Occupancy Analytics',
    },
    {
      id: 'guest-management',
      name: 'Guest Management',
      iconBg: 'bg-[#E0E7FF]',
      iconColor: 'text-[#4F46E5]',
      hoverBorder: 'hover:border-[#4F46E5]',
      icon: <Users className="w-6 h-6 stroke-[2.2]" />,
      description: 'CRM, Guest Profiles & WhatsApp Comms',
    },
  ];

  const handleClick = (id: string) => {
    if (onSelectProduct) {
      onSelectProduct(id);
    } else {
      const el = document.getElementById('features');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <section className="relative w-full py-10 sm:py-14 bg-white select-none border-b border-gray-100 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        <RevealOnScroll variant="fade-up" duration={600}>
          {/* Horizontal Row of 6 Product Circles Matching Screenshot 2 */}
          <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-8 md:gap-10 lg:gap-14">
            {products.map((item, idx) => (
              <button
                key={item.id}
                onClick={() => handleClick(item.id)}
                className="group flex flex-col items-center gap-2.5 text-center cursor-pointer transition-all duration-300 focus:outline-none"
              >
                {/* Product Icon Circle */}
                <div
                  className={`w-16 h-16 sm:w-18 sm:h-18 md:w-20 md:h-20 rounded-full ${item.iconBg} ${item.iconColor} flex items-center justify-center shadow-sm group-hover:shadow-md group-hover:scale-110 group-active:scale-95 transition-all duration-300 ring-4 ring-transparent group-hover:ring-gray-100/80`}
                >
                  <div className="transform group-hover:rotate-6 transition-transform duration-300">
                    {item.icon}
                  </div>
                </div>

                {/* Product Label */}
                <span className="text-xs sm:text-sm font-bold text-gray-800 group-hover:text-black tracking-tight transition-colors duration-200 whitespace-nowrap">
                  {item.name}
                </span>
              </button>
            ))}
          </div>
        </RevealOnScroll>

      </div>
    </section>
  );
};
