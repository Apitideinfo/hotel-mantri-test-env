import { useState, lazy, Suspense, useEffect } from 'react';
import { AuthProvider, useAuth } from '@/lib/auth';
import { getPosEnabled } from '@/lib/api-pos';
import { BrandLogo } from '@/components/BrandLogo';
import { AppShell } from '@/components/AppShell';
import { LoginScreen } from '@/screens/LoginScreen';
import { SubscriptionExpiredScreen } from '@/screens/SubscriptionExpiredScreen';
import { Dashboard } from '@/screens/Dashboard';

// Lazy-loaded screens — each becomes a separate chunk loaded on demand
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
  const { user, loading, profileLoaded, role, subscriptionStatus, hotelName, hotelId, signOut } = useAuth();
  const [nav, setNav] = useState<NavState>({ screen: 'dashboard' });
  const [posEnabled, setPosEnabled] = useState(false);

  useEffect(() => {
    if (user && profileLoaded && role && role !== 'super_admin' && role !== 'company_user' && hotelId) {
      getPosEnabled().then(setPosEnabled).catch(() => setPosEnabled(false));
    }
  }, [user, profileLoaded, role, hotelId]);

  if (loading || (user && !profileLoaded)) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <BrandLogo variant="sidebar" />
          <p className="text-slate-400 text-sm animate-pulse">Loading…</p>
        </div>
      </div>
    );
  }

  // Not authenticated → login screen only
  if (!user) {
    return <LoginScreen onAuthSuccess={() => {}} />;
  }

  // Super admin → Enterprise HQ (they should have a company_users row as founder)
  if (role === 'super_admin') {
    return (
      <Suspense fallback={<ScreenLoader />}>
        <EnterpriseRouter onSignOut={signOut} />
      </Suspense>
    );
  }

  // Company user (enterprise HQ staff) → Enterprise HQ
  if (role === 'company_user') {
    return (
      <Suspense fallback={<ScreenLoader />}>
        <EnterpriseRouter onSignOut={signOut} />
      </Suspense>
    );
  }

  // No role assigned → access denied
  if (!role) {
    return (
      <SubscriptionExpiredScreen
        message="Your account has not been linked to a hotel. Please contact the administrator."
        onSignOut={signOut}
      />
    );
  }

  // Subscription expired or suspended → block operational access
  if (subscriptionStatus === 'Expired') {
    return (
      <SubscriptionExpiredScreen
        message="Your subscription has expired. Please contact the administrator to renew."
        onSignOut={signOut}
      />
    );
  }
  if (subscriptionStatus === 'Suspended') {
    return (
      <SubscriptionExpiredScreen
        message="Your account has been suspended. Please contact the administrator."
        onSignOut={signOut}
      />
    );
  }

  // Hotel admin with active subscription → full app
  const go = (screen: string, payload?: { date?: string } | unknown) => {
    const date = (payload as { date?: string } | undefined)?.date;
    setNav({ screen: screen as Screen, date: date ?? nav.date });
  };
  const back = () => setNav({ screen: 'dashboard' });
  const backToFinance = () => setNav({ screen: 'finance' });
  const backToAnalytics = () => setNav({ screen: 'analytics' });

  return (
    <AppShell currentScreen={nav.screen} onNavigate={(s, payload) => go(s, payload)} onSignOut={signOut} hotelName={hotelName ?? undefined} posEnabled={posEnabled}>
      <div className="px-4 py-4 w-full">
        <Suspense fallback={<ScreenLoader />}>
          {nav.screen === 'dashboard' && (
            <Dashboard onNavigate={go} />
          )}
          {nav.screen === 'roomchart' && nav.date && (
            <DailyEntryTabs date={nav.date} onBack={back} onSaved={() => setNav({ screen: 'dashboard' })} />
          )}
          {nav.screen === 'property' && (
            <PropertyMaster onBack={back} />
          )}
          {nav.screen === 'other' && nav.date && (
            <OtherEntries date={nav.date} onBack={back} onSaved={() => setNav({ screen: 'dashboard' })} />
          )}
          {nav.screen === 'ledger' && nav.date && (
            <CompanyLedger onBack={back} initialDate={nav.date} />
          )}
          {nav.screen === 'entry' && nav.date && (
            <EntryForm date={nav.date} onBack={back} onSaved={(savedDate) => setNav({ screen: 'report', date: savedDate ?? nav.date })} />
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
            <OperationsBoard date={nav.date} onBack={back} onSaved={() => setNav({ screen: 'dashboard' })} onNavigate={go} />
          )}

          {nav.screen === 'housekeeping' && (
            <HousekeepingBoard onBack={back} role={role === 'hotel_admin' ? 'admin' : role === 'super_admin' ? 'super_admin' : 'reception'} />
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
            <PosDashboard onBack={back} onNavigate={(s) => setNav({ screen: s as NavScreen })} />
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
  );
}

function SuperAdminRouter({ onSignOut }: { onSignOut: () => void }) {
  const [view, setView] = useState<'panel' | 'db-tools'>('panel');
  if (view === 'db-tools') {
    return <DatabaseTools onBack={() => setView('panel')} onSignOut={onSignOut} />;
  }
  return <SuperAdminPanel onSignOut={onSignOut} onNavigateDbTools={() => setView('db-tools')} />;
}

function EnterpriseRouter({ onSignOut }: { onSignOut: () => void }) {
  return <EnterpriseHQ onSignOut={onSignOut} />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}
