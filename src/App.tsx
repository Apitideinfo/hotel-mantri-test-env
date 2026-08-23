import React, { useState, lazy, Suspense, useEffect, Component } from 'react';
import { AuthProvider, useAuth } from '@/lib/auth';
import { getPosEnabled } from '@/lib/api-pos';
import { getEnabledHotelFeatures, setCurrentHotelId } from '@/lib/api';
import { BrandLogo } from '@/components/BrandLogo';
import { mapAuthRoleToFrontOffice } from '@/lib/types';
import { AppShell } from '@/components/AppShell';
import { getTodayLocal } from '@/lib/calc';


type PublicView = 'landing' | 'login' | 'signup' | 'otp-verify' | 'hotel-details' | 'checkout' | 'payment-success';


// Lazy-loaded screens — each becomes a separate chunk loaded on demand
const LoginScreen = lazy(() => import('@/screens/LoginScreen').then(m => ({ default: m.LoginScreen })));
const SignupScreen = lazy(() => import('@/screens/SignupScreen').then(m => ({ default: m.SignupScreen })));
const OtpVerificationScreen = lazy(() => import('@/screens/OtpVerificationScreen').then(m => ({ default: m.OtpVerificationScreen })));
const HotelOnboardingScreen = lazy(() => import('@/screens/HotelOnboardingScreen').then(m => ({ default: m.HotelOnboardingScreen })));
const LandingPage = lazy(() => import('@/screens/LandingPage').then(m => ({ default: m.LandingPage })));
const CheckoutScreen = lazy(() => import('@/screens/CheckoutScreen').then(m => ({ default: m.CheckoutScreen })));
const PaymentSuccessScreen = lazy(() => import('@/screens/PaymentSuccessScreen').then(m => ({ default: m.PaymentSuccessScreen })));
const SubscriptionExpiredScreen = lazy(() => import('@/screens/SubscriptionExpiredScreen').then(m => ({ default: m.SubscriptionExpiredScreen })));
const Dashboard = lazy(() => import('@/screens/Dashboard').then(m => ({ default: m.Dashboard })));
const SuperAdminPanel = lazy(() => import('@/screens/SuperAdminPanel').then(m => ({ default: m.SuperAdminPanel })));
const EnterpriseHQ = lazy(() => import('@/enterprise/EnterpriseHQ').then(m => ({ default: m.EnterpriseHQ })));
const DatabaseTools = lazy(() => import('@/screens/DatabaseTools').then(m => ({ default: m.DatabaseTools })));
const EntryForm = lazy(() => import('@/screens/EntryForm').then(m => ({ default: m.EntryForm })));
const ReportView = lazy(() => import('@/screens/ReportView').then(m => ({ default: m.ReportView })));
const PeriodView = lazy(() => import('@/screens/PeriodView').then(m => ({ default: m.PeriodView })));
const WhatsAppScreen = lazy(() => import('@/screens/WhatsAppScreen').then(m => ({ default: m.WhatsAppScreen })));
const History = lazy(() => import('@/screens/History').then(m => ({ default: m.History })));
const Settings = lazy(() => import('@/screens/Settings').then(m => ({ default: m.Settings })));
const DailyEntryTabs = lazy(() => import('@/screens/DailyEntryTabs').then(m => ({ default: m.DailyEntryTabs })));
const PropertyMaster = lazy(() => import('@/screens/PropertyMaster').then(m => ({ default: m.PropertyMaster })));
const OtherEntries = lazy(() => import('@/screens/OtherEntries').then(m => ({ default: m.OtherEntries })));
const CompanyLedger = lazy(() => import('@/screens/CompanyLedger').then(m => ({ default: m.CompanyLedger })));
const PdfScreen = lazy(() => import('@/screens/PdfScreen').then(m => ({ default: m.PdfScreen })));
const FinanceHub = lazy(() => import('@/screens/finance/FinanceHub').then(m => ({ default: m.FinanceHub })));
const ExpenseEntryScreen = lazy(() => import('@/screens/finance/ExpenseEntryScreen').then(m => ({ default: m.ExpenseEntryScreen })));
const ExpenseLedgerScreen = lazy(() => import('@/screens/finance/ExpenseLedgerScreen').then(m => ({ default: m.ExpenseLedgerScreen })));
const StaffMasterScreen = lazy(() => import('@/screens/finance/StaffMasterScreen').then(m => ({ default: m.StaffMasterScreen })));
const SalaryAdvanceScreen = lazy(() => import('@/screens/finance/SalaryAdvanceScreen').then(m => ({ default: m.SalaryAdvanceScreen })));
const SalarySettlementScreen = lazy(() => import('@/screens/finance/SalarySettlementScreen').then(m => ({ default: m.SalarySettlementScreen })));
const ElectricityScreen = lazy(() => import('@/screens/finance/ElectricityScreen').then(m => ({ default: m.ElectricityScreen })));
const UtilityBillsScreen = lazy(() => import('@/screens/finance/UtilityBillsScreen').then(m => ({ default: m.UtilityBillsScreen })));
const LaundryScreen = lazy(() => import('@/screens/finance/LaundryScreen').then(m => ({ default: m.LaundryScreen })));
const MonthlyBillsScreen = lazy(() => import('@/screens/finance/MonthlyBillsScreen').then(m => ({ default: m.MonthlyBillsScreen })));
const MonthlyProfitabilityScreen = lazy(() => import('@/screens/finance/MonthlyProfitabilityScreen').then(m => ({ default: m.MonthlyProfitabilityScreen })));
const GstReportScreen = lazy(() => import('@/screens/finance/GstReportScreen').then(m => ({ default: m.GstReportScreen })));
const CloseBusinessDayScreen = lazy(() => import('@/screens/finance/CloseBusinessDayScreen').then(m => ({ default: m.CloseBusinessDayScreen })));
const LedgersScreen = lazy(() => import('@/screens/finance/LedgersScreen').then(m => ({ default: m.LedgersScreen })));
const ProfitLossScreen = lazy(() => import('@/screens/finance/ProfitLossScreen').then(m => ({ default: m.ProfitLossScreen })));
const OwnerDashboard = lazy(() => import('@/screens/analytics/OwnerDashboard').then(m => ({ default: m.OwnerDashboard })));
const AnalyticsHub = lazy(() => import('@/screens/analytics/AnalyticsHub').then(m => ({ default: m.AnalyticsHub })));
const DailyMisReport = lazy(() => import('@/screens/analytics/DailyMisReport').then(m => ({ default: m.DailyMisReport })));
const BookingSourceAnalytics = lazy(() => import('@/screens/analytics/BookingSourceAnalytics').then(m => ({ default: m.BookingSourceAnalytics })));
const RoomCategoryAnalytics = lazy(() => import('@/screens/analytics/RoomCategoryAnalytics').then(m => ({ default: m.RoomCategoryAnalytics })));
const PaymentAnalytics = lazy(() => import('@/screens/analytics/PaymentAnalytics').then(m => ({ default: m.PaymentAnalytics })));
const GstAnalytics = lazy(() => import('@/screens/analytics/GstAnalytics').then(m => ({ default: m.GstAnalytics })));
const ExpenseAnalytics = lazy(() => import('@/screens/analytics/ExpenseAnalytics').then(m => ({ default: m.ExpenseAnalytics })));
const OccupancyAnalytics = lazy(() => import('@/screens/analytics/OccupancyAnalytics').then(m => ({ default: m.OccupancyAnalytics })));
const RevenueAnalytics = lazy(() => import('@/screens/analytics/RevenueAnalytics').then(m => ({ default: m.RevenueAnalytics })));
const HotelSubscriptionBilling = lazy(() => import('@/screens/HotelSubscriptionBilling').then(m => ({ default: m.HotelSubscriptionBilling })));
const OperationsBoard = lazy(() => import('@/components/OperationsBoard').then(m => ({ default: m.OperationsBoard })));
const HousekeepingBoard = lazy(() => import('@/components/frontoffice/HousekeepingBoard').then(m => ({ default: m.HousekeepingBoard })));
const CrmHub = lazy(() => import('@/screens/crm/CrmHub').then(m => ({ default: m.CrmHub })));
const GuestDirectory = lazy(() => import('@/screens/crm/GuestDirectory').then(m => ({ default: m.GuestDirectory })));
const VipGuests = lazy(() => import('@/screens/crm/VipGuests').then(m => ({ default: m.VipGuests })));
const CorporateGuests = lazy(() => import('@/screens/crm/CorporateGuests').then(m => ({ default: m.CorporateGuests })));
const TravelAgents = lazy(() => import('@/screens/crm/TravelAgents').then(m => ({ default: m.TravelAgents })));
const LoyaltyProgram = lazy(() => import('@/screens/crm/LoyaltyProgram').then(m => ({ default: m.LoyaltyProgram })));
const ReservationBoard = lazy(() => import('@/screens/reservations/ReservationBoard').then(m => ({ default: m.ReservationBoard })));
const GroupBookingsScreen = lazy(() => import('@/screens/reservations/GroupBookingsScreen').then(m => ({ default: m.GroupBookingsScreen })));
const RateEngine = lazy(() => import('@/screens/reservations/RateEngine').then(m => ({ default: m.RateEngine })));
const WaitlistScreen = lazy(() => import('@/screens/reservations/WaitlistScreen').then(m => ({ default: m.WaitlistScreen })));
const ReservationReports = lazy(() => import('@/screens/reservations/ReservationReports').then(m => ({ default: m.ReservationReports })));
const ChannelManager = lazy(() => import('@/screens/channel/ChannelManager').then(m => ({ default: m.ChannelManager })));
const LaundryLinenScreen = lazy(() => import('@/screens/housekeeping/LaundryLinenScreen').then(m => ({ default: m.LaundryLinenScreen })));
const MenuManagement = lazy(() => import('@/screens/pos/MenuManagement').then(m => ({ default: m.MenuManagement })));
const TablesScreen = lazy(() => import('@/screens/pos/TablesScreen').then(m => ({ default: m.TablesScreen })));
const PosDashboard = lazy(() => import('@/screens/pos/PosDashboard').then(m => ({ default: m.PosDashboard })));
const NewOrderScreen = lazy(() => import('@/screens/pos/NewOrderScreen').then(m => ({ default: m.NewOrderScreen })));
const KitchenDisplayScreen = lazy(() => import('@/screens/pos/KitchenDisplayScreen').then(m => ({ default: m.KitchenDisplayScreen })));
const BillingScreen = lazy(() => import('@/screens/pos/BillingScreen').then(m => ({ default: m.BillingScreen })));
const PosReportsScreen = lazy(() => import('@/screens/pos/PosReportsScreen').then(m => ({ default: m.PosReportsScreen })));
const FinanceDashboard = lazy(() => import('@/screens/finance/FinanceDashboard').then(m => ({ default: m.FinanceDashboard })));
const ChartOfAccountsScreen = lazy(() => import('@/screens/finance/ChartOfAccountsScreen').then(m => ({ default: m.ChartOfAccountsScreen })));
const JournalEntriesScreen = lazy(() => import('@/screens/finance/JournalEntriesScreen').then(m => ({ default: m.JournalEntriesScreen })));
const CashBookScreen = lazy(() => import('@/screens/finance/CashBankBookScreens').then(m => ({ default: m.CashBookScreen })));
const BankBookScreen = lazy(() => import('@/screens/finance/CashBankBookScreens').then(m => ({ default: m.BankBookScreen })));
const VouchersScreen = lazy(() => import('@/screens/finance/VouchersScreen').then(m => ({ default: m.VouchersScreen })));
const AccountingProfitLossScreen = lazy(() => import('@/screens/finance/FinancialReportsScreens').then(m => ({ default: m.AccountingProfitLossScreen })));
const AccountingTrialBalanceScreen = lazy(() => import('@/screens/finance/FinancialReportsScreens').then(m => ({ default: m.AccountingTrialBalanceScreen })));
const AccountingBalanceSheetScreen = lazy(() => import('@/screens/finance/FinancialReportsScreens').then(m => ({ default: m.AccountingBalanceSheetScreen })));
const ReceivablesScreen = lazy(() => import('@/screens/finance/AccountingScreens').then(m => ({ default: m.ReceivablesScreen })));
const PayablesScreen = lazy(() => import('@/screens/finance/AccountingScreens').then(m => ({ default: m.PayablesScreen })));
const VendorLedgerScreen = lazy(() => import('@/screens/finance/AccountingScreens').then(m => ({ default: m.VendorLedgerScreen })));
const ReconciliationScreen = lazy(() => import('@/screens/finance/AccountingScreens').then(m => ({ default: m.ReconciliationScreen })));
const FinanceExceptionsScreen = lazy(() => import('@/screens/finance/AccountingScreens').then(m => ({ default: m.FinanceExceptionsScreen })));
const OpeningBalancesScreen = lazy(() => import('@/screens/finance/FinanceSettingsScreens').then(m => ({ default: m.OpeningBalancesScreen })));
const BudgetScreen = lazy(() => import('@/screens/finance/FinanceSettingsScreens').then(m => ({ default: m.BudgetScreen })));
const HistoricalPostingScreen = lazy(() => import('@/screens/finance/FinanceSettingsScreens').then(m => ({ default: m.HistoricalPostingScreen })));
const PostingRulesScreen = lazy(() => import('@/screens/finance/FinanceSettingsScreens').then(m => ({ default: m.PostingRulesScreen })));

type Screen =
  | 'dashboard' | 'entry' | 'report' | 'mtd' | 'ytd' | 'whatsapp' | 'history'
  | 'settings' | 'roomchart' | 'other' | 'ledger' | 'pdf' | 'property'
  | 'finance' | 'expense-entry' | 'expense-ledger' | 'staff' | 'salary-advance'
  | 'salary-settlement' | 'electricity' | 'utility-bills' | 'laundry'
  | 'monthly-bills' | 'profitability' | 'gst-report' | 'subscription' | 'housekeeping'
  | 'close-day' | 'ledgers' | 'pl-report'
  | 'analytics' | 'owner-dashboard' | 'mis-report'
  | 'analytics-booking' | 'analytics-category' | 'analytics-payment'
  | 'analytics-gst' | 'analytics-expense' | 'analytics-occupancy'
  | 'analytics-revenue'
  | 'operations'
  | 'crm' | 'crm-directory' | 'crm-vip' | 'crm-corporate' | 'crm-agents' | 'crm-loyalty'
  | 'reservations' | 'reservations-board' | 'reservations-groups' | 'reservations-rates' | 'reservations-waitlist' | 'reservations-reports'
  | 'finance-dashboard' | 'chart-of-accounts' | 'journals' | 'cash-book' | 'bank-book'
  | 'vouchers' | 'receivables' | 'payables' | 'vendor-ledger'
  | 'accounting-pl' | 'trial-balance' | 'balance-sheet'
  | 'reconciliation' | 'finance-exceptions'
  | 'opening-balances' | 'budgets' | 'historical-posting' | 'posting-rules'
  | 'arrivals' | 'departures' | 'inhouse' | 'channel-manager'
  | 'laundry-linen' | 'pos-dashboard' | 'pos-new-order' | 'pos-kds' | 'pos-billing' | 'pos-tables' | 'pos-menu' | 'pos-reports';

interface NavState {
  screen: Screen;
  date?: string;
}

function ScreenLoader() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-slate-400 text-sm">Loading…</p>
      </div>
    </div>
  );
}



function AppInner() {
  const { user, loading, profileLoaded, profileError, role, subscriptionStatus, hotelName, hotelId, signOut, refreshProfile } = useAuth();
  const [nav, setNav] = useState<NavState>(() => {
    try {
      const st = window.history.state;
      if (st && st.screen) {
        return { screen: st.screen as Screen, date: st.date ?? getTodayLocal() };
      }
    } catch {}
    return { screen: 'dashboard', date: getTodayLocal() };
  });
  const [authView, setAuthView] = useState<'login' | 'signup'>('login');
  const [publicView, setPublicView] = useState<PublicView>('landing');
  const [selectedPlanId, setSelectedPlanId] = useState<string>('pro');
  const [registeredEmail, setRegisteredEmail] = useState<string>('');
  const [signupData, setSignupData] = useState<{ fullName: string; email: string; mobile: string; password: string } | null>(null);
  const [posEnabled, setPosEnabled] = useState(false);
  const [features, setFeatures] = useState<Record<string, boolean> | null>(null);
  
  const [superAdminMode, setSuperAdminMode] = useState<'panel' | 'dashboard'>('panel');
  
  // NOTE: Removed the useEffect that changed superAdminMode on mount
  // to avoid race conditions. superAdminMode starts as 'panel' so the 
  // user immediately sees EnterpriseHQ.

  useEffect(() => {
    if (user && profileLoaded && role && role !== 'super_admin' && role !== 'company_user' && hotelId) {
      getPosEnabled().then(setPosEnabled).catch(() => setPosEnabled(false));
      getEnabledHotelFeatures().then((f) => {
        setFeatures(f);
        if (f.dashboard === false) {
          setNav((prev) => ({ ...prev, screen: 'operations' }));
        }
      }).catch(() => setFeatures(null));
    }
  }, [user, profileLoaded, role, hotelId]);

  // Keep browser history in sync with internal nav state so Back/Forward work naturally
  useEffect(() => {
    // Replace initial history entry with current nav if it doesn't have our state
    try {
      if (!window.history.state || !window.history.state.screen) {
        window.history.replaceState({ screen: nav.screen, date: nav.date }, '');
      }
    } catch {
      // ignore
    }

    const onPop = (e: PopStateEvent) => {
      const st = e.state as { screen?: string; date?: string } | null;
      if (st && st.screen) {
        setNav({ screen: st.screen as Screen, date: st.date });
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading || (user && !profileLoaded)) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
        <div className="flex flex-col items-center gap-4 bg-slate-800/80 border border-slate-700 p-8 rounded-3xl shadow-2xl">
          <BrandLogo variant="sidebar" />
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-brand-500 animate-ping" />
            <p className="text-slate-300 text-sm font-semibold tracking-wide">Loading HotelMantri…</p>
          </div>
        </div>
      </div>
    );
  }

  // Not authenticated → Public landing page & complete conversion funnel
  if (!user) {
    return (
      <Suspense fallback={<ScreenLoader />}>
        {publicView === 'login' && (
          <LoginScreen
            onAuthSuccess={() => refreshProfile()}
            onNavigateToSignup={() => setPublicView('signup')}
          />
        )}
        {publicView === 'signup' && (
          <SignupScreen
            onNavigateToLogin={() => setPublicView('login')}
            onPersonalDetailsSuccess={(userEmail, details) => {
              if (userEmail) setRegisteredEmail(userEmail);
              setSignupData(details);
              setPublicView('otp-verify');
            }}
          />
        )}
        {publicView === 'otp-verify' && (
          <OtpVerificationScreen
            email={registeredEmail}
            onNavigateBack={() => setPublicView('signup')}
            onVerifySuccess={() => setPublicView('hotel-details')}
          />
        )}
        {publicView === 'hotel-details' && (
          <HotelOnboardingScreen
            personalData={signupData}
            email={registeredEmail}
            onNavigateBack={() => setPublicView('otp-verify')}
            onOnboardingSuccess={() => setPublicView('checkout')}
          />
        )}
        {publicView === 'checkout' && (
          <CheckoutScreen
            planId={selectedPlanId}
            onNavigateBack={() => setPublicView('hotel-details')}
            onNavigateSuccess={() => refreshProfile()}
          />
        )}
        {publicView === 'payment-success' && (
          <PaymentSuccessScreen
            onGoToDashboard={() => refreshProfile()}
          />
        )}
        {publicView === 'landing' && (
          <LandingPage
            onNavigateLogin={() => setPublicView('login')}
            onNavigateSignup={(planId) => {
              if (planId) setSelectedPlanId(planId);
              setPublicView('signup');
            }}
          />
        )}
      </Suspense>
    );
  }

  // If profile resolution failed, surface explicit message and prevent access
  if (profileError) {
    return (
      <SubscriptionExpiredScreen
        message={`Unable to determine user role: ${profileError}`}
        onSignOut={signOut}
      />
    );
  }

  // Super admin / Company user → Enterprise HQ Panel
  if ((role === 'super_admin' || role === 'company_user') && superAdminMode === 'panel') {
    return (
      <Suspense fallback={<ScreenLoader />}>
        <EnterpriseHQ
          onSignOut={signOut}
          onViewDashboard={(selectedHotelId) => {
            if (selectedHotelId) setCurrentHotelId(selectedHotelId);
            setSuperAdminMode('dashboard');
          }}
        />
      </Suspense>
    );
  }


  

  // Subscription expired / suspended / non-active (bypassed for Super Admin)
  if (role !== 'super_admin' && subscriptionStatus && subscriptionStatus !== 'Active' && subscriptionStatus !== 'Trial' && subscriptionStatus !== 'Grace Period') {
    return (
      <SubscriptionExpiredScreen
        message={`Subscription is currently ${subscriptionStatus}. Please contact support to renew.`}
        onSignOut={signOut}
      />
    );
  }

  // Hotel admin with active subscription or Super Admin previewing dashboard → full app
  const go = (screen: string, payload?: { date?: string } | unknown) => {
    if (screen === 'super-admin-panel') {
      setSuperAdminMode('panel');
      return;
    }

    if (role === 'hotel_staff') {
      const restrictedScreens = [
        'finance', 'property', 'settings', 'close-day', 'ledgers', 'pl-report',
        'mtd', 'ytd', 'pdf', 'channel-manager', 'mis-report', 'analytics', 'owner-dashboard',
        'expense-entry', 'expense-ledger', 'staff', 'salary-advance', 'salary-settlement',
        'electricity', 'utility-bills', 'laundry', 'monthly-bills', 'profitability', 'gst-report',
      ];
      if (restrictedScreens.includes(screen)) {
        go('dashboard', { date: nav.date });
        return;
      }
    }

    if (features) {
      if (screen === 'dashboard' && features.dashboard === false) {
        go('operations', { date: nav.date });
        return;
      }
      if ((screen === 'roomchart' || screen === 'report' || screen === 'other') && features.daily_entry === false && features.room_chart === false) {
        go('operations', { date: nav.date });
        return;
      }
      if ((screen === 'finance' || screen === 'close-day') && features.finance === false) {
        go('operations', { date: nav.date });
        return;
      }
      if (screen === 'housekeeping' && features.housekeeping === false) {
        go('operations', { date: nav.date });
        return;
      }
      if (screen === 'channel-manager' && features.channel_manager === false) {
        go('operations', { date: nav.date });
        return;
      }
    }

    const date = (payload as { date?: string } | undefined)?.date;
    const next = { screen: screen as Screen, date: date ?? nav.date };
    try {
      window.history.pushState({ screen: next.screen, date: next.date }, '');
      (window as any)._hotelMantriHasHistory = true; // Track that we've pushed at least once
    } catch {
      // ignore
    }
    setNav(next);
  };
  
  const navigateBack = (fallback: Screen) => {
    if ((window as any)._hotelMantriHasHistory) {
      window.history.back();
    } else {
      go(fallback);
    }
  };

  const back = () => navigateBack('dashboard');
  const backToFinance = () => navigateBack('finance');
  const backToAnalytics = () => navigateBack('analytics');

  return (
    <div className="min-h-screen flex flex-col">
      {(role === 'super_admin' || role === 'company_user') && (
        <div className="bg-[#06152F] text-white px-4 py-2 flex items-center justify-between text-xs border-b border-blue-900/40 shadow-sm z-50">
          <div className="flex items-center gap-2 font-bold">
            <span className="bg-[#1a68fb] text-white px-2 py-0.5 rounded text-[10px] uppercase tracking-wider">Enterprise HQ Mode</span>
            <span className="text-slate-300">Previewing Hotel Dashboard</span>
          </div>
          <button
            onClick={() => setSuperAdminMode('panel')}
            className="bg-blue-600/30 hover:bg-blue-600 text-sky-300 hover:text-white border border-blue-400/30 font-bold px-3 py-1 rounded-lg transition flex items-center gap-1 cursor-pointer"
          >
            ← Return to Enterprise HQ
          </button>
        </div>
      )}
      <div className="flex-1">
        <AppShell currentScreen={nav.screen} onNavigate={(s, payload) => go(s, payload)} onSignOut={signOut} hotelName={hotelName ?? undefined} posEnabled={posEnabled}>
          <div className="px-4 py-4 w-full">
        <Suspense fallback={<ScreenLoader />}>
          {nav.screen === 'dashboard' && (
            <Dashboard onNavigate={go} />
          )}
          {nav.screen === 'roomchart' && nav.date && (
            <DailyEntryTabs date={nav.date} onBack={back} onSaved={() => go('dashboard')} />
          )}
          {nav.screen === 'property' && (
            <PropertyMaster onBack={back} />
          )}
          {nav.screen === 'other' && nav.date && (
            <OtherEntries date={nav.date} onBack={back} onSaved={() => go('dashboard')} />
          )}
          {nav.screen === 'ledger' && nav.date && (
            <CompanyLedger onBack={back} initialDate={nav.date} />
          )}
          {nav.screen === 'entry' && nav.date && (
            <EntryForm date={nav.date} onBack={back} onSaved={(savedDate) => go('report', { date: savedDate ?? nav.date })} />
          )}
          {nav.screen === 'report' && nav.date && (
            <ReportView date={nav.date} onBack={back} onNavigate={go} />
          )}
          {nav.screen === 'mtd' && nav.date && (
            <PeriodView mode="mtd" date={nav.date} onBack={back} />
          )}
          {nav.screen === 'ytd' && nav.date && (
            <PeriodView mode="ytd" date={nav.date} onBack={back} />
          )}
          {nav.screen === 'whatsapp' && nav.date && (
            <WhatsAppScreen date={nav.date} onBack={back} />
          )}
          {nav.screen === 'history' && nav.date && (
            <History initialDate={nav.date} onBack={back} onNavigate={go} />
          )}
          {nav.screen === 'settings' && (
            <Settings onBack={back} />
          )}
          {nav.screen === 'subscription' && (
            <HotelSubscriptionBilling onBack={back} />
          )}
          {nav.screen === 'pdf' && nav.date && (
            <PdfScreen initialDate={nav.date} onBack={back} />
          )}

          {/* Finance module routes */}
          {nav.screen === 'finance' && (
            <FinanceHub onBack={back} onNavigate={(s) => setNav({ screen: s as Screen })} />
          )}
          {nav.screen === 'expense-entry' && <ExpenseEntryScreen onBack={backToFinance} />}
          {nav.screen === 'expense-ledger' && <ExpenseLedgerScreen onBack={backToFinance} />}
          {nav.screen === 'staff' && <StaffMasterScreen onBack={backToFinance} />}
          {nav.screen === 'salary-advance' && <SalaryAdvanceScreen onBack={backToFinance} />}
          {nav.screen === 'salary-settlement' && <SalarySettlementScreen onBack={backToFinance} />}
          {nav.screen === 'electricity' && <ElectricityScreen onBack={backToFinance} />}
          {nav.screen === 'utility-bills' && <UtilityBillsScreen onBack={backToFinance} />}
          {nav.screen === 'laundry' && <LaundryScreen onBack={backToFinance} />}
          {nav.screen === 'monthly-bills' && <MonthlyBillsScreen onBack={backToFinance} />}
          {nav.screen === 'profitability' && <MonthlyProfitabilityScreen onBack={backToFinance} />}

          {nav.screen === 'gst-report' && <GstReportScreen onBack={backToFinance} />}
          {nav.screen === 'close-day' && <CloseBusinessDayScreen onBack={backToFinance} />}
          {nav.screen === 'ledgers' && <LedgersScreen onBack={backToFinance} />}
          {nav.screen === 'pl-report' && <ProfitLossScreen onBack={backToFinance} />}

          {/* Enterprise Finance & Accounting routes (Phase 10) */}
          {nav.screen === 'finance-dashboard' && <FinanceDashboard onBack={backToFinance} onNavigate={(s) => setNav({ screen: s as Screen })} />}
          {nav.screen === 'chart-of-accounts' && <ChartOfAccountsScreen onBack={backToFinance} />}
          {nav.screen === 'journals' && <JournalEntriesScreen onBack={backToFinance} />}
          {nav.screen === 'cash-book' && <CashBookScreen onBack={backToFinance} />}
          {nav.screen === 'bank-book' && <BankBookScreen onBack={backToFinance} />}
          {nav.screen === 'vouchers' && <VouchersScreen onBack={backToFinance} />}
          {nav.screen === 'receivables' && <ReceivablesScreen onBack={backToFinance} />}
          {nav.screen === 'payables' && <PayablesScreen onBack={backToFinance} />}
          {nav.screen === 'vendor-ledger' && <VendorLedgerScreen onBack={backToFinance} />}
          {nav.screen === 'accounting-pl' && <AccountingProfitLossScreen onBack={backToFinance} />}
          {nav.screen === 'trial-balance' && <AccountingTrialBalanceScreen onBack={backToFinance} />}
          {nav.screen === 'balance-sheet' && <AccountingBalanceSheetScreen onBack={backToFinance} />}
          {nav.screen === 'reconciliation' && <ReconciliationScreen onBack={backToFinance} />}
          {nav.screen === 'finance-exceptions' && <FinanceExceptionsScreen onBack={backToFinance} />}
          {nav.screen === 'opening-balances' && <OpeningBalancesScreen onBack={backToFinance} />}
          {nav.screen === 'budgets' && <BudgetScreen onBack={backToFinance} />}
          {nav.screen === 'historical-posting' && <HistoricalPostingScreen onBack={backToFinance} />}
          {nav.screen === 'posting-rules' && <PostingRulesScreen onBack={backToFinance} />}

          {/* Analytics & BI module routes */}
          {nav.screen === 'analytics' && (
            <AnalyticsHub onBack={back} onNavigate={(s) => setNav({ screen: s as Screen })} />
          )}
          {nav.screen === 'owner-dashboard' && (
            <OwnerDashboard onBack={back} onNavigate={(s) => setNav({ screen: s as Screen })} />
          )}
          {nav.screen === 'mis-report' && <DailyMisReport onBack={backToAnalytics} />}
          {nav.screen === 'analytics-booking' && <BookingSourceAnalytics onBack={backToAnalytics} />}
          {nav.screen === 'analytics-category' && <RoomCategoryAnalytics onBack={backToAnalytics} />}
          {nav.screen === 'analytics-payment' && <PaymentAnalytics onBack={backToAnalytics} />}
          {nav.screen === 'analytics-gst' && <GstAnalytics onBack={backToAnalytics} />}
          {nav.screen === 'analytics-expense' && <ExpenseAnalytics onBack={backToAnalytics} />}
          {nav.screen === 'analytics-occupancy' && <OccupancyAnalytics onBack={backToAnalytics} />}
          {nav.screen === 'analytics-revenue' && <RevenueAnalytics onBack={backToAnalytics} />}

          {nav.screen === 'operations' && nav.date && (
            <OperationsBoard date={nav.date} onBack={back} onSaved={() => go('dashboard')} onNavigate={go} />
          )}

          {nav.screen === 'housekeeping' && (
            <HousekeepingBoard onBack={back} role={mapAuthRoleToFrontOffice(role)} />
          )}

          {/* CRM module routes */}
          {nav.screen === 'crm' && (
            <CrmHub onNavigate={(s) => go(s)} onBack={back} />
          )}
          {nav.screen === 'crm-directory' && (
            <GuestDirectory onBack={() => go('crm')} />
          )}
          {nav.screen === 'crm-vip' && (
            <VipGuests onBack={() => go('crm')} />
          )}
          {nav.screen === 'crm-corporate' && (
            <CorporateGuests onBack={() => go('crm')} />
          )}
          {nav.screen === 'crm-agents' && (
            <TravelAgents onBack={() => go('crm')} />
          )}
          {nav.screen === 'crm-loyalty' && (
            <LoyaltyProgram onBack={() => go('crm')} />
          )}

          {/* Reservation Engine 2.0 routes */}
          {nav.screen === 'reservations' && (
            <ReservationBoard onBack={back} />
          )}
          {nav.screen === 'reservations-board' && (
            <ReservationBoard onBack={back} />
          )}
          {nav.screen === 'reservations-groups' && (
            <GroupBookingsScreen onBack={back} />
          )}
          {nav.screen === 'reservations-rates' && (
            <RateEngine onBack={back} />
          )}
          {nav.screen === 'reservations-waitlist' && (
            <WaitlistScreen onBack={back} />
          )}
          {nav.screen === 'reservations-reports' && (
            <ReservationReports onBack={back} />
          )}

          {/* Simplified navigation redirects */}
          {nav.screen === 'arrivals' && (
            <ReservationBoard onBack={back} initialView="arrival" />
          )}
          {nav.screen === 'departures' && (
            <ReservationBoard onBack={back} initialView="departure" />
          )}
          {nav.screen === 'inhouse' && (
            <ReservationBoard onBack={back} initialView="list" />
          )}
          {nav.screen === 'channel-manager' && (
            <ChannelManager onBack={back} onNavigate={go} />
          )}
          {nav.screen === 'laundry-linen' && (
            <LaundryLinenScreen onBack={back} />
          )}
          {nav.screen === 'pos-menu' && (
            <MenuManagement onBack={back} />
          )}
          {nav.screen === 'pos-tables' && (
            <TablesScreen onBack={back} />
          )}
          {nav.screen === 'pos-dashboard' && (
            <PosDashboard onBack={back} onNavigate={(s) => setNav({ screen: s as Screen })} />
          )}
          {nav.screen === 'pos-new-order' && (
            <NewOrderScreen onBack={back} />
          )}
          {nav.screen === 'pos-kds' && (
            <KitchenDisplayScreen onBack={back} />
          )}
          {nav.screen === 'pos-billing' && (
            <BillingScreen onBack={back} />
          )}
          {nav.screen === 'pos-reports' && (
            <PosReportsScreen onBack={back} />
          )}
        </Suspense>
      </div>
    </AppShell>
  </div>
</div>
);
}

function SuperAdminRouter({ onSignOut, onViewDashboard }: { onSignOut: () => void; onViewDashboard?: (hotelId?: string) => void }) {
  const [view, setView] = useState<'panel' | 'db-tools'>('panel');
  if (view === 'db-tools') {
    return <DatabaseTools onBack={() => setView('panel')} onSignOut={onSignOut} />;
  }
  return <SuperAdminPanel onSignOut={onSignOut} onNavigateDbTools={() => setView('db-tools')} onViewDashboard={onViewDashboard} />;
}



class AppErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("App Error Boundary caught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-8 max-w-md w-full shadow-lg text-center">
            <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4 font-bold text-xl">
              !
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">Something went wrong</h2>
            <p className="text-sm text-slate-500 mb-6">{this.state.error?.message || 'An unexpected error occurred.'}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-xl transition"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <AppErrorBoundary>
      <AuthProvider>
        <AppInner />
      </AuthProvider>
    </AppErrorBoundary>
  );
}
