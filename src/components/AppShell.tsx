import { useEffect, useRef, useState, ReactNode, useMemo } from 'react';
import {
  LayoutDashboard, BedDouble, Wallet, FileText, BookOpen,
  History, Building2, Settings as SettingsIcon, LogOut, LogIn, Lock, Menu, X,
  CalendarRange, TrendingUp, MessageCircle, FileBarChart, CreditCard,
  ChevronDown, Search, Bell, ChevronLeft, Sparkles, ClipboardList,
  ChevronRight, Users, BarChart3, Receipt, Percent, Activity,
  Star, Plane, Award, CalendarClock, Shirt, UserRound, KeyRound,
  HelpCircle, Mail, Phone, ShieldCheck, UtensilsCrossed, Armchair, ChefHat,
} from 'lucide-react';
import { BrandIcon } from '@/components/BrandLogo';
import { brand, layout } from '@/lib/theme';
import { useAuth } from '@/lib/auth';
import { getTodayLocal } from '@/lib/calc';
import { getEnabledHotelFeatures } from '@/lib/api';

export interface NavItem {
  key: string;
  label: string;
  icon: ReactNode;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

const POS_GROUP: NavGroup = {
  label: 'Restaurant POS',
  items: [
    { key: 'pos-dashboard', label: 'POS Dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
    { key: 'pos-new-order', label: 'New Order', icon: <UtensilsCrossed className="w-4 h-4" /> },
    { key: 'pos-kds', label: 'Kitchen Display', icon: <ChefHat className="w-4 h-4" /> },
    { key: 'pos-billing', label: 'Billing & Payment', icon: <Receipt className="w-4 h-4" /> },
    { key: 'pos-tables', label: 'Tables', icon: <Armchair className="w-4 h-4" /> },
    { key: 'pos-menu', label: 'Menu Management', icon: <UtensilsCrossed className="w-4 h-4" /> },
    { key: 'pos-reports', label: 'Reports', icon: <BarChart3 className="w-4 h-4" /> },
  ],
};

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Main',
    items: [
      { key: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
      { key: 'operations', label: 'Operations Board', icon: <ClipboardList className="w-4 h-4" /> },
    ],
  },
  {
    label: 'Reservations',
    items: [
      { key: 'reservations', label: 'All Reservations', icon: <CalendarClock className="w-4 h-4" /> },
      { key: 'arrivals', label: 'Arrivals', icon: <LogIn className="w-4 h-4" /> },
      { key: 'departures', label: 'Departures', icon: <LogOut className="w-4 h-4" /> },
      { key: 'inhouse', label: 'In-house Guests', icon: <BedDouble className="w-4 h-4" /> },
    ],
  },
  {
    label: 'Finance',
    items: [
      { key: 'finance', label: 'Finance', icon: <Wallet className="w-4 h-4" /> },
      { key: 'close-day', label: 'Day Closing', icon: <Lock className="w-4 h-4" /> },
    ],
  },
  {
    label: 'Reports',
    items: [
      { key: 'report', label: 'Daily Report', icon: <FileText className="w-4 h-4" /> },
      { key: 'mtd', label: 'MTD Report', icon: <CalendarRange className="w-4 h-4" /> },
      { key: 'ytd', label: 'YTD Report', icon: <TrendingUp className="w-4 h-4" /> },
      { key: 'mis-report', label: 'Daily MIS', icon: <FileBarChart className="w-4 h-4" /> },
      { key: 'pdf', label: 'PDF Reports', icon: <FileBarChart className="w-4 h-4" /> },
      { key: 'whatsapp', label: 'WhatsApp Summary', icon: <MessageCircle className="w-4 h-4" /> },
    ],
  },
  {
    label: 'Operations',
    items: [
      { key: 'housekeeping', label: 'Housekeeping', icon: <Sparkles className="w-4 h-4" /> },
      { key: 'laundry-linen', label: 'Laundry & Linen', icon: <Shirt className="w-4 h-4" /> },
      { key: 'crm', label: 'Guests', icon: <Users className="w-4 h-4" /> },
    ],
  },
  {
    label: 'Channel Manager',
    items: [
      { key: 'channel-manager', label: 'Channel Manager', icon: <CalendarClock className="w-4 h-4" /> },
    ],
  },
  {
    label: 'Master',
    items: [
      { key: 'property', label: 'Property Master', icon: <Building2 className="w-4 h-4" /> },
      { key: 'settings', label: 'Settings', icon: <SettingsIcon className="w-4 h-4" /> },
    ],
  },
];

const ALL_ITEMS = [...NAV_GROUPS, POS_GROUP].flatMap((g) => g.items);
const findLabel = (key: string) => ALL_ITEMS.find((i) => i.key === key)?.label ?? '';

interface AppShellProps {
  currentScreen: string;
  onNavigate: (screen: string, payload?: { date?: string }) => void;
  onSignOut: () => void;
  hotelName?: string;
  posEnabled?: boolean;
  children: ReactNode;
}

export const AppShell = ({ currentScreen, onNavigate, onSignOut, hotelName, posEnabled, children }: AppShellProps) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
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
  const { user, role, changePassword, updateUserProfile } = useAuth();

  const metadata = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const userName = typeof metadata.full_name === 'string' && metadata.full_name.trim()
    ? metadata.full_name
    : typeof metadata.name === 'string' && metadata.name.trim()
      ? metadata.name
      : user?.email?.split('@')[0] ?? 'User';
  const userMobile = typeof metadata.phone === 'string' ? metadata.phone : '';
  const roleLabel = role === 'super_admin' ? 'Super Admin' : role === 'hotel_admin' ? 'Hotel Admin' : role === 'hotel_staff' ? 'Receptionist' : role ?? 'User';
  const canManageProperty = role === 'hotel_admin' || role === 'super_admin';

  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) setProfileOpen(false);
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
      await updateUserProfile({ name: profileName.trim(), mobile: profileMobile.trim(), email: profileEmail.trim() });
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
    // Date-dependent screens need today's date when opened from sidebar
    const dateScreens = ['report', 'mtd', 'ytd', 'pdf', 'whatsapp', 'operations', 'history', 'entry', 'roomchart', 'other', 'ledger'];
    if (dateScreens.includes(key)) {
      const today = getTodayLocal();
      onNavigate(key, { date: today });
    } else {
      onNavigate(key);
    }
    setSidebarOpen(false);
  };

  const toggleGroup = (label: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const sidebarWidthClass = collapsed ? 'lg:w-[72px]' : 'lg:w-[280px]';
  const contentMarginClass = collapsed ? 'lg:ml-[72px]' : 'lg:ml-[280px]';

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';

  const todayDisplay = new Date().toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });

  const [enabledFeatures, setEnabledFeatures] = useState<Record<string, boolean> | null>(null);

  useEffect(() => {
    getEnabledHotelFeatures().then(setEnabledFeatures).catch(() => setEnabledFeatures(null));
  }, []);

  const allGroups = useMemo(() => {
    let base = posEnabled ? [...NAV_GROUPS, POS_GROUP] : NAV_GROUPS;
    if (role === 'hotel_staff') {
      const restrictedLabels = ['Finance', 'Reports', 'Channel Manager', 'Master'];
      base = base.filter((g) => !restrictedLabels.includes(g.label));
    }

    if (enabledFeatures) {
      base = base.map((group) => ({
        ...group,
        items: group.items.filter((item) => {
          if (item.key === 'dashboard' && enabledFeatures.dashboard === false) return false;
          if (item.key === 'operations' && enabledFeatures.daily_entry === false && enabledFeatures.room_chart === false) return false;
          if (item.key === 'roomchart' && enabledFeatures.room_chart === false) return false;
          if (item.key === 'finance' && enabledFeatures.finance === false) return false;
          if (item.key === 'close-day' && enabledFeatures.finance === false) return false;
          if (item.key === 'report' && enabledFeatures.daily_entry === false) return false;
          if (item.key === 'mtd' && enabledFeatures.mtd === false) return false;
          if (item.key === 'ytd' && enabledFeatures.ytd === false) return false;
          if (item.key === 'mis-report' && enabledFeatures.dashboard === false) return false;
          if (item.key === 'pdf' && enabledFeatures.pdf_reports === false) return false;
          if (item.key === 'whatsapp' && enabledFeatures.whatsapp_reports === false) return false;
          if (item.key === 'housekeeping' && enabledFeatures.housekeeping === false) return false;
          if (item.key === 'channel-manager' && enabledFeatures.channel_manager === false) return false;
          return true;
        }),
      })).filter((group) => group.items.length > 0);
    }

    return base;
  }, [posEnabled, role, enabledFeatures]);

  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return allGroups;
    const q = searchQuery.toLowerCase();
    return allGroups.map((g) => ({
      ...g,
      items: g.items.filter((i) => i.label.toLowerCase().includes(q)),
    })).filter((g) => g.items.length > 0);
  }, [searchQuery, allGroups]);

  const SidebarContent = ({ isMobile = false }: { isMobile?: boolean }) => {
    const showLabels = !collapsed || isMobile;
    return (
      <>
        {/* Logo header */}
        <div className={`px-5 py-4 border-b border-white/10 flex items-center ${showLabels ? 'gap-3' : 'justify-center'}`}>
          <BrandIcon size={36} onDark />
          {showLabels && (
            <div className="min-w-0 flex-1">
              <p className="text-base font-bold text-white truncate leading-tight">{hotelName ?? 'Hotel Mantri'}</p>
              <p className="text-[10px] font-semibold text-brand-navy-300 uppercase tracking-widest mt-0.5">Management System</p>
            </div>
          )}
          {isMobile && (
            <button onClick={() => setSidebarOpen(false)} className="text-brand-navy-300 hover:text-white p-1 shrink-0">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Search menu */}
        {showLabels && (
          <div className="px-3.5 pt-3.5 pb-1">
            <div className="flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2 border border-white/10 focus-within:border-brand-500/50 transition">
              <Search className="w-4 h-4 text-brand-navy-300 shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search menu…"
                className="bg-transparent text-xs text-white placeholder:text-brand-navy-300 focus:outline-none w-full"
              />
            </div>
          </div>
        )}

        {/* Navigation list */}
        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-3.5 sidebar-scroll">
          {filteredGroups.map((group) => {
            const isGroupCollapsed = collapsedGroups.has(group.label) && !searchQuery;
            return (
              <div key={group.label}>
                {showLabels && (
                  <button
                    onClick={() => toggleGroup(group.label)}
                    className="w-full flex items-center justify-between px-3 mb-1.5 text-[10px] font-bold text-brand-navy-400 uppercase tracking-widest hover:text-brand-navy-200 transition"
                  >
                    <span>{group.label}</span>
                    <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${isGroupCollapsed ? '-rotate-90' : ''}`} />
                  </button>
                )}
                <div
                  className="space-y-1 overflow-hidden transition-all duration-300 ease-in-out"
                  style={{
                    maxHeight: isGroupCollapsed ? '0' : '600px',
                    opacity: isGroupCollapsed ? 0 : 1,
                  }}
                >
                  {group.items.map((item) => {
                    const active = currentScreen === item.key;
                    return (
                      <button
                        key={item.key}
                        onClick={() => go(item.key)}
                        title={collapsed && !isMobile ? item.label : undefined}
                        className={`group relative w-full flex items-center ${showLabels ? 'gap-3 px-3.5' : 'justify-center px-0'} py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-200 ${
                          active
                            ? 'bg-brand-600 text-white shadow-soft-blue'
                            : 'text-brand-navy-300 hover:text-white hover:bg-white/5'
                        }`}
                      >
                        {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-6 rounded-r-full bg-brand-gold-400" />}
                        <span className="shrink-0 transition-transform duration-200 group-hover:scale-110">{item.icon}</span>
                        {showLabels && <span className="truncate">{item.label}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        {/* Sign out */}
        <div className="px-3.5 py-3.5 border-t border-white/10">
          <button
            onClick={onSignOut}
            title={collapsed && !isMobile ? 'Sign Out' : undefined}
            className={`w-full flex items-center ${showLabels ? 'gap-3 px-3.5' : 'justify-center px-0'} py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-brand-navy-300 hover:text-white hover:bg-rose-900/30 transition-all`}
          >
            <LogOut className="w-4 h-4 text-rose-400" />
            {showLabels && <span>Sign Out</span>}
          </button>
        </div>
      </>
    );
  };


  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Desktop sidebar */}
      <aside
        className={`hidden lg:flex flex-col shrink-0 fixed inset-y-0 left-0 z-30 transition-all duration-300 ${sidebarWidthClass}`}
        style={{ background: brand.navy }}
      >
        <SidebarContent />
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="absolute top-1/2 -right-3 -translate-y-1/2 w-6 h-6 rounded-full bg-white border border-slate-200 shadow-card flex items-center justify-center hover:bg-slate-50 transition"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <ChevronLeft className={`w-3.5 h-3.5 text-slate-500 transition-transform duration-300 ${collapsed ? 'rotate-180' : ''}`} />
        </button>
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/50 animate-fade-in" onClick={() => setSidebarOpen(false)} />
          <aside
            className="absolute inset-y-0 left-0 w-64 flex flex-col animate-slide-in"
            style={{ background: brand.navy }}
          >
            <SidebarContent isMobile />
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className={`flex-1 ${contentMarginClass} min-w-0 flex flex-col transition-all duration-300`}>
        {/* Top header — premium */}
        <header
          className="sticky top-0 z-20 bg-white/80 backdrop-blur-md border-b border-slate-200 px-4 lg:px-6 flex items-center justify-between gap-3"
          style={{ height: layout.headerHeight }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-1.5 text-slate-600 hover:text-brand-navy-700 hover:bg-slate-100 rounded-lg transition"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h1 className="text-sm font-bold text-brand-navy-800 truncate leading-tight">
                {greeting}, {hotelName ?? 'Hotel Mantri'}
              </h1>
              <p className="text-[11px] text-slate-400 hidden sm:block">
                {findLabel(currentScreen) || 'Dashboard'}
              </p>
            </div>
          </div>

          {/* Right cluster */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Search (desktop) */}
            <div className="hidden md:flex items-center gap-2 bg-slate-100 rounded-lg px-3 py-1.5 w-48 lg:w-56 focus-within:ring-2 focus-within:ring-brand-500/30 transition">
              <Search className="w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search…"
                className="bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none w-full"
              />
            </div>

            {/* Business date */}
            <div className="hidden sm:flex flex-col items-end leading-tight">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Business Date</span>
              <span className="text-xs font-semibold text-brand-navy-700">{todayDisplay}</span>
            </div>

            {/* Notifications */}
            <button className="relative p-2 text-slate-500 hover:text-brand-600 hover:bg-slate-100 rounded-lg transition">
              <Bell className="w-4.5 h-4.5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-brand-gold-500 animate-pulse" />
            </button>

            {/* User profile menu */}
            <div ref={profileRef} className="relative flex items-center pl-2 sm:pl-3 border-l border-slate-200">
              <button
                type="button"
                onClick={() => setProfileOpen((open) => !open)}
                aria-label="Open profile menu"
                aria-expanded={profileOpen}
                className="flex items-center gap-2 rounded-xl p-1 hover:bg-brand-50 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              >
                <span
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                  style={{ background: brand.primary }}
                >
                  {userName.charAt(0).toUpperCase()}
                </span>
                <ChevronDown className={`w-3.5 h-3.5 text-slate-400 hidden sm:block transition-transform ${profileOpen ? 'rotate-180' : ''}`} />
              </button>

              {profileOpen && (
                <div className="absolute right-0 top-[calc(100%+10px)] z-50 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_16px_40px_rgba(15,28,48,0.16)] animate-fade-in">
                  <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-3">
                    <p className="truncate text-sm font-bold text-brand-navy-800">{hotelName ?? 'Hotel Mantri'}</p>
                    <p className="truncate text-xs font-medium text-slate-600">{userName}</p>
                    <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2 py-1 text-[10px] font-bold text-brand-700">
                      <ShieldCheck className="h-3 w-3" /> {roleLabel}
                    </span>
                  </div>
                  <div className="p-2">
                    {role === 'super_admin' && (
                      <ProfileMenuButton
                        icon={<ShieldCheck className="text-sky-600" />}
                        label="Super Admin Panel"
                        onClick={() => {
                          setProfileOpen(false);
                          onNavigate('super-admin-panel');
                        }}
                      />
                    )}
                    <ProfileMenuButton icon={<UserRound />} label="My Profile" onClick={openProfileDialog} />
                    {canManageProperty && <ProfileMenuButton icon={<Building2 />} label="Hotel / Property Settings" onClick={() => navigateFromProfile('property')} />}
                    <ProfileMenuButton icon={<KeyRound />} label="Change Password" onClick={openPasswordDialog} />
                    <ProfileMenuButton icon={<HelpCircle />} label="Help & Support" onClick={() => { setProfileOpen(false); setDialog('help'); }} />
                    <div className="my-1 border-t border-slate-100" />
                    <ProfileMenuButton icon={<LogOut />} label="Sign Out" danger onClick={onSignOut} />
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page content */}
        <div className="flex-1 min-w-0 animate-page-fade">{children}</div>
      </div>

      {dialog === 'profile' && (
        <Dialog title="My Profile" icon={<UserRound />} onClose={() => setDialog(null)}>
          <div className="grid gap-4 sm:grid-cols-2">
            <ProfileField label="User Name" value={profileName} onChange={setProfileName} />
            <ProfileField label="Mobile" value={profileMobile} onChange={setProfileMobile} icon={<Phone />} />
            <ProfileField label="Email" value={profileEmail} onChange={setProfileEmail} type="email" icon={<Mail />} />
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">Role</label>
              <div className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-500"><ShieldCheck className="h-4 w-4 text-brand-600" />{roleLabel}</div>
            </div>
          </div>
          {profileMessage && <p className={`mt-3 text-xs ${profileMessage.includes('successfully') ? 'text-emerald-600' : 'text-red-600'}`}>{profileMessage}</p>}
          <DialogActions onCancel={() => setDialog(null)} onSave={saveProfile} saving={profileSaving} />
        </Dialog>
      )}

      {dialog === 'password' && (
        <Dialog title="Change Password" icon={<KeyRound />} onClose={() => setDialog(null)}>
          <p className="mb-4 text-sm leading-6 text-slate-500">Choose a new password for your Hotel Mantri account.</p>
          <div className="space-y-3">
            <PasswordField label="New Password" value={newPassword} onChange={setNewPassword} />
            <PasswordField label="Confirm New Password" value={confirmPassword} onChange={setConfirmPassword} />
          </div>
          {passwordMessage && <p className={`mt-3 text-xs ${passwordMessage.includes('successfully') ? 'text-emerald-600' : 'text-red-600'}`}>{passwordMessage}</p>}
          <DialogActions onCancel={() => setDialog(null)} onSave={savePassword} saving={passwordSaving} saveLabel="Update Password" />
        </Dialog>
      )}

      {dialog === 'help' && (
        <Dialog title="Help & Support" icon={<HelpCircle />} onClose={() => setDialog(null)}>
          <p className="text-sm leading-6 text-slate-600">For help with Hotel Mantri, please contact your hotel administrator or the support contact provided for your property.</p>
          <div className="mt-4 rounded-xl bg-brand-50 p-3 text-sm text-brand-navy-700"><p className="font-semibold">Signed in as</p><p className="mt-1 truncate text-brand-700">{user?.email}</p></div>
          <div className="mt-5 flex justify-end"><button type="button" onClick={() => setDialog(null)} className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700">Close</button></div>
        </Dialog>
      )}
    </div>
  );
};

const ProfileMenuButton = ({ icon, label, onClick, danger = false }: { icon: ReactNode; label: string; onClick: () => void; danger?: boolean }) => (
  <button type="button" onClick={onClick} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors ${danger ? 'text-red-600 hover:bg-red-50' : 'text-slate-700 hover:bg-brand-50 hover:text-brand-700'}`}>
    <span className="shrink-0 [&>svg]:h-4 [&>svg]:w-4">{icon}</span><span>{label}</span>
  </button>
);

const Dialog = ({ title, icon, onClose, children }: { title: string; icon: ReactNode; onClose: () => void; children: ReactNode }) => (
  <div className="fixed inset-0 z-[60] flex items-center justify-center bg-brand-navy/45 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-[0_20px_60px_rgba(15,28,48,0.22)] sm:p-6">
      <div className="mb-5 flex items-center justify-between"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600 [&>svg]:h-4 [&>svg]:w-4">{icon}</span><h2 className="text-lg font-bold text-brand-navy-800">{title}</h2></div><button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close"><X className="h-5 w-5" /></button></div>
      {children}
    </div>
  </div>
);

const ProfileField = ({ label, value, onChange, type = 'text', icon }: { label: string; value: string; onChange: (value: string) => void; type?: string; icon?: ReactNode }) => (
  <div><label className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</label><div className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/10">{icon && <span className="text-slate-400 [&>svg]:h-4 [&>svg]:w-4">{icon}</span>}<input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none" /></div></div>
);

const PasswordField = ({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) => (
  <div><label className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</label><input type="password" value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-800 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10" /></div>
);

const DialogActions = ({ onCancel, onSave, saving, saveLabel = 'Save Changes' }: { onCancel: () => void; onSave: () => void; saving: boolean; saveLabel?: string }) => (
  <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={onCancel} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button><button type="button" onClick={onSave} disabled={saving} className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60">{saving ? 'Saving…' : saveLabel}</button></div>
);
