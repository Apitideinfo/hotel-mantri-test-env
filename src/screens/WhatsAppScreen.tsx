import { useEffect, useState, useMemo } from 'react';
import {
  ArrowLeft,
  Copy,
  Check,
  MessageCircle,
  Send,
  Calendar,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  AlertCircle,
  Phone,
  Clock,
  ExternalLink,
  Sun,
  Moon,
  Radio,
  Building,
  CheckCircle2,
  XCircle,
  Loader2,
  Sliders,
  IndianRupee,
  TrendingUp,
  Users,
  Wifi,
  Globe,
  FileText,
  ShieldCheck,
} from 'lucide-react';
import {
  fetchWhatsAppSummary,
  sendWhatsAppSummary,
  sendTestWhatsApp,
  fetchWhatsAppHistory,
  saveWhatsAppSettings,
  fetchWhatsAppSettings,
  verifyWhintaConnection,
  fetchWhatsAppConfig,
  retryWhatsAppSend,
  type WhatsAppReportType,
  type WhatsAppSummaryResponse,
  type WhatsAppHistoryItem,
  type WhatsAppSettingsResponse,
} from '@/lib/api-whatsapp';
import { useClipboard } from '@/lib/useClipboard';

interface WhatsAppScreenProps {
  date: string;
  onBack: () => void;
}

export const WhatsAppScreen = ({ date: initialDate, onBack }: WhatsAppScreenProps) => {
  const [selectedDate, setSelectedDate] = useState<string>(initialDate);
  const [activeTab, setActiveTab] = useState<WhatsAppReportType>('daily');
  const [data, setData] = useState<WhatsAppSummaryResponse | null>(null);
  const [history, setHistory] = useState<WhatsAppHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Server Provider Config & Whinta Verification
  const [providerConfig, setProviderConfig] = useState<{
    provider: string;
    configured: boolean;
    enabled: boolean;
    active: boolean;
    baseUrl: string;
    defaultCountryCode: string;
    hasWebhookSecret: boolean;
  } | null>(null);
  const [verifyingConn, setVerifyingConn] = useState(false);
  const [connTestResult, setConnTestResult] = useState<{
    success: boolean;
    connected: boolean;
    message: string;
    templateCount?: number;
  } | null>(null);

  // Hotel settings state
  const [hotelSettings, setHotelSettings] = useState<WhatsAppSettingsResponse | null>(null);

  // Sending state machine
  type DeliveryStatus = 'Not Configured' | 'Configuration Error' | 'Ready' | 'Queued' | 'Submitted to Provider' | 'Delivered' | 'Failed' | 'Sending...';
  const [deliveryStatus, setDeliveryStatus] = useState<DeliveryStatus>('Ready');
  const [sending, setSending] = useState(false);
  const [sendSuccessMsg, setSendSuccessMsg] = useState<string | null>(null);
  const [sendErrorMsg, setSendErrorMsg] = useState<string | null>(null);
  const [fallbackDirectUrl, setFallbackDirectUrl] = useState<string | null>(null);

  // Test send state
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Settings drawer form state
  const [showConfig, setShowConfig] = useState(false);
  const [editPhone, setEditPhone] = useState('');
  const [editCountryCode, setEditCountryCode] = useState('91');
  const [editDailyEnabled, setEditDailyEnabled] = useState(true);
  const [editLaundryEnabled, setEditLaundryEnabled] = useState(true);
  const [editPreferredTime, setEditPreferredTime] = useState('23:00');
  const [editTimezone, setEditTimezone] = useState('Asia/Kolkata');
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState<{ success: boolean; text: string } | null>(null);

  const [copied, copy] = useClipboard();

  // Helper to safely mask external provider message IDs (Section 16)
  const maskMessageId = (id?: string | null): string => {
    if (!id) return '';
    if (id.length <= 4) return id;
    return `****${id.slice(-4)}`;
  };

  // Load summary, history, provider config & settings
  const loadSummary = async (showLoadingSpinner = true) => {
    if (showLoadingSpinner) setLoading(true);
    else setRefreshing(true);
    setError(null);
    setSendSuccessMsg(null);
    setSendErrorMsg(null);

    try {
      const [summaryRes, historyRes, configRes, settingsRes] = await Promise.all([
        fetchWhatsAppSummary(selectedDate, activeTab),
        fetchWhatsAppHistory(20).catch(() => []),
        fetchWhatsAppConfig().catch(() => null),
        fetchWhatsAppSettings().catch(() => null),
      ]);

      setData(summaryRes);
      setHistory(historyRes);
      if (configRes) setProviderConfig(configRes);
      if (settingsRes) {
        setHotelSettings(settingsRes);
        setEditPhone(settingsRes.reportRecipientPhone || settingsRes.whatsappNumber || '');
        setEditCountryCode(settingsRes.countryCode || '91');
        setEditDailyEnabled(settingsRes.dailyReportEnabled ?? true);
        setEditLaundryEnabled(settingsRes.laundryStatementEnabled ?? true);
        setEditPreferredTime(settingsRes.preferredDeliveryTime || '23:00');
        setEditTimezone(settingsRes.timezone || 'Asia/Kolkata');
      } else if (summaryRes.ownerWhatsApp?.rawPhone) {
        setEditPhone(summaryRes.ownerWhatsApp.rawPhone);
      }

      // Compute initial delivery status
      if (!configRes?.configured) {
        setDeliveryStatus('Not Configured');
      } else if (!summaryRes.ownerWhatsApp?.valid) {
        setDeliveryStatus('Configuration Error');
      } else {
        setDeliveryStatus('Ready');
      }
    } catch (err: any) {
      console.error('[WhatsAppScreen] Load error:', err);
      setError(err.message || 'Failed to load daily hotel summary.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadSummary(true);
  }, [selectedDate]);

  // Navigate date by +/- days
  const handleShiftDate = (days: number) => {
    try {
      const [y, m, d] = selectedDate.split('-').map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d + days));
      const newY = dt.getUTCFullYear();
      const newM = String(dt.getUTCMonth() + 1).padStart(2, '0');
      const newD = String(dt.getUTCDate()).padStart(2, '0');
      setSelectedDate(`${newY}-${newM}-${newD}`);
    } catch {
      /* ignore invalid date */
    }
  };

  // Get active text & direct URL based on current active tab
  const activeReportText = useMemo(() => {
    if (!data?.text) return '';
    return data.text[activeTab] || data.text.daily || '';
  }, [data, activeTab]);

  const activeDirectUrl = useMemo(() => {
    if (!data?.whatsappDirectUrls) return null;
    return fallbackDirectUrl || data.whatsappDirectUrls[activeTab] || data.whatsappDirectUrls.daily || null;
  }, [data, activeTab, fallbackDirectUrl]);

  // Handle Send WhatsApp Summary with complete state machine & double-click protection (Section 15 & 16)
  const handleSendNow = async () => {
    if (sending) return; // Prevent double-click duplicates
    setSending(true);
    setDeliveryStatus('Sending...');
    setSendSuccessMsg(null);
    setSendErrorMsg(null);
    setFallbackDirectUrl(null);

    try {
      const res = await sendWhatsAppSummary({
        businessDate: selectedDate,
        summaryType: activeTab,
        deliveryType: 'MANUAL',
      });

      if (res.success) {
        setDeliveryStatus('Submitted to Provider');
        const idSuffix = res.messageId ? ` (Provider ID: ${maskMessageId(res.messageId)})` : '';
        setSendSuccessMsg(`✓ Summary submitted to ${res.provider || 'Whinta'} provider${idSuffix}. Delivery status will update upon provider confirmation.`);
        fetchWhatsAppHistory(20).then(setHistory).catch(() => {});
      } else if (res.status === 'provider_not_configured' || res.errorCode === 'WHATSAPP_PROVIDER_NOT_CONFIGURED') {
        setDeliveryStatus('Not Configured');
        setSendErrorMsg(res.message || 'Whinta WhatsApp delivery is not configured on the server. Configure WHINTA_ACCESS_TOKEN in server environment.');
        if (res.whatsappDirectUrl) {
          setFallbackDirectUrl(res.whatsappDirectUrl);
        }
      } else if (res.status === 'invalid_recipient' || res.errorCode === 'WHATSAPP_RECIPIENT_INVALID') {
        setDeliveryStatus('Configuration Error');
        setSendErrorMsg(res.message || 'Owner WhatsApp recipient number is missing or invalid. Please configure it in settings.');
      } else {
        setDeliveryStatus('Failed');
        setSendErrorMsg(res.message || 'Failed to dispatch WhatsApp summary.');
        if (res.whatsappDirectUrl) {
          setFallbackDirectUrl(res.whatsappDirectUrl);
        }
      }
    } catch (err: any) {
      setDeliveryStatus('Failed');
      const msg = err.message || 'An error occurred while dispatching WhatsApp message.';
      setSendErrorMsg(msg);
      if (err.whatsappDirectUrl) {
        setFallbackDirectUrl(err.whatsappDirectUrl);
      }
    } finally {
      setSending(false);
    }
  };

  // Handle Verify Whinta Connection (Phase 4)
  const handleVerifyConnection = async () => {
    if (verifyingConn) return;
    setVerifyingConn(true);
    setConnTestResult(null);

    try {
      const res = await verifyWhintaConnection();
      if (res.connected) {
        setConnTestResult({
          success: true,
          connected: true,
          message: `✓ Connected to Whinta Web API successfully (${res.templateCount ?? 0} templates found).`,
          templateCount: res.templateCount,
        });
        setDeliveryStatus(owner?.valid ? 'Ready' : 'Configuration Error');
      } else {
        setConnTestResult({
          success: false,
          connected: false,
          message: res.message || `Connection failed: ${res.error || 'Check WHINTA_ACCESS_TOKEN'}`,
        });
        setDeliveryStatus('Configuration Error');
      }
    } catch (err: any) {
      setConnTestResult({
        success: false,
        connected: false,
        message: err.message || 'Failed to verify Whinta API connection.',
      });
      setDeliveryStatus('Configuration Error');
    } finally {
      setVerifyingConn(false);
    }
  };

  // Handle Send Test WhatsApp with complete state machine & double-click protection (Section 7)
  const handleSendTest = async () => {
    if (testing) return; // Prevent double-click duplicates
    setTesting(true);
    setTestResult(null);

    try {
      const res = await sendTestWhatsApp();
      if (res.success) {
        const idSuffix = res.messageId ? ` • Provider ID: ${maskMessageId(res.messageId)}` : '';
        setTestResult({
          success: true,
          message: `✓ Test message submitted to provider for ${res.recipient || 'owner number'}${idSuffix}`,
        });
      } else if (res.status === 'provider_not_configured' || res.errorCode === 'WHATSAPP_PROVIDER_NOT_CONFIGURED') {
        setTestResult({
          success: false,
          message: 'Automated WhatsApp delivery is not configured. Configure WHINTA_ACCESS_TOKEN in server environment.',
        });
        if (res.whatsappDirectUrl) {
          setFallbackDirectUrl(res.whatsappDirectUrl);
        }
      } else if (res.status === 'invalid_recipient' || res.errorCode === 'WHATSAPP_RECIPIENT_INVALID') {
        setTestResult({
          success: false,
          message: res.message || 'Owner WhatsApp number is missing or invalid.',
        });
      } else {
        setTestResult({
          success: false,
          message: res.message || 'WhatsApp test send failed.',
        });
        if (res.whatsappDirectUrl) {
          setFallbackDirectUrl(res.whatsappDirectUrl);
        }
      }
      fetchWhatsAppHistory(20).then(setHistory).catch(() => {});
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'Failed to send test WhatsApp message.',
      });
      if (err.whatsappDirectUrl) {
        setFallbackDirectUrl(err.whatsappDirectUrl);
      }
    } finally {
      setTesting(false);
    }
  };

  // Save WhatsApp settings (Phase 3 & 4: recipient, daily toggle, laundry toggle, timezone, time)
  const handleSaveSettings = async () => {
    if (!editPhone.trim()) return;
    setSavingSettings(true);
    setSettingsMsg(null);

    try {
      const res = await saveWhatsAppSettings({
        reportRecipientPhone: editPhone,
        whatsappNumber: editPhone,
        countryCode: editCountryCode,
        dailyReportEnabled: editDailyEnabled,
        laundryStatementEnabled: editLaundryEnabled,
        preferredDeliveryTime: editPreferredTime,
        timezone: editTimezone,
      });

      setSettingsMsg({
        success: true,
        text: `Settings saved successfully for ${res.normalizedNumber || editPhone}.`,
      });
      setTimeout(() => setShowConfig(false), 1200);
      loadSummary(false);
    } catch (err: any) {
      setSettingsMsg({
        success: false,
        text: err.message || 'Failed to update WhatsApp settings.',
      });
    } finally {
      setSavingSettings(false);
    }
  };

  // Handle retry
  const handleRetry = async (notificationId: string) => {
    try {
      await retryWhatsAppSend(notificationId);
      fetchWhatsAppHistory(20).then(setHistory).catch(() => {});
    } catch (err: any) {
      alert(`Retry error: ${err.message}`);
    }
  };

  const summary = data?.summary;
  const owner = data?.ownerWhatsApp;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-28">
      {/* ─── Top Header ────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 bg-emerald-700 text-white px-4 py-3.5 shadow-md flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 -ml-1 hover:bg-emerald-600 active:bg-emerald-800 rounded-lg transition"
            title="Go Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold leading-tight tracking-tight">WhatsApp Hotel Summary</h1>
              <span className="bg-emerald-800/80 text-emerald-200 text-[10px] font-medium px-2 py-0.5 rounded-full border border-emerald-600/60">
                {data?.hotelName || 'Hotel Mantri'}
              </span>
            </div>
            <p className="text-emerald-200 text-xs flex items-center gap-1.5 mt-0.5">
              <span>Business Date: <strong>{data?.businessDateReadable || selectedDate}</strong></span>
              <span>•</span>
              <span className={summary?.dayStatus === 'CLOSED' ? 'text-amber-200 font-semibold' : 'text-emerald-100'}>
                Day {summary?.dayStatus || 'OPEN'}
              </span>
            </p>
          </div>
        </div>

        {/* Date Selector & Config Button */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-emerald-800/60 rounded-lg border border-emerald-600/50 p-0.5 text-xs">
            <button
              onClick={() => handleShiftDate(-1)}
              className="p-1 hover:bg-emerald-600 rounded text-emerald-100"
              title="Previous Day"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <label className="flex items-center px-1.5 cursor-pointer font-mono font-medium text-emerald-100">
              <Calendar className="w-3.5 h-3.5 mr-1 text-emerald-300" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
                className="bg-transparent border-none text-emerald-100 text-xs font-mono focus:outline-none cursor-pointer w-24"
              />
            </label>
            <button
              onClick={() => handleShiftDate(1)}
              className="p-1 hover:bg-emerald-600 rounded text-emerald-100"
              title="Next Day"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={() => setShowConfig(!showConfig)}
            className="p-2 hover:bg-emerald-600 rounded-lg text-emerald-100 border border-emerald-600/50"
            title="Configure Owner WhatsApp"
          >
            <Sliders className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-4 space-y-4">
        {/* ─── Recipient & Provider Status Banner (Phase 4) ─────────────────────── */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
                <Phone className="w-4 h-4" />
              </div>
              <div>
                <div className="text-slate-500 font-medium">Owner WhatsApp Recipient</div>
                <div className="text-slate-900 font-semibold text-sm flex items-center gap-2">
                  {owner?.valid ? (
                    <span className="font-mono text-emerald-700">{owner.formattedPhone}</span>
                  ) : (
                    <span className="text-red-600 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" /> Not configured
                    </span>
                  )}
                  {owner?.ownerName && <span className="text-slate-500 font-normal text-xs">({owner.ownerName})</span>}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Provider Badge */}
              <span
                className={`px-2.5 py-1 rounded-full font-medium text-xs flex items-center gap-1.5 ${
                  providerConfig?.active || data?.providerConfig?.configured
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-amber-50 text-amber-800 border border-amber-200'
                }`}
              >
                <Wifi className="w-3 h-3" />
                Provider: {providerConfig?.provider || data?.providerConfig?.provider || 'Whinta'}
              </span>

              {/* Status Indicator Badge */}
              <span
                className={`px-2.5 py-1 rounded-full font-semibold text-[11px] ${
                  deliveryStatus === 'Delivered'
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : deliveryStatus === 'Submitted to Provider'
                    ? 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                    : deliveryStatus === 'Ready'
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                    : deliveryStatus === 'Queued'
                    ? 'bg-blue-100 text-blue-800 border border-blue-200'
                    : deliveryStatus === 'Configuration Error' || deliveryStatus === 'Failed'
                    ? 'bg-red-100 text-red-800 border border-red-200'
                    : 'bg-slate-100 text-slate-700 border border-slate-300'
                }`}
              >
                Status: {deliveryStatus}
              </span>

              {/* Test Connection Button */}
              <button
                onClick={handleVerifyConnection}
                disabled={verifyingConn}
                className="px-2.5 py-1 rounded-lg border border-slate-300 hover:bg-slate-100 active:bg-slate-200 text-slate-700 font-medium text-xs flex items-center gap-1 disabled:opacity-50 transition"
                title="Verify connection to Whinta Web API"
              >
                {verifyingConn ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldCheck className="w-3 h-3 text-emerald-600" />}
                Test Connection
              </button>

              {/* Send Test Button */}
              <button
                onClick={handleSendTest}
                disabled={testing || !owner?.valid}
                className="px-2.5 py-1 rounded-lg border border-slate-300 hover:bg-slate-100 active:bg-slate-200 text-slate-700 font-medium text-xs flex items-center gap-1 disabled:opacity-50 transition"
              >
                {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3 h-3 text-slate-600" />}
                Send Test Message
              </button>
            </div>
          </div>

          {/* Connection Test Live Result */}
          {connTestResult && (
            <div
              className={`p-2.5 rounded-lg text-xs flex items-center justify-between border ${
                connTestResult.connected
                  ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                  : 'bg-red-50 text-red-900 border-red-200'
              }`}
            >
              <div className="flex items-center gap-2">
                {connTestResult.connected ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                )}
                <span>{connTestResult.message}</span>
              </div>
              <button
                onClick={() => setConnTestResult(null)}
                className="text-slate-400 hover:text-slate-600 text-xs px-1"
              >
                ✕
              </button>
            </div>
          )}
        </div>

        {/* ─── Provider Unconfigured Notice Banner (Section 5) ────────────────── */}
        {providerConfig && !providerConfig.configured && (
          <div className="bg-amber-50/90 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-900 flex items-start gap-3 shadow-sm">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-semibold text-amber-950">Whinta WhatsApp provider is not configured.</div>
              <div className="text-amber-800 text-[11px] leading-relaxed">
                To enable direct background delivery, configure Whinta credentials in your server environment variables.
              </div>
            </div>
          </div>
        )}

        {/* ─── Settings Drawer / Modal (Phase 3 & 4) ────────────────────────────── */}
        {showConfig && (
          <div className="bg-white rounded-xl border-2 border-emerald-500 p-5 shadow-lg space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="font-semibold text-slate-900 text-sm flex items-center gap-2">
                <Sliders className="w-4 h-4 text-emerald-600" /> WhatsApp Report &amp; Recipient Configuration
              </h3>
              <button
                onClick={() => setShowConfig(false)}
                className="text-slate-400 hover:text-slate-600 text-xs px-2 py-1 rounded"
              >
                Close ✕
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              {/* Recipient Phone & Country Code */}
              <div className="space-y-1.5 sm:col-span-2">
                <label className="font-medium text-slate-700 flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5 text-slate-500" /> WhatsApp Recipient Phone Number
                </label>
                <div className="flex items-center gap-2">
                  <div className="w-20">
                    <input
                      type="text"
                      value={editCountryCode}
                      onChange={(e) => setEditCountryCode(e.target.value)}
                      placeholder="91"
                      className="w-full border border-slate-300 rounded-lg px-2.5 py-2 text-xs font-mono text-center focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      title="Country code (e.g. 91)"
                    />
                  </div>
                  <input
                    type="text"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    placeholder="9909442195 or +919909442195"
                    className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <p className="text-[11px] text-slate-500">
                  Reports will be sent exclusively to this authorized owner WhatsApp number.
                </p>
              </div>

              {/* Daily Report Toggle */}
              <div className="flex items-start gap-2.5 p-3 rounded-lg border border-slate-200 bg-slate-50/50">
                <input
                  type="checkbox"
                  id="toggleDailyReport"
                  checked={editDailyEnabled}
                  onChange={(e) => setEditDailyEnabled(e.target.checked)}
                  className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                />
                <label htmlFor="toggleDailyReport" className="cursor-pointer space-y-0.5">
                  <div className="font-semibold text-slate-800">Daily Business Report</div>
                  <p className="text-[11px] text-slate-500 leading-normal">
                    Occupancy, revenue, cash &amp; bank collections, expenses, and operational KPIs.
                  </p>
                </label>
              </div>

              {/* Laundry Statement Toggle */}
              <div className="flex items-start gap-2.5 p-3 rounded-lg border border-slate-200 bg-slate-50/50">
                <input
                  type="checkbox"
                  id="toggleLaundryStatement"
                  checked={editLaundryEnabled}
                  onChange={(e) => setEditLaundryEnabled(e.target.checked)}
                  className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                />
                <label htmlFor="toggleLaundryStatement" className="cursor-pointer space-y-0.5">
                  <div className="font-semibold text-slate-800">Daily Laundry &amp; Linen Statement</div>
                  <p className="text-[11px] text-slate-500 leading-normal">
                    Linen sent, received, pending balance, and approved billable totals per vendor.
                  </p>
                </label>
              </div>

              {/* Preferred Delivery Time */}
              <div className="space-y-1">
                <label className="font-medium text-slate-700 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-slate-500" /> Preferred Delivery Time
                </label>
                <input
                  type="time"
                  value={editPreferredTime}
                  onChange={(e) => setEditPreferredTime(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <p className="text-[11px] text-slate-500">Scheduled time for daily automated dispatches.</p>
              </div>

              {/* Timezone */}
              <div className="space-y-1">
                <label className="font-medium text-slate-700 flex items-center gap-1">
                  <Globe className="w-3.5 h-3.5 text-slate-500" /> Hotel Timezone
                </label>
                <select
                  value={editTimezone}
                  onChange={(e) => setEditTimezone(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                >
                  <option value="Asia/Kolkata">Asia/Kolkata (IST +05:30)</option>
                  <option value="UTC">UTC (GMT +00:00)</option>
                  <option value="Asia/Dubai">Asia/Dubai (GST +04:00)</option>
                  <option value="Asia/Singapore">Asia/Singapore (SGT +08:00)</option>
                </select>
                <p className="text-[11px] text-slate-500">Business dates and midnight roll-overs follow this zone.</p>
              </div>
            </div>

            {/* Audit / Last Send Metadata */}
            {hotelSettings && (
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-[11px] text-slate-600 space-y-1">
                <div className="flex justify-between">
                  <span>Last Successful Send:</span>
                  <span className="font-medium text-slate-800">
                    {hotelSettings.lastSuccessfulSend ? new Date(hotelSettings.lastSuccessfulSend).toLocaleString() : 'None yet'}
                  </span>
                </div>
                {hotelSettings.lastFailureReason && (
                  <div className="flex justify-between text-red-600">
                    <span>Recent Failure:</span>
                    <span className="truncate max-w-[280px]" title={hotelSettings.lastFailureReason}>
                      {hotelSettings.lastFailureReason}
                    </span>
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2 border-t">
              <button
                onClick={() => setShowConfig(false)}
                className="px-3.5 py-2 text-xs text-slate-600 hover:text-slate-800 font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSettings}
                disabled={savingSettings}
                className="bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-medium text-xs px-5 py-2 rounded-lg transition disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
              >
                {savingSettings && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Save Configuration
              </button>
            </div>

            {settingsMsg && (
              <div
                className={`p-2.5 rounded-lg text-xs ${
                  settingsMsg.success
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-red-50 text-red-800 border border-red-200'
                }`}
              >
                {settingsMsg.text}
              </div>
            )}
          </div>
        )}

        {/* ─── Test Result Feedback ──────────────────────────────────────────── */}
        {testResult && (
          <div
            className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-2 ${
              testResult.success
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-amber-50 text-amber-800 border-amber-200'
            }`}
          >
            <div className="flex items-center gap-2">
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              )}
              <span>{testResult.message}</span>
            </div>
          </div>
        )}

        {/* ─── Send Feedback ─────────────────────────────────────────────────── */}
        {sendSuccessMsg && (
          <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center gap-2 shadow-sm">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-medium">{sendSuccessMsg}</span>
          </div>
        )}

        {sendErrorMsg && (
          <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs space-y-2 shadow-sm">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong className="font-semibold block">{sendErrorMsg}</strong>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-3.5 flex items-center gap-2">
            <XCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* ─── Loading / Data State ───────────────────────────────────────────── */}
        {loading ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500 space-y-2">
            <Loader2 className="w-6 h-6 animate-spin mx-auto text-emerald-600" />
            <p className="text-sm">Calculating daily business-date summary…</p>
          </div>
        ) : !summary || (!summary.hasData && summary.occupancy.occupied === 0 && summary.revenue.grossRevenue === 0) ? (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center space-y-3">
            <AlertCircle className="w-8 h-8 text-slate-400 mx-auto" />
            <h3 className="font-semibold text-slate-700 text-base">No Hotel Activity for this Business Date</h3>
            <p className="text-slate-500 text-sm max-w-md mx-auto">
              No reservations, room stays, or revenue transactions were recorded for{' '}
              <strong>{data?.businessDateReadable || selectedDate}</strong>.
            </p>
            <div className="pt-2 flex justify-center gap-2">
              <button
                onClick={() => setSelectedDate(new Date().toISOString().slice(0, 10))}
                className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg border"
              >
                View Today
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* ─── Live KPI Badges ──────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm">
                <div className="flex items-center justify-between text-slate-500 text-xs mb-1">
                  <span>Occupancy</span>
                  <Building className="w-3.5 h-3.5 text-emerald-600" />
                </div>
                <div className="text-lg font-bold text-slate-900">
                  {summary.occupancy.percentage}%
                </div>
                <div className="text-[11px] text-slate-500">
                  {summary.occupancy.occupied} / {summary.occupancy.totalRooms} rooms occupied
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm">
                <div className="flex items-center justify-between text-slate-500 text-xs mb-1">
                  <span>Front Office</span>
                  <Users className="w-3.5 h-3.5 text-blue-600" />
                </div>
                <div className="text-lg font-bold text-slate-900">
                  {summary.frontOffice.inHouse} In-House
                </div>
                <div className="text-[11px] text-slate-500">
                  {summary.frontOffice.arrivals} Arr • {summary.frontOffice.departures} Dep
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm">
                <div className="flex items-center justify-between text-slate-500 text-xs mb-1">
                  <span>Room Revenue</span>
                  <IndianRupee className="w-3.5 h-3.5 text-emerald-600" />
                </div>
                <div className="text-lg font-bold text-emerald-700 font-mono">
                  ₹{summary.revenue.roomRevenue.toLocaleString('en-IN')}
                </div>
                <div className="text-[11px] text-slate-500">
                  ADR: ₹{summary.performance.adr.toLocaleString('en-IN')}
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm">
                <div className="flex items-center justify-between text-slate-500 text-xs mb-1">
                  <span>Total Collection</span>
                  <TrendingUp className="w-3.5 h-3.5 text-indigo-600" />
                </div>
                <div className="text-lg font-bold text-indigo-700 font-mono">
                  ₹{summary.collection.total.toLocaleString('en-IN')}
                </div>
                <div className="text-[11px] text-slate-500">
                  Due: ₹{summary.collection.pendingDue.toLocaleString('en-IN')}
                </div>
              </div>
            </div>

            {/* ─── Summary Type Tabs ────────────────────────────────────────────── */}
            <div className="flex items-center gap-1.5 border-b border-slate-200 pb-2">
              <button
                onClick={() => setActiveTab('daily')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                  activeTab === 'daily'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200'
                }`}
              >
                <Building className="w-3.5 h-3.5" /> Daily Summary
              </button>
              <button
                onClick={() => setActiveTab('morning')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                  activeTab === 'morning'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200'
                }`}
              >
                <Sun className="w-3.5 h-3.5 text-amber-400" /> Morning Briefing
              </button>
              <button
                onClick={() => setActiveTab('evening')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                  activeTab === 'evening'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200'
                }`}
              >
                <Moon className="w-3.5 h-3.5 text-indigo-400" /> Closing Summary
              </button>
              <button
                onClick={() => setActiveTab('ota')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                  activeTab === 'ota'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200'
                }`}
              >
                <Radio className="w-3.5 h-3.5 text-purple-400" /> OTA Channels
              </button>
            </div>

            {/* ─── Summary Message Preview Card ─────────────────────────────────── */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="bg-slate-100/80 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                  <MessageCircle className="w-4 h-4 text-emerald-600" />
                  WhatsApp Live Message Preview ({activeTab.toUpperCase()})
                </span>
                <button
                  onClick={() => copy(activeReportText)}
                  className="px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-200 rounded-md font-medium text-slate-700 flex items-center gap-1 transition"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copied!' : 'Copy Text'}
                </button>
              </div>

              <div className="p-4 bg-slate-900 text-emerald-400 font-mono text-xs leading-relaxed overflow-x-auto select-all max-h-[480px]">
                <pre className="whitespace-pre-wrap font-mono">{activeReportText}</pre>
              </div>
            </div>

            {/* ─── Send History Table ──────────────────────────────────────────── */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-slate-500" /> WhatsApp Send History
                </h3>
                <button
                  onClick={() => fetchWhatsAppHistory(15).then(setHistory).catch(() => {})}
                  className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" /> Refresh
                </button>
              </div>

              {history.length === 0 ? (
                <p className="text-slate-400 text-xs italic text-center py-3">
                  No previous WhatsApp sends recorded for this property.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 font-medium">
                        <th className="pb-2">Date</th>
                        <th className="pb-2">Report</th>
                        <th className="pb-2">Recipient</th>
                        <th className="pb-2">Type</th>
                        <th className="pb-2">Status</th>
                        <th className="pb-2">Time</th>
                        <th className="pb-2 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {history.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50">
                          <td className="py-2 font-mono text-slate-600">{item.business_date || '—'}</td>
                          <td className="py-2 font-medium text-slate-800">
                            {item.report_type.replace('WHATSAPP_', '').replace('_SUMMARY', '')}
                          </td>
                          <td className="py-2 font-mono text-slate-600">+{item.recipient}</td>
                          <td className="py-2">
                            <span className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded text-[10px]">
                              {item.delivery_type}
                            </span>
                          </td>
                          <td className="py-2">
                            {item.status === 'delivered' ? (
                              <span className="text-emerald-700 font-semibold flex items-center gap-1">
                                ✓ Delivered
                              </span>
                            ) : item.status === 'submitted' || item.status === 'sent' ? (
                              <span className="text-indigo-700 font-medium flex items-center gap-1" title="Accepted by Whinta, awaiting delivery event">
                                Submitted to Provider
                              </span>
                            ) : item.status === 'queued' ? (
                              <span className="text-blue-700 font-medium flex items-center gap-1">
                                Queued
                              </span>
                            ) : item.status === 'duplicate' ? (
                              <span className="text-amber-700 font-medium flex items-center gap-1" title="Duplicate send prevented">
                                Duplicate / Skipped
                              </span>
                            ) : (
                              <span
                                className="text-red-600 font-semibold flex items-center gap-1"
                                title={item.last_error || 'Failed'}
                              >
                                ✕ Failed
                              </span>
                            )}
                          </td>
                          <td className="py-2 text-slate-500 text-[11px]">
                            {item.created_at ? new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                          </td>
                          <td className="py-2 text-right">
                            {item.status === 'failed' && (
                              <button
                                onClick={() => handleRetry(item.id)}
                                className="text-emerald-600 hover:text-emerald-800 text-[11px] underline font-medium"
                              >
                                Retry
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {/* ─── Fixed Bottom Actions Bar ────────────────────────────────────────── */}
      <footer className="fixed bottom-0 inset-x-0 w-full bg-white border-t border-slate-200 p-3 shadow-lg z-30">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
          <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500">
            <span>Send to: </span>
            <strong className="font-mono text-slate-800">
              {owner?.valid ? owner.formattedPhone : 'No number configured'}
            </strong>
            {deliveryStatus !== 'Ready' && (
              <span
                className={`text-[11px] px-2.5 py-0.5 rounded-full font-medium ${
                  deliveryStatus === 'Delivered'
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : deliveryStatus === 'Submitted to Provider'
                    ? 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                    : deliveryStatus === 'Sending...'
                    ? 'bg-blue-100 text-blue-800'
                    : deliveryStatus === 'Queued'
                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                    : deliveryStatus === 'Not Configured'
                    ? 'bg-amber-100 text-amber-800 border border-amber-200'
                    : 'bg-red-100 text-red-800 border border-red-200'
                }`}
              >
                {deliveryStatus}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <button
              onClick={handleSendNow}
              disabled={sending || !owner?.valid}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-semibold px-6 py-3 rounded-xl text-xs shadow-md transition disabled:opacity-50 cursor-pointer"
              title="Dispatch report directly via Whinta WhatsApp API"
            >
              {sending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Sending via Whinta…</span>
                </>
              ) : (
                <>
                  <MessageCircle className="w-4 h-4" />
                  <span>Send WhatsApp Summary (via Whinta)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};
