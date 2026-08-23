import { useState, useEffect, useCallback } from 'react';
import {
  LayoutDashboard, Building2, Users, CreditCard, Shield, ToggleLeft,
  Bell, ScrollText, Ticket, Settings as SettingsIcon, LogOut,
  Menu, X, Search, ChevronDown, Hotel, Zap, ArrowLeft, AlertTriangle,
  FileText, Receipt, RefreshCw,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { BrandLogo, BrandIcon } from '@/components/BrandLogo';
import { hasPermission, ROLE_LABELS } from './permissions';
import type { Permission } from './permissions';
import type { CompanyRole, AppNotification } from './types';
import { getNotifications, markAllNotificationsRead, endImpersonation } from './api';
import { setCurrentHotelId } from '@/lib/api';
import { Dashboard as HotelDashboard } from '@/screens/Dashboard';

import { DashboardScreen } from './screens/DashboardScreen';
import { HotelsScreen } from './screens/HotelsScreen';
import { HotelDetailScreen } from './screens/HotelDetailScreen';
import { OnboardingWizard } from './screens/OnboardingWizard';
import { CompanyUsersScreen } from './screens/CompanyUsersScreen';
import { SubscriptionsScreen } from './screens/SubscriptionsScreen';
import { FeatureControlsScreen } from './screens/FeatureControlsScreen';
import { CrmScreen } from './screens/CrmScreen';
import { SupportScreen } from './screens/SupportScreen';
import { AuditLogsScreen } from './screens/AuditLogsScreen';
import { NotificationsScreen } from './screens/NotificationsScreen';
import { SystemSettingsScreen } from './screens/SystemSettingsScreen';
import { InvoiceListScreen } from './screens/InvoiceListScreen';
import { InvoiceDetailScreen } from './screens/InvoiceDetailScreen';
import { InvoiceCreateScreen } from './screens/InvoiceCreateScreen';
import { InvoicePreviewDrawer } from './screens/InvoicePreviewDrawer';
import { BillingSettings } from './screens/BillingSettings';
import { RenewalDashboardScreen } from './screens/RenewalDashboardScreen';

type Page =
  | 'dashboard' | 'hotels' | 'hotel-detail' | 'onboarding'
  | 'users' | 'subscriptions' | 'features'
  | 'crm' | 'support' | 'audit' | 'notifications' | 'settings'
  | 'invoices' | 'invoice-detail' | 'invoice-create' | 'billing-settings' | 'renewals';

interface NavItem {
  key: Page;
  label: string;
  icon: React.ReactNode;
  perm: Permission;
  group: string;
}

const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-4 h-4" />, perm: 'dashboard', group: 'Overview' },
  { key: 'hotels', label: 'Hotels', icon: <Building2 className="w-4 h-4" />, perm: 'hotels.read', group: 'Management' },
  { key: 'subscriptions', label: 'Subscriptions', icon: <CreditCard className="w-4 h-4" />, perm: 'subscriptions.read', group: 'Management' },
  { key: 'invoices', label: 'Invoices', icon: <Receipt className="w-4 h-4" />, perm: 'invoices.read', group: 'Management' },
  { key: 'renewals', label: 'Renewals', icon: <RefreshCw className="w-4 h-4" />, perm: 'subscriptions.read', group: 'Management' },
  { key: 'features', label: 'Feature Controls', icon: <ToggleLeft className="w-4 h-4" />, perm: 'features.read', group: 'Management' },
  { key: 'users', label: 'Company Users', icon: <Users className="w-4 h-4" />, perm: 'users.read', group: 'Organization' },
  { key: 'crm', label: 'Sales CRM', icon: <Zap className="w-4 h-4" />, perm: 'crm.read', group: 'Sales' },
  { key: 'support', label: 'Support Tickets', icon: <Ticket className="w-4 h-4" />, perm: 'tickets.read', group: 'Support' },
  { key: 'audit', label: 'Audit Logs', icon: <ScrollText className="w-4 h-4" />, perm: 'audit.read', group: 'System' },
  { key: 'notifications', label: 'Notifications', icon: <Bell className="w-4 h-4" />, perm: 'notifications.read', group: 'System' },
  { key: 'settings', label: 'System Settings', icon: <SettingsIcon className="w-4 h-4" />, perm: 'settings.read', group: 'System' },
  { key: 'billing-settings', label: 'Billing Settings', icon: <FileText className="w-4 h-4" />, perm: 'billing.read', group: 'System' },
];

interface EnterpriseHQProps {
  onSignOut: () => void;
  onViewDashboard?: (hotelId: string) => void;
}

export const EnterpriseHQ = ({ onSignOut, onViewDashboard }: EnterpriseHQProps) => {
  const { user, companyRole, signOut } = useAuth();
  const [page, setPage] = useState<Page>(() => {
    try {
      const st = window.history.state;
      if (st && st.hqPage) return st.hqPage as Page;
    } catch {}
    return 'dashboard';
  });

  // Keep browser history in sync with internal page state so Back/Forward work naturally
  useEffect(() => {
    try {
      if (!window.history.state || !window.history.state.hqPage) {
        window.history.replaceState({ hqPage: page }, '');
      }
    } catch {}

    const onPop = (e: PopStateEvent) => {
      const st = e.state as { hqPage?: string } | null;
      if (st && st.hqPage) {
        setPage(st.hqPage as Page);
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigateHq = (newPage: Page) => {
    try {
      window.history.pushState({ hqPage: newPage }, '');
      (window as any)._hotelMantriHasHistory = true;
    } catch {}
    setPage(newPage);
  };

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedHotelId, setSelectedHotelId] = useState<string | null>(null);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [drawerInvoiceId, setDrawerInvoiceId] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Impersonation state
  const [impersonating, setImpersonating] = useState<{ hotelId: string; hotelName: string; sessionId: string } | null>(null);

  const role = companyRole as CompanyRole | null;

  const loadNotifications = useCallback(async () => {
    try {
      const notifs = await getNotifications();
      setNotifications(notifs);
    } catch { /* noop */ }
  }, []);

  useEffect(() => { loadNotifications(); }, [loadNotifications]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const visibleNav = NAV_ITEMS.filter((item) => hasPermission(role, item.perm));

  const handleSignOut = async () => {
    await signOut();
    onSignOut();
  };

  const navigateToHotel = (hotelId: string) => {
    setSelectedHotelId(hotelId);
    navigateHq('hotel-detail');
    setSidebarOpen(false);
  };

  const startImpersonationSession = (hotelId: string, hotelName: string) => {
    if (onViewDashboard) {
      onViewDashboard(hotelId);
    } else {
      setCurrentHotelId(hotelId);
      setImpersonating({ hotelId, hotelName, sessionId: '' });
    }
  };

  const returnToHQ = async () => {
    if (impersonating?.sessionId) {
      try { await endImpersonation(impersonating.sessionId); } catch { /* noop */ }
    }
    setCurrentHotelId(null);
    setImpersonating(null);
    navigateHq('hotels');
  };

  const handleMarkAllRead = async () => {
    await markAllNotificationsRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  const renderPage = () => {
    if (impersonating) {
      return (
        <div>
          {/* Impersonation banner */}
          <div className="sticky top-0 z-10 bg-amber-500 text-slate-900 px-4 py-3 flex items-center justify-between gap-3 shadow-lg">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <p className="text-sm font-semibold">
                You are viewing {impersonating.hotelName} in Super Admin Support Mode.
              </p>
            </div>
            <button onClick={returnToHQ} className="flex items-center gap-1.5 bg-slate-900 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-slate-800 transition shrink-0">
              <ArrowLeft className="w-4 h-4" /> Return to Enterprise HQ
            </button>
          </div>
          {/* Hotel panel — read-only support view */}
          <HotelDashboard onNavigate={() => {}} />
        </div>
      );
    }
    if (showOnboarding) {
      return <OnboardingWizard onComplete={() => { setShowOnboarding(false); navigateHq('hotels'); }} onCancel={() => setShowOnboarding(false)} />;
    }
    switch (page) {
      case 'dashboard': return <DashboardScreen onNavigateHotels={() => navigateHq('hotels')} onNavigateLeads={() => navigateHq('crm')} onNavigateTickets={() => navigateHq('support')} />;
      case 'hotels': return <HotelsScreen onViewHotel={navigateToHotel} onNewHotel={() => setShowOnboarding(true)} onImpersonate={startImpersonationSession} />;
      case 'hotel-detail': return selectedHotelId ? <HotelDetailScreen hotelId={selectedHotelId} onBack={() => navigateHq('hotels')} onImpersonate={startImpersonationSession} onViewInvoice={(id) => setDrawerInvoiceId(id)} onCreateInvoice={() => { navigateHq('invoice-create'); }} /> : null;
      case 'users': return <CompanyUsersScreen />;
      case 'subscriptions': return <SubscriptionsScreen onViewHotel={navigateToHotel} />;
      case 'invoices': return <InvoiceListScreen onOpenDrawer={(id) => setDrawerInvoiceId(id)} onNewInvoice={() => { navigateHq('invoice-create'); }} />;
      case 'invoice-detail': return selectedInvoiceId ? <InvoiceDetailScreen invoiceId={selectedInvoiceId} onBack={() => navigateHq('invoices')} /> : null;
      case 'invoice-create': return selectedHotelId ? <InvoiceCreateScreen hotelId={selectedHotelId} onBack={() => navigateHq('hotel-detail')} onCreated={(id) => { setSelectedInvoiceId(id); navigateHq('invoice-detail'); }} /> : <InvoiceCreateScreen hotelId={''} onBack={() => navigateHq('invoices')} onCreated={(id) => { setSelectedInvoiceId(id); navigateHq('invoice-detail'); }} />;
      case 'billing-settings': return <BillingSettings />;
      case 'renewals': return <RenewalDashboardScreen onViewHotel={navigateToHotel} onViewInvoice={(id) => setDrawerInvoiceId(id)} />;
      case 'features': return <FeatureControlsScreen />;
      case 'crm': return <CrmScreen />;
      case 'support': return <SupportScreen />;
      case 'audit': return <AuditLogsScreen />;
      case 'notifications': return <NotificationsScreen />;
      case 'settings': return <SystemSettingsScreen />;
      default: return <DashboardScreen onNavigateHotels={() => navigateHq('hotels')} onNavigateLeads={() => navigateHq('crm')} onNavigateTickets={() => navigateHq('support')} />;
    }
  };

  const navGroups = Array.from(new Set(visibleNav.map((n) => n.group)));

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* ── Sidebar ── */}
      {/* Mobile backdrop */}
      {sidebarOpen && <div className="fixed inset-0 bg-slate-900/50 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      <aside className={`fixed lg:sticky top-0 left-0 h-screen w-64 bg-slate-900 text-slate-300 z-40 transform transition-transform duration-200 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      } flex flex-col`}>
        {/* Logo */}
        <div className="px-5 py-5 flex items-center gap-2.5 border-b border-slate-800">
          <BrandIcon size={36} onDark />
          <div className="flex-1 min-w-0">
            <p className="text-white font-bold text-sm leading-tight">Hotel Mantri</p>
            <p className="text-amber-400 text-[10px] font-medium uppercase tracking-wider">Enterprise HQ</p>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-4">
          {navGroups.map((group) => (
            <div key={group}>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-3 mb-1.5">{group}</p>
              <div className="space-y-0.5">
                {visibleNav.filter((n) => n.group === group).map((item) => (
                  <button
                    key={item.key}
                    onClick={() => { navigateHq(item.key); setSidebarOpen(false); }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition ${
                      page === item.key
                        ? 'bg-sky-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    {item.icon}
                    {item.label}
                    {item.key === 'notifications' && unreadCount > 0 && (
                      <span className="ml-auto bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{unreadCount}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}

          {/* Coming Soon section */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-3 mb-1.5">Coming Soon</p>
            <div className="space-y-0.5">
              {['Restaurant POS', 'AI Insights'].map((label) => (
                <div key={label} className="flex items-center gap-2.5 px-3 py-2 text-sm text-slate-600 cursor-not-allowed">
                  <div className="w-4 h-4" />
                  <span className="flex-1">{label}</span>
                  <span className="text-[9px] font-bold uppercase bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded">Soon</span>
                </div>
              ))}
            </div>
          </div>
        </nav>

        {/* User footer */}
        <div className="px-3 py-3 border-t border-slate-800">
          <div className="flex items-center gap-2.5 px-2">
            <div className="w-8 h-8 bg-slate-700 rounded-full flex items-center justify-center text-white text-xs font-bold">
              {user?.email?.[0]?.toUpperCase() ?? '?'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-xs font-semibold truncate">{user?.email}</p>
              <p className="text-slate-500 text-[10px]">{role ? ROLE_LABELS[role] : ''}</p>
            </div>
            <button onClick={handleSignOut} className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition" title="Sign Out">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main content ── */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-20 bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-slate-600 hover:text-slate-900 p-1">
            <Menu className="w-5 h-5" />
          </button>

          {/* Enterprise HQ label */}
          <div className="hidden md:flex items-center gap-2 shrink-0">
            <BrandIcon size={32} />
            <div>
              <p className="text-sm font-bold text-slate-900 leading-tight">Hotel Mantri</p>
              <p className="text-[10px] text-amber-600 font-semibold uppercase tracking-wider leading-tight">Enterprise HQ</p>
            </div>
          </div>

          {/* Mobile label */}
          <div className="md:hidden flex items-center gap-2">
            <BrandIcon size={28} />
            <p className="text-sm font-bold text-slate-900 leading-tight">Enterprise HQ</p>
          </div>

          {/* Global search */}
          <div className="flex-1 max-w-xl relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search hotels, owners, users, invoices, leads, tickets…"
              className="w-full pl-10 pr-4 py-2 bg-slate-100 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white"
            />
          </div>

          {/* Notifications */}
          <div className="relative">
            <button
              onClick={() => setShowNotifPanel(!showNotifPanel)}
              className="relative p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition"
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
            {showNotifPanel && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setShowNotifPanel(false)} />
                <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-2xl border border-slate-200 z-40 max-h-96 overflow-y-auto">
                  <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                    <p className="text-sm font-bold text-slate-800">Notifications</p>
                    {unreadCount > 0 && (
                      <button onClick={handleMarkAllRead} className="text-xs text-sky-600 font-medium hover:underline">Mark all read</button>
                    )}
                  </div>
                  {notifications.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-8">No notifications</p>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {notifications.slice(0, 10).map((n) => (
                        <div key={n.id} className={`px-4 py-3 ${n.is_read ? '' : 'bg-sky-50'}`}>
                          <p className="text-sm font-semibold text-slate-800">{n.title}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{n.message}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* User avatar */}
          <div className="hidden sm:flex items-center gap-2 pl-3 border-l border-slate-200">
            <div className="w-8 h-8 bg-slate-900 rounded-full flex items-center justify-center text-white text-xs font-bold">
              {user?.email?.[0]?.toUpperCase() ?? '?'}
            </div>
            <ChevronDown className="w-4 h-4 text-slate-400" />
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 lg:p-6 overflow-x-hidden">
          {renderPage()}
        </main>
      </div>

      {drawerInvoiceId && (
        <InvoicePreviewDrawer
          invoiceId={drawerInvoiceId}
          onClose={() => setDrawerInvoiceId(null)}
          onChanged={() => { /* list reloads on next mount */ }}
          onDuplicate={(newId) => { setDrawerInvoiceId(newId); }}
        />
      )}
    </div>
  );
};
