import { useEffect, useRef, useState, ReactNode, useMemo, useCallback } from 'react';
import {
  LayoutGrid,
  ClipboardList,
  CalendarDays,
  Wallet,
  BarChart3,
  Paintbrush,
  Share2,
  Settings2,
  Utensils,
  Settings,
  LogOut,
  ChevronRight,
  ChevronDown,
  ChevronLeft,
  Search,
  X,
  Menu,
  Bell,
  UserRound,
  KeyRound,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  Building2,
  Receipt,
  Users,
  Shirt,
  Sparkles,
  Lock,
  CalendarClock,
  TrendingUp,
  MessageCircle,
  FileBarChart,
  FileText,
  BedDouble,
  LogIn,
  Armchair,
  ChefHat,
  RefreshCw,
  Mail,
  Phone,
} from 'lucide-react';
import { BrandLogo, BrandIcon, HotelMantriVectorIcon } from '@/components/BrandLogo';
import { layout } from '@/lib/theme';
import { useAuth } from '@/lib/auth';
import { getTodayLocal } from '@/lib/calc';
import { getEnabledHotelFeatures } from '@/lib/api';
import { useChannelSyncStatus } from '@/lib/externalChannelSyncService';
import type { AppNotification } from '@/enterprise/types';
import { getNotifications, markAllNotificationsRead, markNotificationRead } from '@/enterprise/api';

export interface NavItem {
  key: string;
  label: string;
  icon?: ReactNode;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export interface SubNavItem {
  key: string;
  label: string;
}

export interface NavCardItem {
  id: string;
  label: string;
  subtitle: string;
  icon: ReactNode;
  defaultScreen: string;
  squircleBg: string;
  squircleColor: string;
  activeContainerBg: string;
  activeBorder: string;
  activeTextColor: string;
  activeSquircleBg: string;
  activeSquircleColor: string;
  subItems?: SubNavItem[];
}

const PRIMARY_NAV_CARDS: NavCardItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    subtitle: 'Overview & KPIs',
    icon: <LayoutGrid className="w-5 h-5 stroke-[2]" />,
    defaultScreen: 'dashboard',
    squircleBg: 'bg-blue-100',
    squircleColor: 'text-[#2563EB]',
    activeContainerBg: 'bg-blue-50/80',
    activeBorder: 'border-blue-100/90',
    activeTextColor: 'text-[#2563EB]',
    activeSquircleBg: 'bg-[#2563EB]',
    activeSquircleColor: 'text-white',
  },
  {
    id: 'operations-board',
    label: 'Operations Board',
    subtitle: 'Daily hotel activity',
    icon: <ClipboardList className="w-5 h-5 stroke-[2]" />,
    defaultScreen: 'operations',
    squircleBg: 'bg-[#D1FAE5]',
    squircleColor: 'text-[#059669]',
    activeContainerBg: 'bg-emerald-50/80',
    activeBorder: 'border-emerald-100/90',
    activeTextColor: 'text-[#059669]',
    activeSquircleBg: 'bg-[#059669]',
    activeSquircleColor: 'text-white',
  },
  {
    id: 'reservations',
    label: 'Reservations',
    subtitle: 'Bookings, arrivals, departures',
    icon: <CalendarDays className="w-5 h-5 stroke-[2]" />,
    defaultScreen: 'reservations',
    squircleBg: 'bg-[#EDE9FE]',
    squircleColor: 'text-[#7C3AED]',
    activeContainerBg: 'bg-purple-50/80',
    activeBorder: 'border-purple-100/90',
    activeTextColor: 'text-[#7C3AED]',
    activeSquircleBg: 'bg-[#7C3AED]',
    activeSquircleColor: 'text-white',
    subItems: [
      { key: 'reservations', label: 'All Reservations' },
      { key: 'arrivals', label: 'Arrivals' },
      { key: 'departures', label: 'Departures' },
      { key: 'inhouse', label: 'In-house Guests' },
    ],
  },
  {
    id: 'finance',
    label: 'Finance',
    subtitle: 'Cash, expenses, reports',
    icon: <Wallet className="w-5 h-5 stroke-[2]" />,
    defaultScreen: 'finance',
    squircleBg: 'bg-[#FEF3C7]',
    squircleColor: 'text-[#D97706]',
    activeContainerBg: 'bg-amber-50/80',
    activeBorder: 'border-amber-100/90',
    activeTextColor: 'text-[#D97706]',
    activeSquircleBg: 'bg-[#D97706]',
    activeSquircleColor: 'text-white',
    subItems: [
      { key: 'finance', label: 'Finance Hub' },
      { key: 'close-day', label: 'Day Closing' },
      { key: 'ledgers', label: 'Company Ledgers' },
      { key: 'expense-entry', label: 'Expense Entries' },
    ],
  },
  {
    id: 'reports',
    label: 'Reports',
    subtitle: 'Daily, MTD, YTD',
    icon: <BarChart3 className="w-5 h-5 stroke-[2]" />,
    defaultScreen: 'report',
    squircleBg: 'bg-[#E0F2FE]',
    squircleColor: 'text-[#0284C7]',
    activeContainerBg: 'bg-sky-50/80',
    activeBorder: 'border-sky-100/90',
    activeTextColor: 'text-[#0284C7]',
    activeSquircleBg: 'bg-[#0284C7]',
    activeSquircleColor: 'text-white',
    subItems: [
      { key: 'report', label: 'Daily Report' },
      { key: 'mtd', label: 'MTD Report' },
      { key: 'ytd', label: 'YTD Report' },
      { key: 'mis-report', label: 'Daily MIS' },
      { key: 'pdf', label: 'PDF Reports' },
      { key: 'whatsapp', label: 'WhatsApp Summary' },
    ],
  },
  {
    id: 'operations',
    label: 'Operations',
    subtitle: 'Housekeeping, laundry, guests',
    icon: <Paintbrush className="w-5 h-5 stroke-[2]" />,
    defaultScreen: 'housekeeping',
    squircleBg: 'bg-[#FFE4E6]',
    squircleColor: 'text-[#E11D48]',
    activeContainerBg: 'bg-rose-50/80',
    activeBorder: 'border-rose-100/90',
    activeTextColor: 'text-[#E11D48]',
    activeSquircleBg: 'bg-[#E11D48]',
    activeSquircleColor: 'text-white',
    subItems: [
      { key: 'housekeeping', label: 'Housekeeping' },
      { key: 'laundry-linen', label: 'Laundry & Linen' },
      { key: 'crm', label: 'Guests CRM' },
    ],
  },
  {
    id: 'channel-manager',
    label: 'Channel Manager',
    subtitle: 'Inventory & OTA sync',
    icon: <Share2 className="w-5 h-5 stroke-[2]" />,
    defaultScreen: 'channel-manager',
    squircleBg: 'bg-[#EDE9FE]',
    squircleColor: 'text-[#6D28D9]',
    activeContainerBg: 'bg-violet-50/80',
    activeBorder: 'border-violet-100/90',
    activeTextColor: 'text-[#6D28D9]',
    activeSquircleBg: 'bg-[#6D28D9]',
    activeSquircleColor: 'text-white',
  },
  {
    id: 'master',
    label: 'Master',
    subtitle: 'Property, staff & settings',
    icon: <Settings2 className="w-5 h-5 stroke-[2]" />,
    defaultScreen: 'property',
    squircleBg: 'bg-[#CCFBF1]',
    squircleColor: 'text-[#0F766E]',
    activeContainerBg: 'bg-teal-50/80',
    activeBorder: 'border-teal-100/90',
    activeTextColor: 'text-[#0F766E]',
    activeSquircleBg: 'bg-[#0F766E]',
    activeSquircleColor: 'text-white',
    subItems: [
      { key: 'property', label: 'Property Master' },
      { key: 'users', label: 'Staff & Roles' },
      { key: 'settings', label: 'System Settings' },
    ],
  },
  {
    id: 'restaurant-pos',
    label: 'Restaurant POS',
    subtitle: 'Orders, billing, tables',
    icon: <Utensils className="w-5 h-5 stroke-[2]" />,
    defaultScreen: 'pos-dashboard',
    squircleBg: 'bg-[#FEE2E2]',
    squircleColor: 'text-[#DC2626]',
    activeContainerBg: 'bg-rose-50/80',
    activeBorder: 'border-rose-100/90',
    activeTextColor: 'text-[#DC2626]',
    activeSquircleBg: 'bg-[#DC2626]',
    activeSquircleColor: 'text-white',
    subItems: [
      { key: 'pos-dashboard', label: 'POS Dashboard' },
      { key: 'pos-new-order', label: 'New Order' },
      { key: 'pos-kds', label: 'Kitchen Display' },
      { key: 'pos-billing', label: 'Billing & Payment' },
      { key: 'pos-tables', label: 'Tables' },
      { key: 'pos-menu', label: 'Menu Management' },
      { key: 'pos-reports', label: 'Reports' },
    ],
  },
];

const SETTINGS_CARD: NavCardItem = {
  id: 'settings',
  label: 'Settings',
  subtitle: 'App preferences, notifications',
  icon: <Settings className="w-5 h-5 stroke-[2]" />,
  defaultScreen: 'settings',
  squircleBg: 'bg-[#F1F5F9]',
  squircleColor: 'text-[#64748B]',
  activeContainerBg: 'bg-slate-100/90',
  activeBorder: 'border-slate-200/90',
  activeTextColor: 'text-slate-900',
  activeSquircleBg: 'bg-[#334155]',
  activeSquircleColor: 'text-white',
};

/**
 * Maps any screen in the system to its parent category ID
 */
const getActiveCategoryId = (screen: string): string => {
  if (['dashboard'].includes(screen)) return 'dashboard';
  if (['operations', 'roomchart', 'entry'].includes(screen)) return 'operations-board';
  if (
    [
      'reservations',
      'reservations-board',
      'reservations-groups',
      'reservations-rates',
      'reservations-waitlist',
      'reservations-reports',
      'arrivals',
      'departures',
      'inhouse',
    ].includes(screen)
  )
    return 'reservations';
  if (
    [
      'finance',
      'close-day',
      'ledger',
      'other',
      'expense-entry',
      'expense-ledger',
      'staff',
      'salary-advance',
      'salary-settlement',
      'electricity',
      'utility-bills',
      'laundry',
      'monthly-bills',
      'profitability',
      'gst-report',
      'ledgers',
      'pl-report',
      'finance-dashboard',
      'chart-of-accounts',
      'journals',
      'cash-book',
      'bank-book',
      'vouchers',
      'receivables',
      'payables',
      'vendor-ledger',
      'accounting-pl',
      'trial-balance',
      'balance-sheet',
      'reconciliation',
      'finance-exceptions',
      'opening-balances',
      'budgets',
      'historical-posting',
      'posting-rules',
    ].includes(screen)
  )
    return 'finance';
  if (
    [
      'report',
      'mtd',
      'ytd',
      'mis-report',
      'pdf',
      'whatsapp',
      'history',
      'analytics',
      'owner-dashboard',
      'analytics-booking',
      'analytics-category',
      'analytics-payment',
      'analytics-gst',
      'analytics-expense',
      'analytics-occupancy',
      'analytics-revenue',
    ].includes(screen)
  )
    return 'reports';
  if (
    [
      'housekeeping',
      'laundry-linen',
      'crm',
      'crm-directory',
      'crm-vip',
      'crm-corporate',
      'crm-agents',
      'crm-loyalty',
    ].includes(screen)
  )
    return 'operations';
  if (['channel-manager'].includes(screen)) return 'channel-manager';
  if (['property', 'subscription'].includes(screen)) return 'master';
  if (screen.startsWith('pos-')) return 'restaurant-pos';
  if (['settings'].includes(screen)) return 'settings';
  return '';
};

const findLabel = (key: string): string => {
  for (const item of PRIMARY_NAV_CARDS) {
    if (item.defaultScreen === key) return item.label;
    if (item.subItems) {
      const sub = item.subItems.find((s) => s.key === key);
      if (sub) return sub.label;
    }
  }
  if (SETTINGS_CARD.defaultScreen === key) return SETTINGS_CARD.label;
  return '';
};

interface SidebarContentProps {
  isMobile?: boolean;
  collapsed: boolean;
  hotelName?: string | null;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  currentScreen: string;
  go: (key: string) => void;
  onSignOut: () => void;
  setSidebarOpen: (open: boolean) => void;
  posEnabled?: boolean;
  role?: string | null;
  enabledFeatures?: Record<string, boolean> | null;
}

const SidebarContent = ({
  isMobile = false,
  collapsed,
  hotelName,
  searchQuery,
  setSearchQuery,
  currentScreen,
  go,
  onSignOut,
  setSidebarOpen,
  posEnabled = true,
  role,
  enabledFeatures,
}: SidebarContentProps) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const activeCategoryId = useMemo(() => getActiveCategoryId(currentScreen), [currentScreen]);

  // Filter items based on user role and permissions
  const visibleCards = useMemo(() => {
    let items = [...PRIMARY_NAV_CARDS];

    if (!posEnabled) {
      items = items.filter((item) => item.id !== 'restaurant-pos');
    }

    if (role === 'hotel_staff') {
      const restricted = ['finance', 'reports', 'channel-manager', 'master'];
      items = items.filter((item) => !restricted.includes(item.id));
    }

    const isSuperAdminRole = role === 'super_admin' || role === 'company_user';

    if (enabledFeatures && !isSuperAdminRole) {
      items = items.filter((item) => {
        if (item.id === 'dashboard' && enabledFeatures.dashboard === false) return false;
        if (item.id === 'operations-board' && enabledFeatures.room_chart === false) return false;
        if (item.id === 'finance' && enabledFeatures.finance === false) return false;
        if (item.id === 'reports' && enabledFeatures.daily_entry === false && enabledFeatures.mtd === false) return false;
        if (item.id === 'operations' && enabledFeatures.housekeeping === false) return false;
        if (item.id === 'channel-manager' && enabledFeatures.channel_manager === false) return false;
        return true;
      });
    }

    return items;
  }, [posEnabled, role, enabledFeatures]);

  // Search filtering
  const filteredCards = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return visibleCards;

    return visibleCards.filter((card) => {
      const matchLabel = card.label.toLowerCase().includes(q);
      const matchSub = card.subtitle.toLowerCase().includes(q);
      const matchChildren = card.subItems?.some((sub) => sub.label.toLowerCase().includes(q));
      return matchLabel || matchSub || matchChildren;
    });
  }, [searchQuery, visibleCards]);

  const handleCardClick = (card: NavCardItem) => {
    if (card.subItems && card.subItems.length > 0) {
      if (activeCategoryId !== card.id) {
        go(card.defaultScreen);
        setExpandedId(card.id);
      } else {
        setExpandedId((prev) => (prev === card.id ? null : card.id));
      }
    } else {
      go(card.defaultScreen);
    }
  };

  const handleChevronClick = (e: React.MouseEvent, card: NavCardItem) => {
    if (card.subItems && card.subItems.length > 0) {
      e.stopPropagation();
      setExpandedId((prev) => (prev === card.id ? null : card.id));
    }
  };

  const isSearching = searchQuery.trim().length > 0;

  // Render Collapsed Sidebar (Desktop)
  if (collapsed && !isMobile) {
    return (
      <div className="flex flex-col h-full bg-white select-none py-4 items-center justify-between">
        <div className="flex flex-col items-center gap-4 w-full">
          <button
            type="button"
            onClick={() => go('dashboard')}
            title={hotelName ?? 'Hotel Mantri'}
            className="cursor-pointer transition-transform hover:scale-105"
          >
            <HotelMantriVectorIcon size={34} />
          </button>

          <div className="w-8 border-t border-slate-100" />

          <nav className="flex flex-col items-center gap-2 w-full px-2">
            {filteredCards.map((card) => {
              const isActive = activeCategoryId === card.id;
              return (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => go(card.defaultScreen)}
                  title={`${card.label} — ${card.subtitle}`}
                  className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 transition-all cursor-pointer ${
                    isActive
                      ? `${card.activeSquircleBg} ${card.activeSquircleColor} shadow-md scale-105 ring-2 ring-blue-500/20`
                      : `${card.squircleBg} ${card.squircleColor} hover:scale-105`
                  }`}
                >
                  {card.icon}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="flex flex-col items-center gap-2 w-full px-2 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={() => go(SETTINGS_CARD.defaultScreen)}
            title={`${SETTINGS_CARD.label} — ${SETTINGS_CARD.subtitle}`}
            className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 transition-all cursor-pointer ${
              activeCategoryId === SETTINGS_CARD.id
                ? `${SETTINGS_CARD.activeSquircleBg} ${SETTINGS_CARD.activeSquircleColor} shadow-md`
                : `${SETTINGS_CARD.squircleBg} ${SETTINGS_CARD.squircleColor} hover:scale-105`
            }`}
          >
            {SETTINGS_CARD.icon}
          </button>
          <button
            type="button"
            onClick={onSignOut}
            title="Sign Out — End your session"
            className="w-11 h-11 rounded-2xl bg-[#FEF2F2] text-[#EF4444] flex items-center justify-center shrink-0 transition-all hover:bg-rose-100 hover:scale-105 cursor-pointer"
          >
            <LogOut className="w-5 h-5 stroke-[2]" />
          </button>
        </div>
      </div>
    );
  }

  // Render Full Sidebar (Mobile or Desktop Expanded)
  return (
    <div className="flex flex-col h-full bg-white select-none">
      {/* 1. Header with Brand Logo & Mobile Close Button */}
      <div className="flex items-center justify-between px-5 pt-5 pb-2 shrink-0">
        <BrandLogo variant="sidebar" className="shrink-0" />
        {isMobile && (
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition cursor-pointer"
            aria-label="Close menu"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* 2. Hotel Switcher / Property Title Header */}
      <div className="px-5 pt-1 pb-3 shrink-0">
        <button
          type="button"
          onClick={() => go('property')}
          className="w-full text-left group flex items-center justify-between py-1 px-1 rounded-xl hover:bg-slate-50 transition cursor-pointer"
        >
          <div className="min-w-0 flex-1 pr-2">
            <p className="text-sm font-black text-slate-900 truncate tracking-tight uppercase">
              {hotelName ? hotelName.toUpperCase() : 'HOTEL GOPAL'}
            </p>
            <p className="text-xs text-slate-400 font-medium">
              Management System
            </p>
          </div>
          <ChevronDown className="w-4 h-4 text-slate-700 shrink-0 group-hover:translate-y-0.5 transition-transform" />
        </button>
      </div>

      {/* 3. Search menu... input */}
      <div className="px-5 pb-3 shrink-0">
        <div className="flex items-center gap-2.5 bg-slate-50 border border-slate-200/80 rounded-2xl px-3.5 py-2.5 focus-within:border-blue-500 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-500/10 transition shadow-2xs">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search menu..."
            className="bg-transparent text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none w-full font-medium"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 4. Main Navigation Cards List */}
      <nav className="flex-1 overflow-y-auto px-4 pb-4 space-y-1 sidebar-scroll">
        {filteredCards.map((card) => {
          const isActive = activeCategoryId === card.id;
          const isExpanded = expandedId === card.id;
          const showSubItems = card.subItems && (isExpanded || isSearching);

          return (
            <div key={card.id}>
              <div
                onClick={() => handleCardClick(card)}
                className={`group w-full flex items-center gap-3.5 px-3 py-2.5 rounded-2xl transition-all duration-150 text-left cursor-pointer ${
                  isActive
                    ? `${card.activeContainerBg} ${card.activeBorder} border shadow-2xs`
                    : 'bg-transparent hover:bg-slate-50/80 border border-transparent'
                }`}
              >
                {/* Squircle Icon Box */}
                <div
                  className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 transition-colors ${
                    isActive
                      ? `${card.activeSquircleBg} ${card.activeSquircleColor} shadow-2xs`
                      : `${card.squircleBg} ${card.squircleColor}`
                  }`}
                >
                  {card.icon}
                </div>

                {/* Title & Subtitle */}
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-sm font-bold leading-tight truncate ${
                      isActive ? card.activeTextColor : 'text-slate-900'
                    }`}
                  >
                    {card.label}
                  </p>
                  <p className="text-xs text-slate-400 font-normal leading-tight truncate mt-0.5">
                    {card.subtitle}
                  </p>
                </div>

                {/* Right Chevron */}
                <button
                  type="button"
                  onClick={(e) => handleChevronClick(e, card)}
                  className="p-1 -mr-1 flex items-center justify-center cursor-pointer"
                  tabIndex={-1}
                  aria-label={`Toggle ${card.label}`}
                >
                  <ChevronRight
                    className={`w-4 h-4 shrink-0 transition-transform duration-200 ${
                      isActive
                        ? card.activeTextColor
                        : 'text-slate-300 group-hover:text-slate-400'
                    } ${isExpanded ? 'rotate-90' : ''}`}
                  />
                </button>
              </div>

              {/* Sub-menu accordion (if has sub-items and expanded/searching) */}
              {showSubItems && card.subItems && (
                <div className="mt-1 mb-2 ml-5 pl-7 border-l-2 border-slate-100 space-y-0.5 animate-fade-in">
                  {card.subItems
                    .filter((sub) =>
                      isSearching
                        ? sub.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          card.label.toLowerCase().includes(searchQuery.toLowerCase())
                        : true
                    )
                    .map((sub) => {
                      const isSubActive = currentScreen === sub.key;
                      return (
                        <button
                          key={sub.key}
                          type="button"
                          onClick={() => go(sub.key)}
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                            isSubActive
                              ? 'bg-blue-50 text-[#2563EB] font-bold shadow-2xs'
                              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                          }`}
                        >
                          <span className="truncate">{sub.label}</span>
                          {isSubActive && (
                            <span className="w-1.5 h-1.5 rounded-full bg-[#2563EB] shrink-0" />
                          )}
                        </button>
                      );
                    })}
                </div>
              )}
            </div>
          );
        })}

        {/* 5. Subtle Divider */}
        <div className="my-2.5 border-t border-slate-100" />

        {/* 6. Settings Card */}
        {(!searchQuery ||
          SETTINGS_CARD.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
          SETTINGS_CARD.subtitle.toLowerCase().includes(searchQuery.toLowerCase())) && (
          <div
            onClick={() => go(SETTINGS_CARD.defaultScreen)}
            className={`group w-full flex items-center gap-3.5 px-3 py-2.5 rounded-2xl transition-all duration-150 text-left cursor-pointer ${
              activeCategoryId === SETTINGS_CARD.id
                ? `${SETTINGS_CARD.activeContainerBg} ${SETTINGS_CARD.activeBorder} border shadow-2xs`
                : 'bg-transparent hover:bg-slate-50/80 border border-transparent'
            }`}
          >
            <div
              className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 transition-colors ${
                activeCategoryId === SETTINGS_CARD.id
                  ? `${SETTINGS_CARD.activeSquircleBg} ${SETTINGS_CARD.activeSquircleColor} shadow-2xs`
                  : `${SETTINGS_CARD.squircleBg} ${SETTINGS_CARD.squircleColor}`
              }`}
            >
              {SETTINGS_CARD.icon}
            </div>
            <div className="min-w-0 flex-1">
              <p
                className={`text-sm font-bold leading-tight truncate ${
                  activeCategoryId === SETTINGS_CARD.id
                    ? SETTINGS_CARD.activeTextColor
                    : 'text-slate-900'
                }`}
              >
                {SETTINGS_CARD.label}
              </p>
              <p className="text-xs text-slate-400 font-normal leading-tight truncate mt-0.5">
                {SETTINGS_CARD.subtitle}
              </p>
            </div>
            <ChevronRight
              className={`w-4 h-4 ml-auto shrink-0 transition-transform ${
                activeCategoryId === SETTINGS_CARD.id
                  ? SETTINGS_CARD.activeTextColor
                  : 'text-slate-300 group-hover:text-slate-400'
              }`}
            />
          </div>
        )}

        {/* 7. Sign Out Card */}
        {(!searchQuery || 'sign out'.includes(searchQuery.toLowerCase())) && (
          <div
            onClick={onSignOut}
            className="group w-full flex items-center gap-3.5 px-3 py-2.5 rounded-2xl transition-all duration-150 text-left hover:bg-rose-50/60 border border-transparent cursor-pointer"
          >
            <div className="w-11 h-11 rounded-2xl bg-[#FEF2F2] text-[#EF4444] flex items-center justify-center shrink-0 transition-colors group-hover:bg-rose-100">
              <LogOut className="w-5 h-5 stroke-[2]" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold leading-tight truncate text-[#EF4444]">
                Sign Out
              </p>
              <p className="text-xs text-slate-400 font-normal leading-tight truncate mt-0.5">
                End your session
              </p>
            </div>
            <ChevronRight className="w-4 h-4 ml-auto shrink-0 text-slate-300 group-hover:text-rose-400 transition-colors" />
          </div>
        )}
      </nav>
    </div>
  );
};

interface AppShellProps {
  currentScreen: string;
  onNavigate: (screen: string, payload?: { date?: string }) => void;
  onSignOut: () => void;
  hotelName?: string;
  posEnabled?: boolean;
  children: ReactNode;
}

export const AppShell = ({
  currentScreen,
  onNavigate,
  onSignOut,
  hotelName,
  posEnabled,
  children,
}: AppShellProps) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const syncStatus = useChannelSyncStatus();
  const [searchQuery, setSearchQuery] = useState('');
  const [headerSearch, setHeaderSearch] = useState('');
  const [profileOpen, setProfileOpen] = useState(false);
  const [dialog, setDialog] = useState<'profile' | 'password' | 'help' | null>(null);
  const [profileName, setProfileName] = useState('');
  const [profileMobile, setProfileMobile] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState('');
  const profileRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);

  const loadNotifications = useCallback(async () => {
    try {
      const items = await getNotifications();
      setNotifications(items || []);
    } catch {
      setNotifications([]);
    }
  }, []);

  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, 60000);
    return () => clearInterval(interval);
  }, [loadNotifications]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch {
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    }
  };

  const handleMarkSingleRead = async (id: string) => {
    try {
      await markNotificationRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
    } catch {
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
    }
  };
  const { user, role, permissions, changePassword, updateUserProfile } = useAuth();

  const metadata = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const userName =
    typeof metadata.full_name === 'string' && metadata.full_name.trim()
      ? metadata.full_name
      : typeof metadata.name === 'string' && metadata.name.trim()
      ? metadata.name
      : user?.email?.split('@')[0] ?? 'User';
  const userMobile = typeof metadata.phone === 'string' ? metadata.phone : '';

  const todayDisplay = new Date().toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  const [enabledFeatures, setEnabledFeatures] = useState<Record<string, boolean> | null>(null);

  useEffect(() => {
    getEnabledHotelFeatures().then(setEnabledFeatures).catch(() => setEnabledFeatures(null));
  }, []);

  const roleLabel =
    role === 'super_admin'
      ? 'Super Admin'
      : role === 'owner' || role === 'hotel_admin'
      ? 'Hotel Owner'
      : role === 'manager'
      ? 'Manager'
      : role === 'reception' || role === 'hotel_staff'
      ? 'Reception'
      : role === 'accounts'
      ? 'Accounts'
      : role === 'housekeeping'
      ? 'Housekeeping'
      : role ?? 'User';
  const canManageProperty = role === 'hotel_admin' || role === 'super_admin' || role === 'owner' || role === 'manager';

  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setProfileOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, []);

  const openProfileDialog = () => {
    setProfileName(userName);
    setProfileMobile(userMobile);
    setProfileEmail(user?.email ?? '');
    setProfileMessage('');
    setProfileOpen(false);
    setDialog('profile');
  };

  const openPasswordDialog = () => {
    setNewPassword('');
    setConfirmPassword('');
    setPasswordMessage('');
    setProfileOpen(false);
    setDialog('password');
  };

  const navigateFromProfile = (screen: string) => {
    setProfileOpen(false);
    onNavigate(screen);
  };

  const saveProfile = async () => {
    if (!profileName.trim() || !profileEmail.trim()) {
      setProfileMessage('Name and email are required.');
      return;
    }
    setProfileSaving(true);
    setProfileMessage('');
    try {
      await updateUserProfile({
        name: profileName.trim(),
        mobile: profileMobile.trim(),
        email: profileEmail.trim(),
      });
      setProfileMessage('Profile saved successfully.');
    } catch (error) {
      setProfileMessage(error instanceof Error ? error.message : 'Unable to save your profile.');
    } finally {
      setProfileSaving(false);
    }
  };

  const savePassword = async () => {
    if (newPassword.length < 6) {
      setPasswordMessage('Use at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage('Passwords do not match.');
      return;
    }
    setPasswordSaving(true);
    setPasswordMessage('');
    try {
      await changePassword(newPassword);
      setPasswordMessage('Password changed successfully.');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      setPasswordMessage(error instanceof Error ? error.message : 'Unable to change your password.');
    } finally {
      setPasswordSaving(false);
    }
  };

  const go = (key: string) => {
    const dateScreens = [
      'report',
      'mtd',
      'ytd',
      'pdf',
      'whatsapp',
      'operations',
      'history',
      'entry',
      'roomchart',
      'other',
      'ledger',
    ];
    if (dateScreens.includes(key)) {
      const today = getTodayLocal();
      onNavigate(key, { date: today });
    } else {
      onNavigate(key);
    }
    setSidebarOpen(false);
  };

  const isHousekeeping = role === 'housekeeping';

  return (
    <div
      className={`min-h-screen bg-slate-50 flex app-wrapper ${
        collapsed ? 'sidebar-collapsed' : 'sidebar-expanded'
      }`}
    >
      {/* Desktop Sidebar — Clean White Card Theme (Hidden for Housekeeping users) */}
      {!isHousekeeping && (
        <aside
          className={`hidden lg:flex flex-col shrink-0 fixed inset-y-0 left-0 z-30 sidebar-container bg-white border-r border-slate-200/80 shadow-xs transition-all ${
            collapsed ? 'duration-500 ease-in-out lg:w-[84px]' : 'duration-500 ease-out lg:w-[320px]'
          }`}
        >
          <SidebarContent
            collapsed={collapsed}
            hotelName={hotelName}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            currentScreen={currentScreen}
            go={go}
            onSignOut={onSignOut}
            setSidebarOpen={setSidebarOpen}
            posEnabled={posEnabled}
            role={role}
            enabledFeatures={enabledFeatures}
          />
          {/* Sidebar Collapse Toggle Button */}
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="absolute top-1/2 -right-3.5 -translate-y-1/2 w-7 h-7 rounded-full bg-white border border-slate-200 shadow-md flex items-center justify-center hover:bg-slate-50 text-slate-500 hover:text-slate-800 transition cursor-pointer z-40"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <ChevronLeft
              className={`w-3.5 h-3.5 transition-transform duration-300 ${
                collapsed ? 'rotate-180' : ''
              }`}
            />
          </button>
        </aside>
      )}

      {/* Mobile Drawer Overlay — 100% Matching Floating Modal Card (Hidden for Housekeeping users) */}
      {sidebarOpen && !isHousekeeping && (
        <div className="lg:hidden fixed inset-0 z-50 flex justify-start p-2.5 sm:p-4">
          {/* Dimmed Backdrop */}
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity animate-fade-in"
            onClick={() => setSidebarOpen(false)}
          />

          {/* Floating Card Drawer */}
          <aside className="relative z-10 w-[88vw] max-w-[360px] h-[calc(100dvh-20px)] sm:h-[calc(100dvh-32px)] my-auto bg-white rounded-[28px] shadow-2xl flex flex-col overflow-hidden animate-slide-in border border-slate-100">
            <SidebarContent
              isMobile
              collapsed={false}
              hotelName={hotelName}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              currentScreen={currentScreen}
              go={go}
              onSignOut={onSignOut}
              setSidebarOpen={setSidebarOpen}
              posEnabled={posEnabled}
              role={role}
              enabledFeatures={enabledFeatures}
            />
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div
        className={`flex-1 ${
          !isHousekeeping
            ? collapsed
              ? 'lg:ml-[84px]'
              : 'lg:ml-[320px]'
            : 'lg:ml-0'
        } min-w-0 flex flex-col main-content transition-all duration-500`}
      >
        {/* Top Header */}
        <header
          className="sticky top-0 z-20 bg-white/85 backdrop-blur-xl border-b border-slate-200/80 px-4 lg:px-6 flex items-center justify-between gap-3 shadow-xs"
          style={{ height: layout.headerHeight }}
        >
          {isHousekeeping ? (
            <div className="flex items-center gap-3 min-w-0">
              <BrandIcon size={34} onDark={false} className="shrink-0" />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-black text-slate-900 truncate leading-tight">{hotelName ?? 'Hotel Mantri'}</span>
                  <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-sky-600 text-white shadow-xs tracking-wider uppercase">
                    Housekeeping
                  </span>
                </div>
                <p className="text-[11px] font-bold text-slate-500 truncate mt-0.5">
                  {metadata.assigned_floor ? `Floor: ${metadata.assigned_floor} • ` : ''}
                  {metadata.shift ? `${metadata.shift} Shift • ` : ''}
                  {userName}
                </p>
              </div>
              {Boolean(permissions?.canLaundry) && (
                <div className="hidden sm:flex items-center gap-1.5 ml-4 bg-slate-100 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => onNavigate('housekeeping')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${currentScreen === 'housekeeping' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                  >
                    Housekeeping Board
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate('laundry-linen')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${currentScreen === 'laundry-linen' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                  >
                    Laundry & Linen
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden p-1.5 text-slate-600 hover:text-sky-700 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                aria-label="Open sidebar"
              >
                <Menu className="w-5 h-5" />
              </button>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-black text-slate-900 truncate leading-tight tracking-tight">
                    {hotelName ?? 'Hotel Mantri'}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 shadow-2xs hidden xl:inline-flex">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Live PMS
                  </span>
                </div>
                <p className="text-[11px] font-bold text-sky-600 hidden sm:block">
                  {findLabel(currentScreen) || 'Dashboard'}
                </p>
              </div>
            </div>
          )}

          {/* Right cluster */}
          {isHousekeeping ? (
            <div className="flex items-center gap-2 sm:gap-3">
              {/* Laundry tab toggle on mobile if enabled */}
              {Boolean(permissions?.canLaundry) && (
                <button
                  type="button"
                  onClick={() => onNavigate(currentScreen === 'housekeeping' ? 'laundry-linen' : 'housekeeping')}
                  className="sm:hidden px-2.5 py-1.5 rounded-xl text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1 cursor-pointer"
                >
                  {currentScreen === 'housekeeping' ? <Shirt className="w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5" />}
                  {currentScreen === 'housekeeping' ? 'Laundry' : 'Rooms'}
                </button>
              )}

              {/* Date */}
              <div className="hidden sm:flex flex-col items-end leading-tight px-2.5 py-1 rounded-xl bg-slate-100/90 border border-slate-200/90 shadow-2xs">
                <span className="text-[9px] text-slate-500 uppercase tracking-wider font-extrabold">Today</span>
                <span className="text-xs font-black text-slate-900">{todayDisplay}</span>
              </div>

              {/* User profile menu */}
              <div ref={profileRef} className="relative flex items-center pl-2 sm:pl-3 border-l border-slate-200">
                <button
                  type="button"
                  onClick={() => setProfileOpen((open) => !open)}
                  aria-label="Open profile menu"
                  aria-expanded={profileOpen}
                  className="flex items-center gap-2 rounded-xl p-1 hover:bg-blue-50 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/30 cursor-pointer"
                >
                  <span
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-black shrink-0 bg-gradient-to-tr from-sky-600 via-blue-600 to-indigo-600 shadow-md ring-2 ring-white"
                  >
                    {userName.charAt(0).toUpperCase()}
                  </span>
                  <ChevronDown className={`w-3.5 h-3.5 text-slate-500 hidden sm:block transition-transform ${profileOpen ? 'rotate-180' : ''}`} />
                </button>

                {profileOpen && (
                  <div className="absolute right-0 top-[calc(100%+10px)] z-50 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl animate-fade-in">
                    <div className="border-b border-slate-100 bg-gradient-to-r from-slate-900 via-slate-800 to-sky-950 px-4 py-3 text-white">
                      <p className="truncate text-sm font-black text-white">{hotelName ?? 'Hotel Mantri'}</p>
                      <p className="truncate text-xs font-medium text-slate-300">{userName}</p>
                      <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-sky-500/20 border border-sky-400/30 px-2 py-0.5 text-[10px] font-extrabold text-sky-200">
                        <ShieldCheck className="h-3 w-3" /> Housekeeping
                      </span>
                    </div>
                    <div className="p-2">
                      <ProfileMenuButton icon={<UserRound />} label="My Profile" onClick={openProfileDialog} />
                      <ProfileMenuButton icon={<KeyRound />} label="Change Password" onClick={openPasswordDialog} />
                      <div className="my-1 border-t border-slate-100" />
                      <ProfileMenuButton icon={<LogOut />} label="Sign Out" danger onClick={onSignOut} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 sm:gap-3">
              {/* Header Search (Desktop) */}
              <div className="hidden md:flex items-center gap-2 bg-slate-100/80 border border-slate-200/80 rounded-xl px-3 py-1.5 w-48 lg:w-60 focus-within:ring-2 focus-within:ring-sky-500/20 focus-within:border-sky-500 focus-within:bg-white transition-all shadow-2xs">
                <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <input
                  type="text"
                  placeholder="Search menu or bookings…"
                  value={headerSearch}
                  onChange={(e) => setHeaderSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && headerSearch.trim()) {
                      const q = headerSearch.toLowerCase().trim();
                      const match = PRIMARY_NAV_CARDS.find((card) =>
                        card.label.toLowerCase().includes(q)
                      );
                      if (match) {
                        go(match.defaultScreen);
                      } else {
                        go('reservations');
                      }
                    }
                  }}
                  className="bg-transparent text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none w-full font-medium"
                />
                <kbd className="hidden lg:inline-block text-[10px] font-bold bg-white text-slate-400 px-1 py-0.2 rounded border border-slate-200 shadow-2xs">
                  ⌘K
                </kbd>
              </div>

              {/* Business Date */}
              <div className="hidden sm:flex flex-col items-end leading-tight px-3 py-1 rounded-xl bg-slate-50 border border-slate-200 shadow-2xs">
                <span className="text-[9px] text-slate-400 uppercase tracking-wider font-extrabold">
                  Business Date
                </span>
                <span className="text-xs font-black text-slate-800">{todayDisplay}</span>
              </div>

              {/* OTA Live Sync Badge */}
              <button
                type="button"
                onClick={() => syncStatus.syncNow()}
                disabled={syncStatus.isSyncing}
                title={syncStatus.lastResult?.message || 'Sync OTA Reservations'}
                className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition shadow-2xs cursor-pointer ${
                  syncStatus.status === 'SYNCING'
                    ? 'bg-sky-50 border-sky-200 text-sky-700'
                    : syncStatus.status === 'SUCCESS'
                    ? 'bg-emerald-50 hover:bg-emerald-100 border-emerald-200 text-emerald-700'
                    : syncStatus.status === 'PARTIAL_SUCCESS'
                    ? 'bg-amber-50 hover:bg-amber-100 border-amber-200 text-amber-700'
                    : syncStatus.status === 'FAILED'
                    ? 'bg-rose-50 hover:bg-rose-100 border-rose-200 text-rose-700'
                    : syncStatus.status === 'NOT_AUTHORIZED'
                    ? 'bg-rose-50 hover:bg-rose-100 border-rose-200 text-rose-700'
                    : syncStatus.status === 'NOT_CONFIGURED'
                    ? 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-500'
                    : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-600'
                }`}
              >
                {syncStatus.isSyncing ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-sky-600" />
                ) : syncStatus.status === 'SUCCESS' ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                ) : syncStatus.status === 'PARTIAL_SUCCESS' ||
                  syncStatus.status === 'FAILED' ||
                  syncStatus.status === 'NOT_AUTHORIZED' ? (
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
                )}
                <span>
                  {syncStatus.isSyncing
                    ? 'Syncing OTAs…'
                    : syncStatus.status === 'SUCCESS'
                    ? 'OTA Live'
                    : syncStatus.status === 'PARTIAL_SUCCESS'
                    ? 'OTA Notice'
                    : syncStatus.status === 'FAILED'
                    ? 'OTA Sync Failed'
                    : syncStatus.status === 'NOT_AUTHORIZED'
                    ? 'OTA Unauthorized'
                    : syncStatus.status === 'NOT_CONFIGURED'
                    ? 'OTA Unconfigured'
                    : 'Sync OTAs'}
                </span>
              </button>

              {/* Notifications */}
              <div ref={notifRef} className="relative">
                <button
                  type="button"
                  onClick={() => setNotifOpen((open) => !open)}
                  className={`relative p-2 rounded-xl transition cursor-pointer ${
                    notifOpen
                      ? 'text-sky-600 bg-sky-50'
                      : 'text-slate-500 hover:text-sky-600 hover:bg-sky-50'
                  }`}
                  aria-label="Notifications"
                  aria-expanded={notifOpen}
                >
                  <Bell className="w-5 h-5" />
                  {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-[10px] font-black text-white flex items-center justify-center shadow-xs">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>

                {notifOpen && (
                  <div className="absolute right-0 top-[calc(100%+10px)] z-50 w-80 sm:w-96 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl animate-fade-in">
                    <div className="px-4 py-3 bg-gradient-to-r from-slate-900 to-slate-800 text-white flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Bell className="w-4 h-4 text-sky-400" />
                        <span className="text-sm font-black tracking-tight">Notifications</span>
                        {unreadCount > 0 && (
                          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-sky-500/20 text-sky-300 border border-sky-400/30">
                            {unreadCount} new
                          </span>
                        )}
                      </div>
                      {unreadCount > 0 && (
                        <button
                          type="button"
                          onClick={handleMarkAllRead}
                          className="text-xs text-sky-300 hover:text-white font-semibold transition cursor-pointer"
                        >
                          Mark all read
                        </button>
                      )}
                    </div>

                    <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                      {notifications.length === 0 ? (
                        <div className="p-8 text-center">
                          <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-2">
                            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                          </div>
                          <p className="text-xs font-bold text-slate-700">All caught up!</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">No pending notifications at this moment.</p>
                        </div>
                      ) : (
                        notifications.map((n) => (
                          <div
                            key={n.id}
                            onClick={() => handleMarkSingleRead(n.id)}
                            className={`p-3.5 transition cursor-pointer hover:bg-slate-50 flex items-start gap-3 ${
                              !n.is_read ? 'bg-sky-50/50' : ''
                            }`}
                          >
                            <span
                              className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                                !n.is_read ? 'bg-sky-500 shadow-xs' : 'bg-transparent'
                              }`}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <p className={`text-xs font-bold truncate ${!n.is_read ? 'text-slate-900' : 'text-slate-700'}`}>
                                  {n.title}
                                </p>
                                {n.priority === 'high' || n.priority === 'critical' ? (
                                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-rose-50 text-rose-600 border border-rose-200 shrink-0">
                                    High
                                  </span>
                                ) : null}
                              </div>
                              <p className="text-xs text-slate-500 mt-0.5 line-clamp-2 leading-relaxed">
                                {n.message}
                              </p>
                              <p className="text-[10px] text-slate-400 mt-1">
                                {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* User Profile Menu */}
              <div ref={profileRef} className="relative flex items-center pl-2 sm:pl-3 border-l border-slate-200">
                <button
                  type="button"
                  onClick={() => setProfileOpen((open) => !open)}
                  aria-label="Open profile menu"
                  aria-expanded={profileOpen}
                  className="flex items-center gap-2 rounded-xl p-1 hover:bg-blue-50 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/30 cursor-pointer"
                >
                  <span className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-black shrink-0 bg-gradient-to-tr from-slate-900 via-blue-900 to-blue-600 shadow-md ring-2 ring-white">
                    {userName.charAt(0).toUpperCase()}
                  </span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 text-slate-500 hidden sm:block transition-transform ${
                      profileOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {profileOpen && (
                  <div className="absolute right-0 top-[calc(100%+10px)] z-50 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl animate-fade-in">
                    <div className="border-b border-slate-100 bg-gradient-to-r from-slate-900 via-slate-800 to-blue-950 px-4 py-3 text-white">
                      <p className="truncate text-sm font-black text-white">
                        {hotelName ?? 'Hotel Mantri'}
                      </p>
                      <p className="truncate text-xs font-medium text-slate-300">{userName}</p>
                      <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-blue-500/20 border border-blue-400/30 px-2 py-0.5 text-[10px] font-extrabold text-blue-200">
                        <ShieldCheck className="h-3 w-3" /> {roleLabel}
                      </span>
                    </div>
                    <div className="p-2">
                      {role === 'super_admin' && (
                        <ProfileMenuButton
                          icon={<ShieldCheck className="text-blue-600" />}
                          label="Super Admin Panel"
                          onClick={() => {
                            setProfileOpen(false);
                            onNavigate('super-admin-panel');
                          }}
                        />
                      )}
                      <ProfileMenuButton
                        icon={<UserRound />}
                        label="My Profile"
                        onClick={openProfileDialog}
                      />
                      {canManageProperty && (
                        <ProfileMenuButton
                          icon={<Building2 />}
                          label="Hotel / Property Settings"
                          onClick={() => navigateFromProfile('property')}
                        />
                      )}
                      <ProfileMenuButton
                        icon={<KeyRound />}
                        label="Change Password"
                        onClick={openPasswordDialog}
                      />
                      <ProfileMenuButton
                        icon={<HelpCircle />}
                        label="Help & Support"
                        onClick={() => {
                          setProfileOpen(false);
                          setDialog('help');
                        }}
                      />
                      <div className="my-1 border-t border-slate-100" />
                      <ProfileMenuButton
                        icon={<LogOut />}
                        label="Sign Out"
                        danger
                        onClick={onSignOut}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </header>

        {/* Page Content */}
        <div className="flex-1 min-w-0 animate-page-fade">{children}</div>
      </div>

      {dialog === 'profile' && (
        <Dialog title="My Profile" icon={<UserRound />} onClose={() => setDialog(null)}>
          <div className="grid gap-4 sm:grid-cols-2">
            <ProfileField label="User Name" value={profileName} onChange={setProfileName} />
            <ProfileField
              label="Mobile"
              value={profileMobile}
              onChange={setProfileMobile}
              icon={<Phone />}
            />
            <ProfileField
              label="Email"
              value={profileEmail}
              onChange={setProfileEmail}
              type="email"
              icon={<Mail />}
            />
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">Role</label>
              <div className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-500">
                <ShieldCheck className="h-4 w-4 text-blue-600" />
                {roleLabel}
              </div>
            </div>
          </div>
          {profileMessage && (
            <p
              className={`mt-3 text-xs ${
                profileMessage.includes('successfully') ? 'text-emerald-600' : 'text-red-600'
              }`}
            >
              {profileMessage}
            </p>
          )}
          <DialogActions
            onCancel={() => setDialog(null)}
            onSave={saveProfile}
            saving={profileSaving}
          />
        </Dialog>
      )}

      {dialog === 'password' && (
        <Dialog title="Change Password" icon={<KeyRound />} onClose={() => setDialog(null)}>
          <p className="mb-4 text-sm leading-6 text-slate-500">
            Choose a new password for your Hotel Mantri account.
          </p>
          <div className="space-y-3">
            <PasswordField
              label="New Password"
              value={newPassword}
              onChange={setNewPassword}
            />
            <PasswordField
              label="Confirm New Password"
              value={confirmPassword}
              onChange={setConfirmPassword}
            />
          </div>
          {passwordMessage && (
            <p
              className={`mt-3 text-xs ${
                passwordMessage.includes('successfully') ? 'text-emerald-600' : 'text-red-600'
              }`}
            >
              {passwordMessage}
            </p>
          )}
          <DialogActions
            onCancel={() => setDialog(null)}
            onSave={savePassword}
            saving={passwordSaving}
            saveLabel="Update Password"
          />
        </Dialog>
      )}

      {dialog === 'help' && (
        <Dialog title="Help & Support" icon={<HelpCircle />} onClose={() => setDialog(null)}>
          <p className="text-sm leading-6 text-slate-600">
            For help with Hotel Mantri, please contact your hotel administrator or the support
            contact provided for your property.
          </p>
          <div className="mt-4 rounded-xl bg-blue-50 p-3 text-sm text-blue-900">
            <p className="font-semibold">Signed in as</p>
            <p className="mt-1 truncate text-blue-700">{user?.email}</p>
          </div>
          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={() => setDialog(null)}
              className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              Close
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
};

const ProfileMenuButton = ({
  icon,
  label,
  onClick,
  danger = false,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors cursor-pointer ${
      danger
        ? 'text-red-600 hover:bg-red-50'
        : 'text-slate-700 hover:bg-blue-50 hover:text-blue-700'
    }`}
  >
    <span className="shrink-0 [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
    <span>{label}</span>
  </button>
);

const Dialog = ({
  title,
  icon,
  onClose,
  children,
}: {
  title: string;
  icon: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) => (
  <div
    className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4"
    onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}
  >
    <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl sm:p-6">
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600 [&>svg]:h-4 [&>svg]:w-4">
            {icon}
          </span>
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      {children}
    </div>
  </div>
);

const ProfileField = ({
  label,
  value,
  onChange,
  type = 'text',
  icon,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  icon?: ReactNode;
}) => (
  <div>
    <label className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</label>
    <div className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/10">
      {icon && <span className="text-slate-400 [&>svg]:h-4 [&>svg]:w-4">{icon}</span>}
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none"
      />
    </div>
  </div>
);

const PasswordField = ({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) => (
  <div>
    <label className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</label>
    <input
      type="password"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
    />
  </div>
);

const DialogActions = ({
  onCancel,
  onSave,
  saving,
  saveLabel = 'Save Changes',
}: {
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
  saveLabel?: string;
}) => (
  <div className="mt-6 flex justify-end gap-2">
    <button
      type="button"
      onClick={onCancel}
      className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
    >
      Cancel
    </button>
    <button
      type="button"
      onClick={onSave}
      disabled={saving}
      className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
    >
      {saving ? 'Saving…' : saveLabel}
    </button>
  </div>
);
