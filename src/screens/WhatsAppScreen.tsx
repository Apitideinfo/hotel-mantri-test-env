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
  CheckCircle,
  Database,
  Layers,
} from 'lucide-react';
import {
  fetchWhatsAppSummary,
  sendWhatsAppSummary,
  sendTestWhatsApp,
  fetchWhatsAppHistory,
  saveWhatsAppSettings,
  fetchWhatsAppSettings,
  verifyMetaConnection,
  fetchWhatsAppConfig,
  fetchWhatsAppTemplates,
  syncWhatsAppTemplates,
  retryWhatsAppSend,
  type WhatsAppReportType,
  type WhatsAppSummaryResponse,
  type WhatsAppHistoryItem,
  type WhatsAppSettingsResponse,
  type WhatsAppConfigResponse,
  type MetaConnectionResponse,
  type WhatsAppTemplateItem,
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

  // Meta Cloud API Provider Configuration & Diagnostics
  const [providerConfig, setProviderConfig] = useState<WhatsAppConfigResponse | null>(null);
  const [verifyingConn, setVerifyingConn] = useState(false);
  const [connTestResult, setConnTestResult] = useState<MetaConnectionResponse | null>(null);
  const [templatesList, setTemplatesList] = useState<WhatsAppTemplateItem[]>([]);
  const [syncingTemplates, setSyncingTemplates] = useState(false);
  const [syncMsg, setSyncMsg] = useState<{ success: boolean; text: string } | null>(null);
  const [showTemplatesGallery, setShowTemplatesGallery] = useState(true);

  // Hotel settings state
  const [hotelSettings, setHotelSettings] = useState<WhatsAppSettingsResponse | null>(null);

  // Sending state machine
  type DeliveryStatus = 'Not Configured' | 'Configuration Error' | 'Ready' | 'Queued' | 'Submitted to Meta' | 'Delivered' | 'Failed' | 'Sending...';
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
  const [editReservationEnabled, setEditReservationEnabled] = useState(true);
  const [editReservationTemplate, setEditReservationTemplate] = useState('reservation_confirmation');
  const [editDailyReportTemplate, setEditDailyReportTemplate] = useState('daily_hotel_report');
  const [editTemplateLanguage, setEditTemplateLanguage] = useState('en');
  const [editLaundryEnabled, setEditLaundryEnabled] = useState(true);
  const [editPreferredTime, setEditPreferredTime] = useState('22:00');
  const [editTimezone, setEditTimezone] = useState('Asia/Kolkata');
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState<{ success: boolean; text: string } | null>(null);

  const [copied, copy] = useClipboard();

  // Helper to safely mask message IDs
  const maskMessageId = (id?: string | null): string => {
    if (!id) return '';
    if (id.length <= 4) return id;
    return `wamid...${id.slice(-4)}`;
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
        setEditReservationEnabled(settingsRes.reservationConfirmationEnabled ?? true);
        setEditReservationTemplate(settingsRes.reservationTemplate || configRes?.reservationTemplate || 'reservation_confirmation');
        setEditDailyReportTemplate(settingsRes.dailyReportTemplate || configRes?.dailyReportTemplate || 'daily_hotel_report');
        setEditTemplateLanguage(settingsRes.templateLanguage || 'en');
        setEditLaundryEnabled(settingsRes.laundryStatementEnabled ?? true);
        setEditPreferredTime(settingsRes.preferredDeliveryTime || '22:00');
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
      setError(err.message || 'Failed to load daily report data.');
      setDeliveryStatus('Failed');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadSummary();
  }, [selectedDate, activeTab]);

  // Load templates on initial mount
  useEffect(() => {
    fetchWhatsAppTemplates()
      .then((res) => {
        if (res.templates && res.templates.length > 0) {
          setTemplatesList(res.templates);
        }
      })
      .catch(() => {});
  }, []);

  // Sync templates directly from Meta WABA
  const handleSyncTemplates = async () => {
    if (syncingTemplates) return;
    setSyncingTemplates(true);
    setSyncMsg(null);
    try {
      const res = await syncWhatsAppTemplates();
      if (res.success && res.templates) {
        setTemplatesList(res.templates);
        setSyncMsg({
          success: true,
          text: `✓ Synchronized ${res.templates.length} templates from Meta WhatsApp Business Account.`,
        });
      } else {
        setSyncMsg({
          success: false,
          text: res.error || res.message || 'Failed to synchronize templates from Meta.',
        });
      }
    } catch (err: any) {
      setSyncMsg({
        success: false,
        text: err.message || 'Error synchronizing templates with Meta API.',
      });
    } finally {
      setSyncingTemplates(false);
    }
  };

  const approvedTemplates = useMemo(() => {
    return templatesList.filter((t) => String(t.status).toUpperCase() === 'APPROVED');
  }, [templatesList]);

  // Date Navigation helpers
  const handlePrevDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() - 1);
    setSelectedDate(d.toISOString().slice(0, 10));
  };

  const handleNextDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + 1);
    setSelectedDate(d.toISOString().slice(0, 10));
  };

  const handleToday = () => {
    setSelectedDate(new Date().toISOString().slice(0, 10));
  };

  const activeReportText = useMemo(() => {
    if (!data?.text) return '';
    return data.text[activeTab] || data.text.daily || '';
  }, [data, activeTab]);

  const activeDirectUrl = useMemo(() => {
    if (!data?.whatsappDirectUrls) return null;
    return fallbackDirectUrl || data.whatsappDirectUrls[activeTab] || data.whatsappDirectUrls.daily || null;
  }, [data, activeTab, fallbackDirectUrl]);

  // Handle Send WhatsApp Summary
  const handleSendNow = async () => {
    if (sending) return;
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
        setDeliveryStatus('Submitted to Meta');
        const idSuffix = res.messageId ? ` (${maskMessageId(res.messageId)})` : '';
        setSendSuccessMsg(`✓ Summary submitted to Meta WhatsApp Cloud API${idSuffix}. Delivery status will update upon receipt.`);
        fetchWhatsAppHistory(20).then(setHistory).catch(() => {});
      } else if (res.status === 'provider_not_configured' || res.errorCode === 'WHATSAPP_PROVIDER_NOT_CONFIGURED') {
        setDeliveryStatus('Not Configured');
        setSendErrorMsg(res.message || 'Meta WhatsApp delivery is not configured on the server. Configure META_WHATSAPP_ACCESS_TOKEN and META_WHATSAPP_PHONE_NUMBER_ID.');
        if (res.whatsappDirectUrl) setFallbackDirectUrl(res.whatsappDirectUrl);
      } else if (res.status === 'invalid_recipient' || res.errorCode === 'WHATSAPP_RECIPIENT_INVALID') {
        setDeliveryStatus('Configuration Error');
        setSendErrorMsg(res.message || 'Owner WhatsApp recipient number is missing or invalid. Please configure it in settings.');
      } else {
        setDeliveryStatus('Failed');
        setSendErrorMsg(res.message || 'Failed to dispatch WhatsApp summary.');
        if (res.whatsappDirectUrl) setFallbackDirectUrl(res.whatsappDirectUrl);
      }
    } catch (err: any) {
      setDeliveryStatus('Failed');
      setSendErrorMsg(err.message || 'An error occurred while dispatching WhatsApp message.');
      if (err.whatsappDirectUrl) setFallbackDirectUrl(err.whatsappDirectUrl);
    } finally {
      setSending(false);
    }
  };

  // Handle Live Meta Connection Verification
  const handleVerifyConnection = async () => {
    if (verifyingConn) return;
    setVerifyingConn(true);
    setConnTestResult(null);

    try {
      const res = await verifyMetaConnection();
      setConnTestResult(res);
      if (res.connected) {
        setDeliveryStatus(owner?.valid ? 'Ready' : 'Configuration Error');
      } else {
        setDeliveryStatus('Configuration Error');
      }
    } catch (err: any) {
      setConnTestResult({
        success: false,
        configured: true,
        connected: false,
        error: 'CONNECTION_FAILED',
        message: err.message || 'Failed to verify Meta WhatsApp Cloud API connection.',
      });
      setDeliveryStatus('Configuration Error');
    } finally {
      setVerifyingConn(false);
    }
  };

  // Handle Send Test WhatsApp
  const handleSendTest = async () => {
    if (testing) return;
    setTesting(true);
    setTestResult(null);

    try {
      const res = await sendTestWhatsApp();
      if (res.success) {
        setTestResult({
          success: true,
          message: `✓ Test message dispatched via Meta WhatsApp Cloud API to ${res.recipient || 'configured number'}.`,
        });
        fetchWhatsAppHistory(20).then(setHistory).catch(() => {});
      } else {
        setTestResult({
          success: false,
          message: res.message || 'Failed to send test message via Meta WhatsApp Cloud API.',
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'Failed to send test message.',
      });
    } finally {
      setTesting(false);
    }
  };

  // Retry sending a failed message
  const handleRetry = async (notificationId: string) => {
    try {
      const res = await retryWhatsAppSend(notificationId);
      if (res.success) {
        setSendSuccessMsg('✓ Message re-dispatched successfully via Meta WhatsApp Cloud API.');
        fetchWhatsAppHistory(20).then(setHistory).catch(() => {});
      } else {
        setSendErrorMsg(res.message || 'Failed to retry notification.');
      }
    } catch (err: any) {
      setSendErrorMsg(err.message || 'Retry failed.');
    }
  };

  // Save Settings
  const handleSaveSettings = async () => {
    setSavingSettings(true);
    setSettingsMsg(null);

    try {
      const res = await saveWhatsAppSettings({
        whatsappNumber: editPhone,
        reportRecipientPhone: editPhone,
        countryCode: editCountryCode,
        dailyReportEnabled: editDailyEnabled,
        reservationConfirmationEnabled: editReservationEnabled,
        reservationTemplate: editReservationTemplate,
        dailyReportTemplate: editDailyReportTemplate,
        templateLanguage: editTemplateLanguage,
        laundryStatementEnabled: editLaundryEnabled,
        preferredDeliveryTime: editPreferredTime,
        timezone: editTimezone,
      });

      if (res.success) {
        setSettingsMsg({ success: true, text: '✓ WhatsApp integration settings saved successfully.' });
        loadSummary(false);
        setTimeout(() => setShowConfig(false), 1500);
      } else {
        setSettingsMsg({ success: false, text: res.message || 'Failed to save settings.' });
      }
    } catch (err: any) {
      setSettingsMsg({ success: false, text: err.message || 'Failed to save settings.' });
    } finally {
      setSavingSettings(false);
    }
  };

  const owner = data?.ownerWhatsApp;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-28">
      {/* ─── Top Header ──────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 bg-white border-b border-slate-200 px-4 py-3 shadow-xs">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 active:bg-slate-200 text-slate-600 transition"
              title="Back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-slate-900 text-base sm:text-lg flex items-center gap-1.5">
                  <MessageCircle className="w-5 h-5 text-emerald-600" />
                  Meta WhatsApp Business Integration
                </h1>
                <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Official Cloud API
                </span>
              </div>
              <p className="text-xs text-slate-500 hidden sm:block">
                Direct Meta WhatsApp Cloud API messaging for reservations &amp; automated daily MIS reports
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowConfig(!showConfig)}
              className="p-2 rounded-lg border border-slate-200 hover:bg-slate-100 active:bg-slate-200 text-slate-600 transition flex items-center gap-1.5 text-xs font-medium"
              title="Configure WhatsApp recipient and template settings"
            >
              <Sliders className="w-4 h-4 text-emerald-600" />
              <span className="hidden sm:inline">Settings</span>
            </button>

            <button
              onClick={() => loadSummary(false)}
              disabled={refreshing}
              className="p-2 rounded-lg border border-slate-200 hover:bg-slate-100 active:bg-slate-200 text-slate-600 transition disabled:opacity-50"
              title="Refresh Data"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>

            <button
              onClick={() => copy(activeReportText)}
              disabled={!activeReportText}
              className="px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs flex items-center gap-1.5 shadow-sm transition disabled:opacity-50 cursor-pointer"
              title="Copy text summary to clipboard"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              <span className="hidden sm:inline">{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-5 space-y-4">
        {/* ─── Meta Cloud API Status & Diagnostics Card (Section 9) ───────────── */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-900 text-sm">
                  {data?.hotelName || 'Hotel Mantri'}
                </span>
                <span className="text-slate-400">|</span>
                <span className="text-xs text-slate-600 font-medium">Meta WhatsApp Cloud API</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-500">
                <span className="flex items-center gap-1 font-mono">
                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                  Recipient: <strong className="text-slate-800 font-semibold">{owner?.valid ? owner.formattedPhone : 'Not configured'}</strong>
                </span>
                {providerConfig?.graphApiVersion && (
                  <span className="bg-slate-100 text-slate-700 font-mono text-[11px] px-2 py-0.5 rounded">
                    Graph {providerConfig.graphApiVersion}
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Provider Status Badge */}
              <span
                className={`px-2.5 py-1 rounded-full font-medium text-xs flex items-center gap-1.5 ${
                  providerConfig?.configured
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-amber-50 text-amber-800 border border-amber-200'
                }`}
              >
                <Wifi className="w-3 h-3" />
                {providerConfig?.configured ? 'Meta API Connected' : 'Meta API Not Configured'}
              </span>

              {/* Status Indicator Badge */}
              <span
                className={`px-2.5 py-1 rounded-full font-semibold text-[11px] ${
                  deliveryStatus === 'Delivered'
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : deliveryStatus === 'Submitted to Meta'
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
                className="px-2.5 py-1 rounded-lg border border-slate-300 hover:bg-slate-100 active:bg-slate-200 text-slate-700 font-medium text-xs flex items-center gap-1 disabled:opacity-50 transition cursor-pointer"
                title="Verify connection to Meta WhatsApp Cloud API"
              >
                {verifyingConn ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldCheck className="w-3 h-3 text-emerald-600" />}
                Test Connection
              </button>

              {/* Send Test Button */}
              <button
                onClick={handleSendTest}
                disabled={testing || !owner?.valid}
                className="px-2.5 py-1 rounded-lg border border-slate-300 hover:bg-slate-100 active:bg-slate-200 text-slate-700 font-medium text-xs flex items-center gap-1 disabled:opacity-50 transition cursor-pointer"
                title="Send test WhatsApp message to configured phone"
              >
                {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3 h-3 text-slate-600" />}
                Send Test Message
              </button>
            </div>
          </div>

          {/* Connection Test Live Result */}
          {connTestResult && (
            <div
              className={`p-3 rounded-lg text-xs border ${
                connTestResult.connected
                  ? 'bg-emerald-50 text-emerald-950 border-emerald-200'
                  : 'bg-red-50 text-red-950 border-red-200'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <div className="font-bold flex items-center gap-1.5">
                    {connTestResult.connected ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                    )}
                    <span>{connTestResult.message}</span>
                  </div>
                  {connTestResult.connected && (
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-emerald-900 pt-1 font-mono">
                      {connTestResult.verifiedName && <span>Verified Name: <strong>{connTestResult.verifiedName}</strong></span>}
                      {connTestResult.displayPhoneNumber && <span>Display Number: <strong>{connTestResult.displayPhoneNumber}</strong></span>}
                      {connTestResult.qualityRating && <span>Quality Rating: <strong className="text-emerald-700">{connTestResult.qualityRating}</strong></span>}
                      {connTestResult.codeVerificationStatus && <span>Status: <strong>{connTestResult.codeVerificationStatus}</strong></span>}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setConnTestResult(null)}
                  className="text-slate-400 hover:text-slate-600 text-xs px-1"
                >
                  ✕
                </button>
              </div>
            </div>
          )}

          {/* Configuration Metadata Pill Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs pt-1">
            <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Phone Number ID</span>
              <span className="font-mono font-medium text-slate-800">
                {providerConfig?.phoneNumberIdSuffix ? `ID: ${providerConfig.phoneNumberIdSuffix}` : (providerConfig?.configured ? 'Configured' : 'Missing')}
              </span>
            </div>
            <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Reservation Template</span>
              <span className="font-mono font-medium text-slate-800 truncate block" title={providerConfig?.reservationTemplate || 'reservation_confirmation'}>
                {providerConfig?.reservationTemplate || 'reservation_confirmation'}
              </span>
            </div>
            <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Daily Report Template</span>
              <span className="font-mono font-medium text-slate-800 truncate block" title={providerConfig?.dailyReportTemplate || 'daily_hotel_report'}>
                {providerConfig?.dailyReportTemplate || 'daily_hotel_report'}
              </span>
            </div>
            <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Access Token</span>
              <span className="font-mono font-medium text-emerald-700 flex items-center gap-1">
                <CheckCircle className="w-3 h-3" />
                •••••••• (Server-side)
              </span>
            </div>
          </div>
        </div>

        {/* ─── Provider Unconfigured Notice Banner ────────────────────────────── */}
        {providerConfig && !providerConfig.configured && (
          <div className="bg-amber-50/90 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-900 flex items-start gap-3 shadow-xs">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-semibold text-amber-950">Meta WhatsApp Cloud API is not configured.</div>
              <div className="text-amber-800 text-[11px] leading-relaxed">
                To enable direct background delivery, configure <code className="font-mono bg-amber-100 px-1 py-0.5 rounded text-amber-900">META_WHATSAPP_ACCESS_TOKEN</code> and <code className="font-mono bg-amber-100 px-1 py-0.5 rounded text-amber-900">META_WHATSAPP_PHONE_NUMBER_ID</code> in your server environment variables.
              </div>
            </div>
          </div>
        )}

        {/* ─── Settings Drawer / Modal (Section 9) ────────────────────────────── */}
        {showConfig && (
          <div className="bg-white rounded-xl border-2 border-emerald-500 p-5 shadow-lg space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-2">
              <h3 className="font-semibold text-slate-900 text-sm flex items-center gap-2">
                <Sliders className="w-4 h-4 text-emerald-600" /> WhatsApp Integration &amp; Template Configuration
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSyncTemplates}
                  disabled={syncingTemplates}
                  className="px-2.5 py-1 rounded-lg border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 active:bg-emerald-200 text-emerald-800 text-xs font-medium flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                  title="Fetch latest approved templates from Meta WhatsApp Business Account"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${syncingTemplates ? 'animate-spin' : ''}`} />
                  <span>{syncingTemplates ? 'Syncing...' : 'Sync Templates from Meta'}</span>
                </button>
                <button
                  onClick={() => setShowConfig(false)}
                  className="text-slate-400 hover:text-slate-600 text-xs px-2 py-1 rounded"
                >
                  Close ✕
                </button>
              </div>
            </div>

            {syncMsg && (
              <div
                className={`p-2.5 rounded-lg text-xs border ${
                  syncMsg.success
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-red-50 text-red-800 border-red-200'
                }`}
              >
                {syncMsg.text}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              {/* Recipient Phone & Country Code */}
              <div className="space-y-1.5 sm:col-span-2">
                <label className="font-medium text-slate-700 flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5 text-slate-500" /> WhatsApp Admin / Owner Recipient Phone Number
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
                    placeholder="9876543210 or +919876543210"
                    className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <p className="text-[11px] text-slate-500">
                  Daily reports will be sent automatically to this authorized owner WhatsApp number.
                </p>
              </div>

              {/* Reservation Template Selector */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="font-medium text-slate-700 flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5 text-slate-500" /> Meta Reservation Template
                  </label>
                  <span className="text-[10px] text-emerald-700 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                    Approved Only
                  </span>
                </div>
                {approvedTemplates.length > 0 ? (
                  <select
                    value={editReservationTemplate}
                    onChange={(e) => setEditReservationTemplate(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {approvedTemplates.map((tpl) => (
                      <option key={tpl.name} value={tpl.name}>
                        {tpl.name} ({tpl.language}) {tpl.headerType === 'DOCUMENT' ? '📄 [PDF Header]' : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={editReservationTemplate}
                    onChange={(e) => setEditReservationTemplate(e.target.value)}
                    placeholder="reservation_confirmation"
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                )}
                <p className="text-[11px] text-slate-500">
                  Approved Meta template for guest booking confirmations with dynamic PDF document header.
                </p>
              </div>

              {/* Daily Report Template Selector */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="font-medium text-slate-700 flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5 text-slate-500" /> Meta Daily Report Template
                  </label>
                  <span className="text-[10px] text-emerald-700 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                    Approved Only
                  </span>
                </div>
                {approvedTemplates.length > 0 ? (
                  <select
                    value={editDailyReportTemplate}
                    onChange={(e) => setEditDailyReportTemplate(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {approvedTemplates.map((tpl) => (
                      <option key={tpl.name} value={tpl.name}>
                        {tpl.name} ({tpl.language}) {tpl.headerType === 'DOCUMENT' ? '📄 [PDF Header]' : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={editDailyReportTemplate}
                    onChange={(e) => setEditDailyReportTemplate(e.target.value)}
                    placeholder="daily_hotel_report"
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                )}
                <p className="text-[11px] text-slate-500">
                  Approved Meta template for daily summary and PDF delivery to hotel admin.
                </p>
              </div>

              {/* Template Language */}
              <div className="space-y-1">
                <label className="font-medium text-slate-700 flex items-center gap-1">
                  <Globe className="w-3.5 h-3.5 text-slate-500" /> Template Language Code
                </label>
                <input
                  type="text"
                  value={editTemplateLanguage}
                  onChange={(e) => setEditTemplateLanguage(e.target.value)}
                  placeholder="en"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <p className="text-[11px] text-slate-500">e.g. en, en_US, hi</p>
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
              <div className="space-y-1 sm:col-span-2">
                <label className="font-medium text-slate-700 flex items-center gap-1">
                  <Globe className="w-3.5 h-3.5 text-slate-500" /> Hotel Timezone
                </label>
                <select
                  value={editTimezone}
                  onChange={(e) => setEditTimezone(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                >
                  <option value="Asia/Kolkata">Asia/Kolkata (IST +05:30) [Default]</option>
                  <option value="UTC">UTC (GMT +00:00)</option>
                  <option value="Asia/Dubai">Asia/Dubai (GST +04:00)</option>
                  <option value="Asia/Singapore">Asia/Singapore (SGT +08:00)</option>
                </select>
                <p className="text-[11px] text-slate-500">Business dates and midnight roll-overs follow this zone.</p>
              </div>

              {/* Toggles */}
              <div className="flex items-start gap-2.5 p-3 rounded-lg border border-slate-200 bg-slate-50/50">
                <input
                  type="checkbox"
                  id="toggleDailyReport"
                  checked={editDailyEnabled}
                  onChange={(e) => setEditDailyEnabled(e.target.checked)}
                  className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                />
                <label htmlFor="toggleDailyReport" className="cursor-pointer space-y-0.5">
                  <div className="font-semibold text-slate-800">Automated Daily Report</div>
                  <p className="text-[11px] text-slate-500 leading-normal">
                    Deliver daily summary PDF and KPIs via WhatsApp cron to admin.
                  </p>
                </label>
              </div>

              <div className="flex items-start gap-2.5 p-3 rounded-lg border border-slate-200 bg-slate-50/50">
                <input
                  type="checkbox"
                  id="toggleReservationReport"
                  checked={editReservationEnabled}
                  onChange={(e) => setEditReservationEnabled(e.target.checked)}
                  className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                />
                <label htmlFor="toggleReservationReport" className="cursor-pointer space-y-0.5">
                  <div className="font-semibold text-slate-800">Reservation Confirmations</div>
                  <p className="text-[11px] text-slate-500 leading-normal">
                    Send booking confirmation with PDF slip to guest upon reservation.
                  </p>
                </label>
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

        {/* ─── Feedback Messages ──────────────────────────────────────────────── */}
        {sendSuccessMsg && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 text-xs flex items-center gap-2 shadow-xs">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{sendSuccessMsg}</span>
          </div>
        )}

        {sendErrorMsg && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-900 text-xs flex items-start gap-2 shadow-xs">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-semibold">{sendErrorMsg}</div>
              {fallbackDirectUrl && (
                <a
                  href={fallbackDirectUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-emerald-700 underline font-medium pt-1"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Click here to open WhatsApp Web with pre-filled message
                </a>
              )}
            </div>
          </div>
        )}

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

        {/* ─── Date Picker & Tab Selector ────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
          {/* Date Selector */}
          <div className="flex items-center gap-1.5 w-full sm:w-auto">
            <button
              onClick={handlePrevDay}
              className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600"
              title="Previous Day"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <button
              onClick={handleNextDay}
              className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600"
              title="Next Day"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={handleToday}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-xs font-medium text-slate-600"
            >
              Today
            </button>
          </div>

          {/* Report Tab Selector */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl w-full sm:w-auto overflow-x-auto">
            <button
              onClick={() => setActiveTab('daily')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeTab === 'daily'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Executive Daily
            </button>
            <button
              onClick={() => setActiveTab('morning')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1 ${
                activeTab === 'morning'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Sun className="w-3 h-3 text-amber-500" /> Morning Brief
            </button>
            <button
              onClick={() => setActiveTab('evening')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1 ${
                activeTab === 'evening'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Moon className="w-3 h-3 text-indigo-500" /> Evening Summary
            </button>
            <button
              onClick={() => setActiveTab('ota')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1 ${
                activeTab === 'ota'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Radio className="w-3 h-3 text-sky-500" /> OTA Performance
            </button>
          </div>
        </div>

        {/* ─── Loading & Error State ─────────────────────────────────────────── */}
        {loading && (
          <div className="p-12 text-center bg-white rounded-xl border border-slate-200">
            <Loader2 className="w-8 h-8 text-emerald-600 animate-spin mx-auto mb-2" />
            <p className="text-xs text-slate-500">Calculating PMS report metrics...</p>
          </div>
        )}

        {error && !loading && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-900 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* ─── Content Preview & Outbox ──────────────────────────────────────── */}
        {!loading && !error && data && (
          <>
            {/* KPI Overview Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Occupancy</span>
                <div className="text-xl font-bold text-slate-900 mt-0.5">
                  {data.summary.occupancy.percentage}%
                </div>
                <span className="text-[11px] text-slate-500">
                  {data.summary.occupancy.occupied} / {data.summary.occupancy.totalRooms} Rooms
                </span>
              </div>

              <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Gross Revenue</span>
                <div className="text-xl font-bold text-emerald-700 mt-0.5">
                  ₹{Math.round(data.summary.revenue.grossRevenue).toLocaleString('en-IN')}
                </div>
                <span className="text-[11px] text-slate-500">
                  Room: ₹{Math.round(data.summary.revenue.roomRevenue).toLocaleString('en-IN')}
                </span>
              </div>

              <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Closing Cash</span>
                <div className="text-xl font-bold text-amber-700 mt-0.5">
                  ₹{Math.round(data.summary.collection.cash).toLocaleString('en-IN')}
                </div>
                <span className="text-[11px] text-slate-500">Physical in drawer</span>
              </div>

              <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Operations</span>
                <div className="text-xl font-bold text-slate-900 mt-0.5">
                  {data.summary.frontOffice.inHouse} In-House
                </div>
                <span className="text-[11px] text-slate-500">
                  {data.summary.frontOffice.arrivals} In | {data.summary.frontOffice.departures} Out
                </span>
              </div>
            </div>

            {/* Formatted Text Preview Card */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
              <div className="bg-slate-50 border-b border-slate-200 px-4 py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageCircle className="w-4 h-4 text-emerald-600" />
                  <span className="font-semibold text-xs text-slate-800">
                    Preview ({activeTab.toUpperCase()})
                  </span>
                </div>
                {activeDirectUrl && (
                  <a
                    href={activeDirectUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-emerald-700 hover:text-emerald-800 font-medium inline-flex items-center gap-1"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> wa.me Web Link
                  </a>
                )}
              </div>
              <div className="p-4 bg-slate-900 text-slate-100 font-mono text-xs whitespace-pre-wrap leading-relaxed max-h-[380px] overflow-y-auto selection:bg-emerald-500 selection:text-white">
                {activeReportText}
              </div>
            </div>

            {/* ─── Synchronized Meta Message Templates Gallery (Phase 2 & 7) ──── */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-emerald-600" />
                  <h3 className="font-semibold text-slate-900 text-xs uppercase tracking-wider">
                    Synchronized Meta Message Templates
                  </h3>
                  <span className="bg-slate-100 text-slate-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
                    {templatesList.length} templates
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowTemplatesGallery(!showTemplatesGallery)}
                    className="text-xs text-slate-600 hover:text-slate-800 font-medium px-2 py-1 rounded border border-slate-200"
                  >
                    {showTemplatesGallery ? 'Hide Templates' : 'View Templates'}
                  </button>
                  <button
                    onClick={handleSyncTemplates}
                    disabled={syncingTemplates}
                    className="px-2.5 py-1 rounded-lg border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-medium flex items-center gap-1.5 transition disabled:opacity-50 cursor-pointer"
                  >
                    <RefreshCw className={`w-3 h-3 ${syncingTemplates ? 'animate-spin' : ''}`} />
                    <span>{syncingTemplates ? 'Syncing...' : 'Sync from Meta'}</span>
                  </button>
                </div>
              </div>

              {showTemplatesGallery && (
                <div className="space-y-3 pt-1">
                  {templatesList.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg">
                      No templates synchronized yet. Click &quot;Sync from Meta&quot; to fetch your approved templates.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {templatesList.map((tpl) => {
                        const isApproved = String(tpl.status).toUpperCase() === 'APPROVED';
                        const isPending = String(tpl.status).toUpperCase() === 'PENDING';
                        return (
                          <div
                            key={`${tpl.name}_${tpl.language}`}
                            className="p-3 rounded-lg border border-slate-200 bg-slate-50/50 hover:bg-white hover:border-emerald-300 transition space-y-2 text-xs"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <span className="font-bold text-slate-900 font-mono text-xs">{tpl.name}</span>
                                <div className="text-[11px] text-slate-500 flex items-center gap-1 font-mono">
                                  <span>Lang: <strong>{tpl.language}</strong></span>
                                  {tpl.templateId && <span>• ID: {tpl.templateId}</span>}
                                </div>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                    isApproved
                                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                      : isPending
                                      ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                      : 'bg-red-100 text-red-800 border border-red-300'
                                  }`}
                                >
                                  {tpl.status}
                                </span>
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                              {tpl.category && (
                                <span className="bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded font-mono">
                                  {tpl.category}
                                </span>
                              )}
                              {tpl.headerType && tpl.headerType !== 'NONE' && (
                                <span className="bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded font-medium flex items-center gap-0.5">
                                  {tpl.headerType === 'DOCUMENT' ? '📄 Header: DOCUMENT' : `Header: ${tpl.headerType}`}
                                </span>
                              )}
                              {Array.isArray(tpl.bodyVariables) && tpl.bodyVariables.length > 0 && (
                                <span className="bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded font-mono">
                                  {tpl.bodyVariables.length} vars ({tpl.bodyVariables.map(v => `{{${v}}}`).join(', ')})
                                </span>
                              )}
                            </div>

                            {tpl.bodyText && (
                              <p className="text-[11px] text-slate-600 line-clamp-2 italic bg-white p-1.5 rounded border border-slate-100">
                                &quot;{tpl.bodyText}&quot;
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ─── Recent Delivery Logs (Section 9) ────────────────────────────── */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-900 text-xs uppercase tracking-wider">
                  Recent WhatsApp Delivery Logs
                </h3>
                <span className="text-[11px] text-slate-500">
                  {history.length} recent dispatches
                </span>
              </div>

              {history.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg">
                  No WhatsApp messages logged for this property yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b text-slate-400 uppercase text-[10px]">
                        <th className="pb-2">Date</th>
                        <th className="pb-2">Report / Ref</th>
                        <th className="pb-2">Recipient</th>
                        <th className="pb-2">Type</th>
                        <th className="pb-2">Status</th>
                        <th className="pb-2">Time</th>
                        <th className="pb-2 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {history.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50/60">
                          <td className="py-2 font-mono text-slate-600">{item.business_date || '—'}</td>
                          <td className="py-2 font-medium text-slate-900">
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
                              <span className="text-indigo-700 font-medium flex items-center gap-1" title="Accepted by Meta Cloud API">
                                Submitted to Meta
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
                                className="text-emerald-600 hover:text-emerald-800 text-[11px] underline font-medium cursor-pointer"
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
                    : deliveryStatus === 'Submitted to Meta'
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
              title="Dispatch report directly via Meta WhatsApp Cloud API"
            >
              {sending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Sending via Meta…</span>
                </>
              ) : (
                <>
                  <MessageCircle className="w-4 h-4" />
                  <span>Send WhatsApp Summary (via Meta)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default WhatsAppScreen;
