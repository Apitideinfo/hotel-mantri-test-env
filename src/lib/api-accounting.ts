import { supabase } from './supabase';
import { getCurrentHotelId } from './api';
import { toNum } from './calc';
import type {
  ChartOfAccount, ChartOfAccountInput, AccountGroup,
  JournalEntry, JournalInput, JournalLine, JournalStatus,
  Voucher, VoucherInput, VoucherType,
  Vendor, VendorInput,
  OpeningBalance,
  Budget,
  BankReconciliation,
  PostingRule, MappingType,
  FinanceException, ExceptionType, ExceptionStatus,
  OTASettlement, OTASettlementInput,
  TrialBalanceRow, ProfitLoss, BalanceSheet, BalanceSheetRow, PLSection,
  LedgerEntry, AgeingBucket,
} from './types-accounting';
import {
  DEFAULT_ACCOUNT_TEMPLATES, VOUCHER_TYPE_PREFIXES,
  getFinancialYear, getAgeingBucket,
} from './types-accounting';

const today = () => new Date().toISOString().slice(0, 10);

// ── Chart of Accounts ──

export const getChartOfAccounts = async (includeInactive = false): Promise<ChartOfAccount[]> => {
  let q = supabase
    .from('chart_of_accounts')
    .select('*')
    .eq('hotel_id', getCurrentHotelId())
    .order('account_group', { ascending: true })
    .order('sort_order', { ascending: true });
  if (!includeInactive) q = q.eq('is_active', true);
  const { data, error } = await q;
  if (error) throw error;
  return (data as ChartOfAccount[]) ?? [];
};

export const saveChartOfAccount = async (input: ChartOfAccountInput, id?: string): Promise<ChartOfAccount> => {
  const payload = { ...input, hotel_id: getCurrentHotelId() };
  if (id) {
    const { data, error } = await supabase.from('chart_of_accounts').update(payload).eq('id', id).select('*').single();
    if (error) throw error;
    return data as ChartOfAccount;
  }
  const { count } = await supabase.from('chart_of_accounts').select('id', { count: 'exact', head: true }).eq('hotel_id', getCurrentHotelId());
  payload.sort_order = (count ?? 0) + 1;
  const { data, error } = await supabase.from('chart_of_accounts').insert(payload).select('*').single();
  if (error) throw error;
  return data as ChartOfAccount;
};

export const toggleChartOfAccount = async (id: string, isActive: boolean): Promise<void> => {
  const { error } = await supabase.from('chart_of_accounts').update({ is_active: isActive }).eq('id', id);
  if (error) throw error;
};

export const deleteChartOfAccount = async (id: string): Promise<void> => {
  // Check if used in journal lines
  const { count } = await supabase.from('journal_lines').select('id', { count: 'exact', head: true }).eq('account_id', id);
  if ((count ?? 0) > 0) throw new Error('Cannot delete account used in transactions. Deactivate it instead.');
  const { error } = await supabase.from('chart_of_accounts').delete().eq('id', id);
  if (error) throw error;
};

export const seedDefaultAccounts = async (): Promise<void> => {
  const hotelId = getCurrentHotelId();
  const { count } = await supabase.from('chart_of_accounts').select('id', { count: 'exact', head: true }).eq('hotel_id', hotelId);
  if ((count ?? 0) > 0) return;

  const rows = DEFAULT_ACCOUNT_TEMPLATES.map((t, i) => ({
    hotel_id: hotelId,
    account_code: t.code,
    account_name: t.name,
    account_group: t.group,
    account_subgroup: t.subgroup,
    is_active: true,
    is_system: true,
    sort_order: i + 1,
  }));
  const { error } = await supabase.from('chart_of_accounts').insert(rows);
  if (error) throw error;
};

// Helper: find account by code
export const findAccountByCode = (accounts: ChartOfAccount[], code: string): ChartOfAccount | undefined =>
  accounts.find((a) => a.account_code === code);

// ── Journal Entries ──

const generateJournalNumber = async (): Promise<string> => {
  const hotelId = getCurrentHotelId();
  const fy = getFinancialYear(today());
  const prefix = 'JE';
  const { count } = await supabase.from('journal_entries').select('id', { count: 'exact', head: true }).eq('hotel_id', hotelId);
  const seq = String((count ?? 0) + 1).padStart(6, '0');
  return `${prefix}/${fy}/${seq}`;
};

export const postJournal = async (input: JournalInput): Promise<JournalEntry> => {
  const hotelId = getCurrentHotelId();

  // Validate balanced
  const totalDebit = input.lines.reduce((s, l) => s + toNum(l.debit), 0);
  const totalCredit = input.lines.reduce((s, l) => s + toNum(l.credit), 0);
  if (totalDebit !== totalCredit) {
    throw new Error(`Journal not balanced. Debit: ${totalDebit}, Credit: ${totalCredit}`);
  }
  if (input.lines.length < 2) {
    throw new Error('Journal must have at least 2 lines.');
  }

  // Idempotency check
  if (input.source_record_id) {
    const { data: existing } = await supabase
      .from('journal_entries')
      .select('id')
      .eq('hotel_id', hotelId)
      .eq('source_record_id', input.source_record_id)
      .eq('reference_type', input.reference_type ?? 'manual')
      .neq('status', 'cancelled')
      .maybeSingle();
    if (existing) {
      throw new Error('Duplicate posting: journal already exists for this source record.');
    }
  }

  const journalNumber = await generateJournalNumber();

  const { data: jeData, error: jeErr } = await supabase
    .from('journal_entries')
    .insert({
      hotel_id: hotelId,
      journal_number: journalNumber,
      business_date: input.business_date,
      posting_date: today(),
      reference_type: input.reference_type ?? 'manual',
      reference_id: input.reference_id ?? '',
      narration: input.narration,
      status: 'posted',
      source_record_id: input.source_record_id ?? null,
      created_by: input.created_by ?? '',
    })
    .select('*')
    .single();
  if (jeErr) throw jeErr;
  const je = jeData as JournalEntry;

  // Insert lines
  const lineRows = input.lines.map((l) => ({
    journal_id: je.id,
    hotel_id: hotelId,
    account_id: l.account_id,
    account_code: l.account_code,
    account_name: l.account_name,
    debit: toNum(l.debit),
    credit: toNum(l.credit),
    narration: l.narration ?? input.narration,
  }));
  const { error: lineErr } = await supabase.from('journal_lines').insert(lineRows);
  if (lineErr) throw lineErr;

  return je;
};

export const getJournalEntries = async (
  fromDate: string, toDate: string, status?: JournalStatus,
): Promise<JournalEntry[]> => {
  let q = supabase
    .from('journal_entries')
    .select('*')
    .eq('hotel_id', getCurrentHotelId())
    .gte('business_date', fromDate)
    .lte('business_date', toDate)
    .order('business_date', { ascending: false });
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw error;
  return (data as JournalEntry[]) ?? [];
};

export const getJournalLines = async (journalId: string): Promise<JournalLine[]> => {
  const { data, error } = await supabase
    .from('journal_lines')
    .select('*')
    .eq('journal_id', journalId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data as JournalLine[]) ?? [];
};

export const reverseJournal = async (journalId: string, reason: string, performedBy: string): Promise<JournalEntry> => {
  const hotelId = getCurrentHotelId();

  // Fetch original
  const { data: original, error: fetchErr } = await supabase
    .from('journal_entries')
    .select('*')
    .eq('id', journalId)
    .maybeSingle();
  if (fetchErr) throw fetchErr;
  if (!original) throw new Error('Journal not found.');
  const orig = original as JournalEntry;
  if (orig.status !== 'posted') throw new Error('Only posted journals can be reversed.');

  // Fetch lines
  const lines = await getJournalLines(journalId);

  // Create reversal journal (swap debit/credit)
  const reversalNumber = await generateJournalNumber();
  const { data: revData, error: revErr } = await supabase
    .from('journal_entries')
    .insert({
      hotel_id: hotelId,
      journal_number: reversalNumber,
      business_date: today(),
      posting_date: today(),
      reference_type: 'reversal',
      reference_id: orig.journal_number,
      narration: `Reversal of ${orig.journal_number}: ${reason}`,
      status: 'posted',
      created_by: performedBy,
      reversal_of: journalId,
    })
    .select('*')
    .single();
  if (revErr) throw revErr;
  const rev = revData as JournalEntry;

  // Insert reversed lines
  const revLines = lines.map((l) => ({
    journal_id: rev.id,
    hotel_id: hotelId,
    account_id: l.account_id,
    account_code: l.account_code,
    account_name: l.account_name,
    debit: l.credit,
    credit: l.debit,
    narration: `Reversal: ${l.narration}`,
  }));
  const { error: lineErr } = await supabase.from('journal_lines').insert(revLines);
  if (lineErr) throw lineErr;

  // Mark original as reversed
  await supabase.from('journal_entries').update({ status: 'reversed' }).eq('id', journalId);

  return rev;
};

// ── Vouchers ──

const generateVoucherNumber = async (type: VoucherType): Promise<string> => {
  const hotelId = getCurrentHotelId();
  const fy = getFinancialYear(today());
  const prefix = VOUCHER_TYPE_PREFIXES[type];
  const { count } = await supabase.from('vouchers').select('id', { count: 'exact', head: true }).eq('hotel_id', hotelId).eq('voucher_type', type);
  const seq = String((count ?? 0) + 1).padStart(6, '0');
  return `${prefix}/${fy}/${seq}`;
};

export const saveVoucher = async (input: VoucherInput): Promise<Voucher> => {
  const hotelId = getCurrentHotelId();
  const voucherNumber = await generateVoucherNumber(input.voucher_type);

  const { data, error } = await supabase
    .from('vouchers')
    .insert({
      ...input,
      hotel_id: hotelId,
      voucher_number: voucherNumber,
      status: 'posted',
    })
    .select('*')
    .single();
  if (error) throw error;

  // Auto-post journal entry for the voucher
  const accounts = await getChartOfAccounts();
  if (input.debit_account_id && input.credit_account_id) {
    const drAcct = accounts.find((a) => a.id === input.debit_account_id);
    const crAcct = accounts.find((a) => a.id === input.credit_account_id);
    if (drAcct && crAcct) {
      await postJournal({
        business_date: input.voucher_date,
        narration: input.narration ?? `${VOUCHER_TYPE_PREFIXES[input.voucher_type]} ${voucherNumber}`,
        reference_type: 'voucher',
        reference_id: voucherNumber,
        source_record_id: `voucher_${(data as Voucher).id}`,
        created_by: input.created_by,
        lines: [
          { account_id: drAcct.id, account_code: drAcct.account_code, account_name: drAcct.account_name, debit: input.amount, credit: 0 },
          { account_id: crAcct.id, account_code: crAcct.account_code, account_name: crAcct.account_name, debit: 0, credit: input.amount },
        ],
      });
    }
  }

  return data as Voucher;
};

export const getVouchers = async (
  fromDate: string, toDate: string, type?: VoucherType,
): Promise<Voucher[]> => {
  let q = supabase
    .from('vouchers')
    .select('*')
    .eq('hotel_id', getCurrentHotelId())
    .gte('voucher_date', fromDate)
    .lte('voucher_date', toDate)
    .order('voucher_date', { ascending: false });
  if (type) q = q.eq('voucher_type', type);
  const { data, error } = await q;
  if (error) throw error;
  return (data as Voucher[]) ?? [];
};

// ── Vendors ──

export const getVendors = async (includeInactive = false): Promise<Vendor[]> => {
  let q = supabase.from('vendors').select('*').eq('hotel_id', getCurrentHotelId()).order('vendor_name', { ascending: true });
  if (!includeInactive) q = q.eq('is_active', true);
  const { data, error } = await q;
  if (error) throw error;
  return (data as Vendor[]) ?? [];
};

export const saveVendor = async (input: VendorInput, id?: string): Promise<Vendor> => {
  const payload = { ...input, hotel_id: getCurrentHotelId() };
  if (id) {
    const { data, error } = await supabase.from('vendors').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', id).select('*').single();
    if (error) throw error;
    return data as Vendor;
  }
  const { data, error } = await supabase.from('vendors').insert(payload).select('*').single();
  if (error) throw error;
  return data as Vendor;
};

// ── Opening Balances ──

export const getOpeningBalances = async (): Promise<OpeningBalance[]> => {
  const { data, error } = await supabase
    .from('opening_balances')
    .select('*')
    .eq('hotel_id', getCurrentHotelId())
    .order('effective_date', { ascending: false });
  if (error) throw error;
  return (data as OpeningBalance[]) ?? [];
};

export const saveOpeningBalance = async (input: Omit<OpeningBalance, 'id' | 'hotel_id' | 'created_at'>): Promise<OpeningBalance> => {
  const { data, error } = await supabase
    .from('opening_balances')
    .insert({ ...input, hotel_id: getCurrentHotelId() })
    .select('*')
    .single();
  if (error) throw error;
  return data as OpeningBalance;
};

export const postOpeningBalances = async (performedBy: string): Promise<void> => {
  const hotelId = getCurrentHotelId();
  const { data: drafts, error } = await supabase
    .from('opening_balances')
    .select('*')
    .eq('hotel_id', hotelId)
    .eq('status', 'draft');
  if (error) throw error;
  if (!drafts || drafts.length === 0) return;

  const accounts = await getChartOfAccounts();
  const lines = (drafts as OpeningBalance[]).map((ob) => {
    const acct = accounts.find((a) => a.id === ob.account_id);
    if (!acct) return null;
    return {
      account_id: acct.id,
      account_code: acct.account_code,
      account_name: acct.account_name,
      debit: toNum(ob.debit),
      credit: toNum(ob.credit),
      narration: ob.narration,
    };
  }).filter((l): l is NonNullable<typeof l> => l !== null);

  if (lines.length === 0) return;

  const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
  if (totalDebit !== totalCredit) {
    throw new Error(`Opening balances not balanced. Debit: ${totalDebit}, Credit: ${totalCredit}`);
  }

  await postJournal({
    business_date: (drafts[0] as OpeningBalance).effective_date,
    narration: 'Opening Balance Entry',
    reference_type: 'opening_balance',
    source_record_id: 'opening_balance',
    created_by: performedBy,
    lines,
  });

  // Mark all as posted
  await supabase.from('opening_balances').update({ status: 'posted', approved_by: performedBy }).eq('hotel_id', hotelId).eq('status', 'draft');
};

// ── Budgets ──

export const getBudgets = async (monthKey?: string): Promise<Budget[]> => {
  let q = supabase.from('budgets').select('*').eq('hotel_id', getCurrentHotelId()).order('month_key', { ascending: false });
  if (monthKey) q = q.eq('month_key', monthKey);
  const { data, error } = await q;
  if (error) throw error;
  return (data as Budget[]) ?? [];
};

export const saveBudget = async (monthKey: string, category: string, amount: number): Promise<Budget> => {
  const { data, error } = await supabase
    .from('budgets')
    .upsert({ hotel_id: getCurrentHotelId(), month_key: monthKey, category, amount }, { onConflict: 'hotel_id,month_key,category' })
    .select('*')
    .single();
  if (error) throw error;
  return data as Budget;
};

// ── Bank Reconciliation ──

export const getBankReconciliations = async (): Promise<BankReconciliation[]> => {
  const { data, error } = await supabase
    .from('bank_reconciliation')
    .select('*')
    .eq('hotel_id', getCurrentHotelId())
    .order('reconciliation_date', { ascending: false });
  if (error) throw error;
  return (data as BankReconciliation[]) ?? [];
};

export const saveBankReconciliation = async (input: Omit<BankReconciliation, 'id' | 'hotel_id' | 'created_at'>): Promise<BankReconciliation> => {
  const { data, error } = await supabase
    .from('bank_reconciliation')
    .insert({ ...input, hotel_id: getCurrentHotelId() })
    .select('*')
    .single();
  if (error) throw error;
  return data as BankReconciliation;
};

// ── Posting Rules ──

export const getPostingRules = async (): Promise<PostingRule[]> => {
  const { data, error } = await supabase
    .from('posting_rules')
    .select('*')
    .eq('hotel_id', getCurrentHotelId())
    .order('mapping_type', { ascending: true });
  if (error) throw error;
  return (data as PostingRule[]) ?? [];
};

export const savePostingRule = async (input: Omit<PostingRule, 'id' | 'hotel_id' | 'created_at'>): Promise<PostingRule> => {
  const { data, error } = await supabase
    .from('posting_rules')
    .upsert({ ...input, hotel_id: getCurrentHotelId() }, { onConflict: 'hotel_id,mapping_type,source_value' })
    .select('*')
    .single();
  if (error) throw error;
  return data as PostingRule;
};

export const deletePostingRule = async (id: string): Promise<void> => {
  const { error } = await supabase.from('posting_rules').delete().eq('id', id);
  if (error) throw error;
};

// Helper: resolve posting rule
export const resolvePostingRule = async (mappingType: MappingType, sourceValue: string): Promise<{ debitAccountId: string; creditAccountId: string } | null> => {
  const { data, error } = await supabase
    .from('posting_rules')
    .select('debit_account_id, credit_account_id')
    .eq('hotel_id', getCurrentHotelId())
    .eq('mapping_type', mappingType)
    .eq('source_value', sourceValue)
    .eq('is_active', true)
    .maybeSingle();
  if (error || !data) return null;
  return { debitAccountId: (data as { debit_account_id: string }).debit_account_id, creditAccountId: (data as { credit_account_id: string }).credit_account_id };
};

// ── Finance Exceptions ──

export const getFinanceExceptions = async (status?: ExceptionStatus): Promise<FinanceException[]> => {
  let q = supabase
    .from('finance_exceptions')
    .select('*')
    .eq('hotel_id', getCurrentHotelId())
    .order('created_at', { ascending: false });
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw error;
  return (data as FinanceException[]) ?? [];
};

export const createFinanceException = async (input: Omit<FinanceException, 'id' | 'hotel_id' | 'created_at'>): Promise<FinanceException> => {
  const { data, error } = await supabase
    .from('finance_exceptions')
    .insert({ ...input, hotel_id: getCurrentHotelId() })
    .select('*')
    .single();
  if (error) throw error;
  return data as FinanceException;
};

export const resolveFinanceException = async (id: string, resolvedBy: string, notes: string): Promise<void> => {
  const { error } = await supabase
    .from('finance_exceptions')
    .update({ status: 'resolved', resolved_by: resolvedBy, resolved_at: new Date().toISOString(), resolution_notes: notes })
    .eq('id', id);
  if (error) throw error;
};

// ── OTA Settlements ──

export const getOTASettlements = async (matchStatus?: string): Promise<OTASettlement[]> => {
  let q = supabase
    .from('ota_settlements')
    .select('*')
    .eq('hotel_id', getCurrentHotelId())
    .order('created_at', { ascending: false });
  if (matchStatus) q = q.eq('match_status', matchStatus);
  const { data, error } = await q;
  if (error) throw error;
  return (data as OTASettlement[]) ?? [];
};

export const saveOTASettlement = async (input: OTASettlementInput): Promise<OTASettlement> => {
  const netExpected = toNum(input.gross_amount) - toNum(input.commission_amount) - toNum(input.tcs_tds_amount) - toNum(input.gateway_charges);
  const difference = toNum(input.actual_settled) - netExpected;
  let matchStatus: OTASettlement['match_status'] = 'unmatched';
  if (toNum(input.actual_settled) === 0) matchStatus = 'unmatched';
  else if (difference === 0) matchStatus = 'matched';
  else if (difference < 0) matchStatus = 'short';
  else matchStatus = 'excess';

  const { data, error } = await supabase
    .from('ota_settlements')
    .insert({ ...input, hotel_id: getCurrentHotelId(), net_expected: netExpected, difference, match_status: matchStatus })
    .select('*')
    .single();
  if (error) throw error;
  return data as OTASettlement;
};

export const deleteOTASettlement = async (id: string): Promise<void> => {
  const { error } = await supabase.from('ota_settlements').delete().eq('id', id);
  if (error) throw error;
};

// ── Auto-Posting Engine: Post from existing transactions ──

export const postRoomPayment = async (params: {
  entryId: string;
  guestName: string;
  roomNo: string;
  amount: number;
  paymentMode: string;
  businessDate: string;
  gstAmount?: number;
  revenueAmount?: number;
  performedBy?: string;
}): Promise<JournalEntry | null> => {
  const accounts = await getChartOfAccounts();
  if (accounts.length === 0) {
    await createFinanceException({
      exception_type: 'missing_opening_balance',
      description: 'Chart of Accounts not seeded. Cannot post room payment.',
      source_type: 'room_payment',
      source_id: params.entryId,
      amount: params.amount,
      status: 'open',
      resolved_by: null,
      resolved_at: null,
      resolution_notes: '',
    });
    return null;
  }

  // Determine debit account based on payment mode
  let debitAccount: ChartOfAccount | undefined;
  if (params.paymentMode === 'Cash') debitAccount = findAccountByCode(accounts, '1001');
  else if (params.paymentMode === 'Bank') debitAccount = findAccountByCode(accounts, '1002');
  else if (params.paymentMode === 'UPI') debitAccount = findAccountByCode(accounts, '1003');
  else if (params.paymentMode === 'Credit') debitAccount = findAccountByCode(accounts, '1007');

  if (!debitAccount) {
    await createFinanceException({
      exception_type: 'missing_payment_account',
      description: `No account mapped for payment mode: ${params.paymentMode}`,
      source_type: 'room_payment',
      source_id: params.entryId,
      amount: params.amount,
      status: 'open',
      resolved_by: null,
      resolved_at: null,
      resolution_notes: '',
    });
    return null;
  }

  const revenueAccount = findAccountByCode(accounts, '3001'); // Room Revenue
  const gstAccount = findAccountByCode(accounts, '2003'); // GST Payable

  if (!revenueAccount) {
    await createFinanceException({
      exception_type: 'unmapped_revenue',
      description: 'Room Revenue account not found in Chart of Accounts.',
      source_type: 'room_payment',
      source_id: params.entryId,
      amount: params.revenueAmount ?? params.amount,
      status: 'open',
      resolved_by: null,
      resolved_at: null,
      resolution_notes: '',
    });
    return null;
  }

  const lines: JournalInput['lines'] = [
    { account_id: debitAccount.id, account_code: debitAccount.account_code, account_name: debitAccount.account_name, debit: params.amount, credit: 0 },
  ];

  const revenue = params.revenueAmount ?? params.amount;
  const gst = params.gstAmount ?? 0;

  lines.push({ account_id: revenueAccount.id, account_code: revenueAccount.account_code, account_name: revenueAccount.account_name, debit: 0, credit: revenue - gst });

  if (gst > 0 && gstAccount) {
    lines.push({ account_id: gstAccount.id, account_code: gstAccount.account_code, account_name: gstAccount.account_name, debit: 0, credit: gst });
  }

  return postJournal({
    business_date: params.businessDate,
    narration: `Room payment: ${params.guestName} Room ${params.roomNo} (${params.paymentMode})`,
    reference_type: 'room_payment',
    reference_id: params.entryId,
    source_record_id: `room_payment_${params.entryId}`,
    created_by: params.performedBy ?? 'system',
    lines,
  });
};

export const postExpense = async (params: {
  expenseId: string;
  category: string;
  amount: number;
  paymentMode: string;
  businessDate: string;
  description?: string;
  performedBy?: string;
}): Promise<JournalEntry | null> => {
  const accounts = await getChartOfAccounts();
  if (accounts.length === 0) return null;

  // Determine credit account (cash/bank)
  let creditAccount: ChartOfAccount | undefined;
  if (params.paymentMode === 'Cash') creditAccount = findAccountByCode(accounts, '1001');
  else if (params.paymentMode === 'Bank') creditAccount = findAccountByCode(accounts, '1002');
  else if (params.paymentMode === 'UPI') creditAccount = findAccountByCode(accounts, '1003');
  else creditAccount = findAccountByCode(accounts, '2001'); // Vendor Payable for credit

  if (!creditAccount) return null;

  // Try to find matching expense account by name
  let expenseAccount = accounts.find((a) => a.account_name.toLowerCase() === params.category.toLowerCase() && a.account_group === 'EXPENSES');
  if (!expenseAccount) expenseAccount = findAccountByCode(accounts, '4017'); // Other Expense
  if (!expenseAccount) return null;

  return postJournal({
    business_date: params.businessDate,
    narration: `Expense: ${params.category} — ${params.description ?? ''}`,
    reference_type: 'expense',
    reference_id: params.expenseId,
    source_record_id: `expense_${params.expenseId}`,
    created_by: params.performedBy ?? 'system',
    lines: [
      { account_id: expenseAccount.id, account_code: expenseAccount.account_code, account_name: expenseAccount.account_name, debit: params.amount, credit: 0 },
      { account_id: creditAccount.id, account_code: creditAccount.account_code, account_name: creditAccount.account_name, debit: 0, credit: params.amount },
    ],
  });
};

// ── Reports: Trial Balance ──

export const getTrialBalance = async (fromDate: string, toDate: string): Promise<TrialBalanceRow[]> => {
  const hotelId = getCurrentHotelId();
  const accounts = await getChartOfAccounts(true);

  // Get all journal lines in range
  const { data: lines, error } = await supabase
    .from('journal_lines')
    .select('account_id, debit, credit, journal_id, journal_entries!inner(business_date, status)')
    .eq('hotel_id', hotelId)
    .gte('journal_entries.business_date', fromDate)
    .lte('journal_entries.business_date', toDate)
    .neq('journal_entries.status', 'cancelled');
  if (error) throw error;

  // Get opening balances
  const { data: openings } = await supabase
    .from('journal_lines')
    .select('account_id, debit, credit, journal_entries!inner(business_date, status)')
    .eq('hotel_id', hotelId)
    .lt('journal_entries.business_date', fromDate)
    .neq('journal_entries.status', 'cancelled');

  const openingMap = new Map<string, { debit: number; credit: number }>();
  for (const l of (openings ?? []) as unknown as Array<{ account_id: string; debit: number; credit: number }>) {
    const cur = openingMap.get(l.account_id) ?? { debit: 0, credit: 0 };
    cur.debit += toNum(l.debit);
    cur.credit += toNum(l.credit);
    openingMap.set(l.account_id, cur);
  }

  const periodMap = new Map<string, { debit: number; credit: number }>();
  for (const l of (lines ?? []) as unknown as Array<{ account_id: string; debit: number; credit: number }>) {
    const cur = periodMap.get(l.account_id) ?? { debit: 0, credit: 0 };
    cur.debit += toNum(l.debit);
    cur.credit += toNum(l.credit);
    periodMap.set(l.account_id, cur);
  }

  return accounts.map((acct) => {
    const opening = openingMap.get(acct.id) ?? { debit: 0, credit: 0 };
    const period = periodMap.get(acct.id) ?? { debit: 0, credit: 0 };
    const netOpening = opening.debit - opening.credit;
    const netPeriod = period.debit - period.credit;
    const netClosing = netOpening + netPeriod;
    return {
      account_id: acct.id,
      account_code: acct.account_code,
      account_name: acct.account_name,
      account_group: acct.account_group,
      opening_debit: netOpening > 0 ? netOpening : 0,
      opening_credit: netOpening < 0 ? -netOpening : 0,
      period_debit: period.debit,
      period_credit: period.credit,
      closing_debit: netClosing > 0 ? netClosing : 0,
      closing_credit: netClosing < 0 ? -netClosing : 0,
    };
  }).filter((r) => r.opening_debit > 0 || r.opening_credit > 0 || r.period_debit > 0 || r.period_credit > 0 || r.closing_debit > 0 || r.closing_credit > 0);
};

// ── Reports: Profit & Loss ──

export const getProfitLoss = async (fromDate: string, toDate: string): Promise<ProfitLoss> => {
  const tb = await getTrialBalance(fromDate, toDate);

  const revenue: PLSection[] = tb
    .filter((r) => r.account_group === 'INCOME')
    .map((r) => ({ account_name: r.account_name, amount: r.period_credit - r.period_debit }))
    .filter((r) => r.amount !== 0)
    .sort((a, b) => b.amount - a.amount);

  const allExpenses = tb
    .filter((r) => r.account_group === 'EXPENSES')
    .map((r) => ({ account_name: r.account_name, amount: r.period_debit - r.period_credit, subgroup: '' }))
    .filter((r) => r.amount !== 0);

  const directKeywords = ['Housekeeping', 'Kitchen', 'Laundry', 'OTA Commission', 'Travel Agent Commission'];
  const directExpenses = allExpenses.filter((e) => directKeywords.some((k) => e.account_name.includes(k)));
  const operatingExpenses = allExpenses.filter((e) => !directKeywords.some((k) => e.account_name.includes(k)));

  const totalRevenue = revenue.reduce((s, r) => s + r.amount, 0);
  const totalDirectExpenses = directExpenses.reduce((s, e) => s + e.amount, 0);
  const totalOperatingExpenses = operatingExpenses.reduce((s, e) => s + e.amount, 0);
  const grossOperatingProfit = totalRevenue - totalDirectExpenses;
  const netOperatingProfit = grossOperatingProfit - totalOperatingExpenses;

  return {
    revenue,
    totalRevenue,
    directExpenses,
    totalDirectExpenses,
    grossOperatingProfit,
    operatingExpenses,
    totalOperatingExpenses,
    netOperatingProfit,
  };
};

// ── Reports: Balance Sheet ──

export const getBalanceSheet = async (asOfDate: string): Promise<BalanceSheet> => {
  const tb = await getTrialBalance('1900-01-01', asOfDate);
  const accounts = await getChartOfAccounts(true);

  const assetRows = tb.filter((r) => r.account_group === 'ASSETS');
  const liabilityRows = tb.filter((r) => r.account_group === 'LIABILITIES');
  const equityRows = tb.filter((r) => r.account_group === 'EQUITY');

  const groupBySubgroup = (rows: TrialBalanceRow[]) => {
    const map = new Map<string, BalanceSheetRow[]>();
    for (const r of rows) {
      const acct = accounts.find((a: ChartOfAccount) => a.id === r.account_id);
      const subgroup = acct?.account_subgroup ?? 'Other';
      if (!map.has(subgroup)) map.set(subgroup, []);
      map.get(subgroup)!.push({ account_code: r.account_code, account_name: r.account_name, amount: r.closing_debit - r.closing_credit });
    }
    return Array.from(map.entries()).map(([subgroup, rs]) => ({
      subgroup,
      rows: rs,
      subtotal: rs.reduce((s, r) => s + r.amount, 0),
    }));
  };

  const assetGroups = groupBySubgroup(assetRows);
  const liabilityGroups = groupBySubgroup(liabilityRows);
  const equityGroups = groupBySubgroup(equityRows);

  const totalAssets = assetGroups.reduce((s, g) => s + g.subtotal, 0);
  const totalLiabilities = liabilityGroups.reduce((s, g) => s + g.subtotal, 0);
  const totalEquity = equityGroups.reduce((s, g) => s + g.subtotal, 0);

  const pl = await getProfitLoss('1900-01-01', asOfDate);
  const currentPeriodProfit = pl.netOperatingProfit;

  const isBalanced = Math.abs((totalAssets) - (totalLiabilities + totalEquity + currentPeriodProfit)) < 1;

  const openingBalancesConfigured = await (async () => {
    const { count } = await supabase.from('opening_balances').select('id', { count: 'exact', head: true }).eq('hotel_id', getCurrentHotelId()).eq('status', 'posted');
    return (count ?? 0) > 0;
  })();

  return {
    assets: assetGroups,
    totalAssets,
    liabilities: liabilityGroups,
    totalLiabilities,
    equity: equityGroups,
    totalEquity,
    currentPeriodProfit,
    isBalanced,
    openingBalancesConfigured,
  };
};

// ── Reports: General Ledger ──

export const getGeneralLedger = async (accountId: string, fromDate: string, toDate: string): Promise<LedgerEntry[]> => {
  const hotelId = getCurrentHotelId();
  const { data, error } = await supabase
    .from('journal_lines')
    .select('debit, credit, narration, journal_entries!inner(journal_number, business_date, reference_id, status)')
    .eq('hotel_id', hotelId)
    .eq('account_id', accountId)
    .gte('journal_entries.business_date', fromDate)
    .lte('journal_entries.business_date', toDate)
    .neq('journal_entries.status', 'cancelled')
    .order('created_at', { ascending: true });
  if (error) throw error;

  let balance = 0;
  return ((data ?? []) as unknown as Array<{
    debit: number; credit: number; narration: string;
    journal_entries: { journal_number: string; business_date: string; reference_id: string };
  }>).map((l) => {
    balance += toNum(l.debit) - toNum(l.credit);
    return {
      date: l.journal_entries.business_date,
      voucher_number: l.journal_entries.journal_number,
      particulars: l.narration,
      reference: l.journal_entries.reference_id,
      debit: toNum(l.debit),
      credit: toNum(l.credit),
      balance,
    };
  });
};

// ── Reports: Cash Book ──

export const getCashBook = async (fromDate: string, toDate: string): Promise<LedgerEntry[]> => {
  const hotelId = getCurrentHotelId();
  const cashAccount = (await getChartOfAccounts()).find((a) => a.account_code === '1001');
  if (!cashAccount) return [];
  return getGeneralLedger(cashAccount.id, fromDate, toDate);
};

// ── Reports: Bank Book ──

export const getBankBook = async (fromDate: string, toDate: string): Promise<LedgerEntry[]> => {
  const hotelId = getCurrentHotelId();
  const bankAccount = (await getChartOfAccounts()).find((a) => a.account_code === '1002');
  if (!bankAccount) return [];
  return getGeneralLedger(bankAccount.id, fromDate, toDate);
};

// ── Finance Dashboard KPIs ──

export interface FinanceDashboardKPIs {
  todayCollection: number;
  todayCashCollection: number;
  todayBankCollection: number;
  todayExpenses: number;
  cashClosing: number;
  totalReceivables: number;
  totalPayables: number;
  mtdRevenue: number;
  mtdExpenses: number;
  mtdOperatingProfit: number;
  outstandingOTA: number;
  outstandingCorporate: number;
}

export const getFinanceKPIs = async (): Promise<FinanceDashboardKPIs> => {
  const hotelId = getCurrentHotelId();
  const t = today();
  const monthStart = t.slice(0, 8) + '01';

  // Get journal lines for today and MTD
  const { data: todayLines } = await supabase
    .from('journal_lines')
    .select('account_id, account_code, debit, credit, journal_entries!inner(business_date, status)')
    .eq('hotel_id', hotelId)
    .eq('journal_entries.business_date', t)
    .neq('journal_entries.status', 'cancelled');

  const { data: mtdLines } = await supabase
    .from('journal_lines')
    .select('account_id, account_code, debit, credit, journal_entries!inner(business_date, status)')
    .eq('hotel_id', hotelId)
    .gte('journal_entries.business_date', monthStart)
    .lte('journal_entries.business_date', t)
    .neq('journal_entries.status', 'cancelled');

  const accounts = await getChartOfAccounts(true);
  const cashAcct = accounts.find((a) => a.account_code === '1001');
  const bankAcct = accounts.find((a) => a.account_code === '1002');
  const upiAcct = accounts.find((a) => a.account_code === '1003');

  let todayCashCollection = 0, todayBankCollection = 0;
  for (const l of (todayLines ?? []) as unknown as Array<{ account_id: string; debit: number; credit: number }>) {
    if (cashAcct && l.account_id === cashAcct.id) todayCashCollection += toNum(l.debit) - toNum(l.credit);
    if ((bankAcct && l.account_id === bankAcct.id) || (upiAcct && l.account_id === upiAcct.id)) todayBankCollection += toNum(l.debit) - toNum(l.credit);
  }

  let todayExpenses = 0;
  for (const l of (todayLines ?? []) as unknown as Array<{ account_id: string; debit: number; credit: number }>) {
    const acct = accounts.find((a) => a.id === l.account_id);
    if (acct?.account_group === 'EXPENSES') todayExpenses += toNum(l.debit) - toNum(l.credit);
  }

  // Cash closing = cumulative cash balance
  let cashClosing = 0;
  const { data: allCashLines } = await supabase
    .from('journal_lines')
    .select('debit, credit, account_id, journal_entries!inner(status)')
    .eq('hotel_id', hotelId)
    .neq('journal_entries.status', 'cancelled');
  for (const l of (allCashLines ?? []) as unknown as Array<{ account_id: string; debit: number; credit: number }>) {
    if (cashAcct && l.account_id === cashAcct.id) cashClosing += toNum(l.debit) - toNum(l.credit);
  }

  // MTD revenue and expenses
  let mtdRevenue = 0, mtdExpenses = 0;
  for (const l of (mtdLines ?? []) as unknown as Array<{ account_id: string; debit: number; credit: number }>) {
    const acct = accounts.find((a) => a.id === l.account_id);
    if (acct?.account_group === 'INCOME') mtdRevenue += toNum(l.credit) - toNum(l.debit);
    if (acct?.account_group === 'EXPENSES') mtdExpenses += toNum(l.debit) - toNum(l.credit);
  }

  // Receivables and payables from account balances
  let totalReceivables = 0, totalPayables = 0, outstandingOTA = 0, outstandingCorporate = 0;
  for (const l of (allCashLines ?? []) as unknown as Array<{ account_id: string; debit: number; credit: number }>) {
    const acct = accounts.find((a) => a.id === l.account_id);
    if (!acct) continue;
    const balance = toNum(l.debit) - toNum(l.credit);
    if (acct.account_code === '1004') outstandingOTA += balance;
    if (acct.account_code === '1005') outstandingCorporate += balance;
    if (acct.account_group === 'ASSETS' && ['1004', '1005', '1006', '1007'].includes(acct.account_code)) totalReceivables += balance;
    if (acct.account_group === 'LIABILITIES' && ['2001', '2002', '2003', '2004'].includes(acct.account_code)) totalPayables += -balance;
  }

  return {
    todayCollection: todayCashCollection + todayBankCollection,
    todayCashCollection,
    todayBankCollection,
    todayExpenses,
    cashClosing,
    totalReceivables,
    totalPayables,
    mtdRevenue,
    mtdExpenses,
    mtdOperatingProfit: mtdRevenue - mtdExpenses,
    outstandingOTA,
    outstandingCorporate,
  };
};

// ── Historical Posting Utility ──

export interface HistoricalPostingPreview {
  roomPayments: number;
  expenses: number;
  totalRecords: number;
  alreadyPosted: number;
  toPost: number;
  dateRange: { from: string; to: string };
}

export const previewHistoricalPosting = async (fromDate: string, toDate: string): Promise<HistoricalPostingPreview> => {
  const hotelId = getCurrentHotelId();

  // Count room_chart_entries with payments in range
  const { count: roomCount } = await supabase
    .from('room_chart_entries')
    .select('id', { count: 'exact', head: true })
    .eq('hotel_id', hotelId)
    .gte('report_date', fromDate)
    .lte('report_date', toDate);

  // Count expense entries in range
  const { count: expenseCount } = await supabase
    .from('expense_entries')
    .select('id', { count: 'exact', head: true })
    .eq('hotel_id', hotelId)
    .gte('entry_date', fromDate)
    .lte('entry_date', toDate);

  // Count already posted journals
  const { count: postedCount } = await supabase
    .from('journal_entries')
    .select('id', { count: 'exact', head: true })
    .eq('hotel_id', hotelId)
    .in('reference_type', ['room_payment', 'expense'])
    .neq('status', 'cancelled');

  const totalRecords = (roomCount ?? 0) + (expenseCount ?? 0);
  const alreadyPosted = postedCount ?? 0;
  const toPost = Math.max(0, totalRecords - alreadyPosted);

  return {
    roomPayments: roomCount ?? 0,
    expenses: expenseCount ?? 0,
    totalRecords,
    alreadyPosted,
    toPost,
    dateRange: { from: fromDate, to: toDate },
  };
};

export const runHistoricalPosting = async (fromDate: string, toDate: string, performedBy: string): Promise<{ posted: number; skipped: number; errors: number }> => {
  const hotelId = getCurrentHotelId();
  let posted = 0, skipped = 0, errors = 0;

  // Post room payments
  const { data: entries } = await supabase
    .from('room_chart_entries')
    .select('*')
    .eq('hotel_id', hotelId)
    .gte('report_date', fromDate)
    .lte('report_date', toDate)
    .order('report_date', { ascending: true });

  for (const entry of (entries ?? []) as Array<Record<string, unknown>>) {
    try {
      const totalPay = toNum(entry.pay_cash as number) + toNum(entry.pay_upi as number) + toNum(entry.pay_card as number) + toNum(entry.pay_bank as number);
      if (totalPay <= 0) { skipped++; continue; }

      // Determine primary payment mode
      let paymentMode = 'Cash';
      if (toNum(entry.pay_upi as number) > 0) paymentMode = 'UPI';
      else if (toNum(entry.pay_bank as number) > 0) paymentMode = 'Bank';
      else if (toNum(entry.pay_card as number) > 0) paymentMode = 'Bank';

      await postRoomPayment({
        entryId: entry.id as string,
        guestName: (entry.guest_name as string) ?? 'Guest',
        roomNo: (entry.room_no as string) ?? '',
        amount: totalPay,
        paymentMode,
        businessDate: (entry.report_date as string) ?? today(),
        gstAmount: toNum(entry.gst_amount as number),
        revenueAmount: toNum(entry.total as number),
        performedBy,
      });
      posted++;
    } catch {
      errors++;
    }
  }

  // Post expenses
  const { data: expenses } = await supabase
    .from('expense_entries')
    .select('*')
    .eq('hotel_id', hotelId)
    .gte('entry_date', fromDate)
    .lte('entry_date', toDate)
    .order('entry_date', { ascending: true });

  for (const exp of (expenses ?? []) as Array<Record<string, unknown>>) {
    try {
      await postExpense({
        expenseId: exp.id as string,
        category: (exp.category_name as string) ?? 'Other Expense',
        amount: toNum(exp.amount as number),
        paymentMode: (exp.payment_mode as string) ?? 'Cash',
        businessDate: (exp.entry_date as string) ?? today(),
        description: (exp.description as string) ?? '',
        performedBy,
      });
      posted++;
    } catch {
      errors++;
    }
  }

  return { posted, skipped, errors };
};

void today;
