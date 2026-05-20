import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Archive, Bell, Camera, Download, ExternalLink, Home, LogOut, Mail, PieChart as PieIcon, Plus, ReceiptText, Save, Search, Sparkles, Trash2, UserPlus, Users, WalletCards } from 'lucide-react';
import { api, clearAuthToken, downloadCsv, fmt, hasAuthToken, setAuthToken } from './api';
import './style.css';

type User = { id: string; name: string; email: string; defaultCurrency: string };
type Group = { id: string; name: string; type: string; currency: string; simplifyDebts: boolean; members: { user: User; role: string }[]; _count?: { expenses: number } };
type Expense = { id: string; groupId?: string; title: string; category: string; description?: string; total: number; currency: string; splitKind: string; date: string; group?: Group; payers: any[]; splits: any[] };
type Balance = { from: string; to: string; amount: number; currency: string };
type Settlement = { id: string; amount: number; currency: string; note?: string; date: string; fromUser: User; toUser: User; group?: Group };
type ReceiptArchive = { id: string; groupId: string; expenseId?: string; imageDataUrl: string; fileName?: string; mimeType: string; note?: string; createdAt: string; uploader?: User; group?: Group; expense?: Pick<Expense, 'id' | 'title' | 'total' | 'currency' | 'date'> };
type Tab = 'dashboard' | 'expenses' | 'groups' | 'insights';
type AuthMode = 'login' | 'register';

const COLORS = ['#6366f1', '#22c55e', '#f97316', '#06b6d4', '#ec4899', '#eab308', '#8b5cf6', '#14b8a6'];
const CATEGORIES = [
  ['general', 'Altro'], ['food', 'Cibo'], ['transport', 'Trasporti'], ['home', 'Casa'], ['travel', 'Viaggi'], ['shopping', 'Shopping'], ['health', 'Salute'], ['fun', 'Svago']
] as const;

function AuthScreen({ onLogin }: { onLogin: () => void }) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const auth = useMutation({
    mutationFn: (payload: any) => api<{ token: string; user: User }>(mode === 'login' ? '/auth/login' : '/auth/register', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: data => { setAuthToken(data.token); onLogin(); }
  });
  function submit(e: React.FormEvent) {
    e.preventDefault();
    auth.mutate(mode === 'login' ? { email, password } : { name, email, password });
  }
  return <main className="auth-shell">
    <section className="auth-hero">
      <div className="orb one" /><div className="orb two" />
      <div className="brand-lockup"><div className="logo"><Sparkles size={24} /></div><span>FairSplit</span></div>
      <h1>Dividi spese senza caos.</h1>
      <p>Gruppi privati, ricerca spese, scansione scontrini, grafici colorati e saldi sempre aggiornati.</p>
      <div className="hero-pills"><span>Email + password</span><span>Tutti i tool sbloccati</span><span>Neon/Postgres ready</span></div>
    </section>
    <section className="auth-card">
      <div className="auth-switch">
        <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Accedi</button>
        <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>Crea account</button>
      </div>
      <form className="form" onSubmit={submit}>
        {mode === 'register' && <label>Nome<input value={name} onChange={e => setName(e.target.value)} placeholder="Davide" required /></label>}
        <label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@email.com" required autoFocus /></label>
        <label>Password<input type="password" minLength={8} value={password} onChange={e => setPassword(e.target.value)} placeholder="Minimo 8 caratteri" required /></label>
        <button className="primary" disabled={auth.isPending}><Mail size={16} /> {mode === 'login' ? 'Entra' : 'Crea account'}</button>
        {auth.error && <p className="error">{translateError(auth.error.message)}</p>}
      </form>
    </section>
  </main>;
}

function Shell() {
  const qc = useQueryClient();
  const [authed, setAuthed] = useState(hasAuthToken());
  if (!authed) return <AuthScreen onLogin={() => setAuthed(true)} />;
  return <App onLogout={() => { clearAuthToken(); qc.clear(); setAuthed(false); }} />;
}

function App({ onLogout }: { onLogout: () => void }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('dashboard');
  const [selectedGroup, setSelectedGroup] = useState('');
  const [search, setSearch] = useState('');
  const [groupName, setGroupName] = useState('');
  const [groupCurrency, setGroupCurrency] = useState('EUR');
  const [memberEmails, setMemberEmails] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [lookupEmail, setLookupEmail] = useState('');
  const [expenseTitle, setExpenseTitle] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [category, setCategory] = useState('general');
  const [payerId, setPayer] = useState('');
  const [splitMode, setSplitMode] = useState<'equal' | 'exact'>('equal');
  const [exactSplits, setExactSplits] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<Expense | null>(null);
  const [receiptArchiveOpen, setReceiptArchiveOpen] = useState(false);
  const [receiptNote, setReceiptNote] = useState('');
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [receiptFileName, setReceiptFileName] = useState('');
  const [receiptExpenseId, setReceiptExpenseId] = useState('');
  const [openedReceipt, setOpenedReceipt] = useState<ReceiptArchive | null>(null);
  const [notificationStatus, setNotificationStatus] = useState('');
  const [expenseFormOpen, setExpenseFormOpen] = useState(false);
  const [groupFormOpen, setGroupFormOpen] = useState(false);
  const [userSearchOpen, setUserSearchOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [liveNotice, setLiveNotice] = useState('');
  const [partialSettlements, setPartialSettlements] = useState<Record<string, string>>({});
  const seenExpenseIds = useRef<Set<string>>(new Set());
  const seenSettlementIds = useRef<Set<string>>(new Set());
  const seenReceiptIds = useRef<Set<string>>(new Set());

  const me = useQuery({ queryKey: ['me'], queryFn: () => api<User>('/me'), retry: false });
  const groups = useQuery({ queryKey: ['groups'], queryFn: () => api<Group[]>('/groups'), enabled: !!me.data, refetchInterval: 8000, refetchOnWindowFocus: true });
  const balances = useQuery({ queryKey: ['balances'], queryFn: () => api<Balance[]>('/balances'), enabled: !!me.data, refetchInterval: 8000, refetchOnWindowFocus: true });
  const allExpenses = useQuery({ queryKey: ['expenses-all'], queryFn: () => api<Expense[]>('/expenses'), enabled: !!me.data, refetchInterval: 8000, refetchOnWindowFocus: true });

  const currentGroup = groups.data?.find(g => g.id === selectedGroup) ?? groups.data?.[0];
  const groupDetail = useQuery({ queryKey: ['group', currentGroup?.id], queryFn: () => api<any>(`/groups/${currentGroup!.id}`), enabled: !!currentGroup, refetchInterval: 8000, refetchOnWindowFocus: true });
  const groupBalances = useQuery({ queryKey: ['group-balances', currentGroup?.id], queryFn: () => api<Balance[]>(`/groups/${currentGroup!.id}/balances`), enabled: !!currentGroup, refetchInterval: 8000, refetchOnWindowFocus: true });
  const searchedExpenses = useQuery({
    queryKey: ['expenses-search', currentGroup?.id, search],
    queryFn: () => api<Expense[]>(`/expenses?${new URLSearchParams({ ...(currentGroup ? { groupId: currentGroup.id } : {}), ...(search ? { q: search } : {}) }).toString()}`),
    enabled: !!me.data,
    refetchInterval: 8000,
    refetchOnWindowFocus: true
  });
  const settlements = useQuery({ queryKey: ['settlements', currentGroup?.id], queryFn: () => api<Settlement[]>(`/settlements?groupId=${currentGroup!.id}`), enabled: !!currentGroup, refetchInterval: 8000, refetchOnWindowFocus: true });
  const analytics = useQuery({ queryKey: ['analytics', currentGroup?.id], queryFn: () => api<any[]>(`/analytics${currentGroup ? `?groupId=${currentGroup.id}` : ''}`), enabled: !!me.data, refetchInterval: 12000, refetchOnWindowFocus: true });
  const receiptArchive = useQuery({ queryKey: ['receipts', currentGroup?.id], queryFn: () => api<ReceiptArchive[]>(`/receipts${currentGroup ? `?groupId=${currentGroup.id}` : ''}`), enabled: !!currentGroup, refetchInterval: 12000, refetchOnWindowFocus: true });
  const notificationConfig = useQuery({ queryKey: ['notifications-config'], queryFn: () => api<{ enabled: boolean; publicKey: string }>('/notifications/config'), enabled: !!me.data });

  const invalidate = () => qc.invalidateQueries();
  const invalidateFinancialData = () => {
    qc.invalidateQueries({ queryKey: ['groups'] });
    qc.invalidateQueries({ queryKey: ['balances'] });
    qc.invalidateQueries({ queryKey: ['expenses-all'] });
    qc.invalidateQueries({ queryKey: ['expenses-search'] });
    qc.invalidateQueries({ queryKey: ['group'] });
    qc.invalidateQueries({ queryKey: ['group-balances'] });
    qc.invalidateQueries({ queryKey: ['settlements'] });
    qc.invalidateQueries({ queryKey: ['analytics'] });
  };
  const createGroup = useMutation({ mutationFn: (payload: any) => api<Group>('/groups', { method: 'POST', body: JSON.stringify(payload) }), onSuccess: g => { setSelectedGroup(g.id); setGroupFormOpen(false); setGroupName(''); setMemberEmails(''); invalidate(); } });
  const deleteGroup = useMutation({
    mutationFn: (id: string) => api(`/groups/${id}`, { method: 'DELETE' }),
    onSuccess: (_data, id: string) => {
      setDeleteConfirm('');
      setSelectedGroup(prev => prev === id ? '' : prev);
      qc.removeQueries({ queryKey: ['group', id] });
      invalidateFinancialData();
      invalidate();
      setTab('dashboard');
    }
  });
  const addMember = useMutation({ mutationFn: (payload: any) => api(`/groups/${currentGroup!.id}/members`, { method: 'POST', body: JSON.stringify(payload) }), onSuccess: () => { setInviteEmail(''); invalidate(); } });
  const findUser = useMutation({ mutationFn: (email: string) => api<User>('/users/by-email', { method: 'POST', body: JSON.stringify({ email }) }) });
  const createExpense = useMutation({ mutationFn: (payload: any) => api('/expenses', { method: 'POST', body: JSON.stringify(payload) }), onSuccess: () => { resetExpenseForm(); setExpenseFormOpen(false); invalidateFinancialData(); } });
  const updateExpense = useMutation({ mutationFn: (payload: any) => api(`/expenses/${payload.id}`, { method: 'PUT', body: JSON.stringify(payload) }), onSuccess: () => { resetExpenseForm(); setExpenseFormOpen(false); invalidateFinancialData(); } });
  const deleteExpense = useMutation({ mutationFn: (id: string) => api(`/expenses/${id}`, { method: 'DELETE' }), onSuccess: invalidateFinancialData });
  const settle = useMutation({
    mutationFn: (payload: any) => api('/settlements', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => { setPartialSettlements({}); invalidateFinancialData(); }
  });
  const deleteSettlement = useMutation({
    mutationFn: (id: string) => api(`/settlements/${id}`, { method: 'DELETE' }),
    onSuccess: (_data, id: string) => {
      qc.setQueryData<Settlement[]>(['settlements', currentGroup?.id], (old = []) => old.filter(s => s.id !== id));
      invalidateFinancialData();
    }
  });
  const saveReceipt = useMutation({
    mutationFn: (payload: any) => api<ReceiptArchive>('/receipts', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => { setReceiptPreview(null); setReceiptFileName(''); setReceiptNote(''); setReceiptExpenseId(''); setReceiptArchiveOpen(false); invalidate(); }
  });
  const deleteReceipt = useMutation({ mutationFn: (id: string) => api(`/receipts/${id}`, { method: 'DELETE' }), onSuccess: invalidate });

  const enableNotifications = useMutation({
    mutationFn: async () => {
      const config = notificationConfig.data ?? await api<{ enabled: boolean; publicKey: string }>('/notifications/config');
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) throw new Error('PUSH_NOT_SUPPORTED');
      if (!config.enabled || !config.publicKey) throw new Error('PUSH_NOT_CONFIGURED');
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('PUSH_PERMISSION_DENIED');
      const registration = await navigator.serviceWorker.register('/sw.js');
      const existing = await registration.pushManager.getSubscription();
      const subscription = existing ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(config.publicKey) });
      return api('/notifications/subscribe', { method: 'POST', body: JSON.stringify(subscription.toJSON()) });
    },
    onSuccess: () => setNotificationStatus('Notifiche attivate su questo dispositivo. Se installi FairSplit nella schermata Home, le notifiche push sono più affidabili anche quando l’app è chiusa.'),
    onError: (err: any) => setNotificationStatus(translateError(err?.message))
  });

  useEffect(() => {
    const expenses = allExpenses.data ?? [];
    if (!expenses.length) return;
    const seen = seenExpenseIds.current;
    if (seen.size === 0) {
      expenses.forEach(e => seen.add(e.id));
      return;
    }
    const newcomers = expenses.filter(e => !seen.has(e.id));
    newcomers.forEach(e => seen.add(e.id));
    if (!newcomers.length) return;
    const latest = newcomers[0];
    const message = `Nuova spesa: ${latest.title} · ${fmt(latest.total, latest.currency)}`;
    setLiveNotice(message);
    window.setTimeout(() => setLiveNotice(''), 6500);
    qc.invalidateQueries({ queryKey: ['group'] });
    qc.invalidateQueries({ queryKey: ['group-balances'] });
  }, [allExpenses.data, qc]);

  useEffect(() => {
    const rows = settlements.data ?? [];
    if (!rows.length) return;
    const seen = seenSettlementIds.current;
    if (seen.size === 0) { rows.forEach(s => seen.add(s.id)); return; }
    const newcomers = rows.filter(s => !seen.has(s.id));
    newcomers.forEach(s => seen.add(s.id));
    if (!newcomers.length) return;
    const latest = newcomers[0];
    const message = `${latest.fromUser.name} ha segnato pagato ${fmt(latest.amount, latest.currency)}`;
    setLiveNotice(message);
    window.setTimeout(() => setLiveNotice(''), 6500);
    invalidateFinancialData();
  }, [settlements.data]);

  useEffect(() => {
    const rows = receiptArchive.data ?? [];
    if (!rows.length) return;
    const seen = seenReceiptIds.current;
    if (seen.size === 0) { rows.forEach(r => seen.add(r.id)); return; }
    const newcomers = rows.filter(r => !seen.has(r.id));
    newcomers.forEach(r => seen.add(r.id));
    if (!newcomers.length) return;
    const latest = newcomers[0];
    const message = `Nuovo scontrino archiviato${latest.expense ? ` per ${latest.expense.title}` : ''}`;
    setLiveNotice(message);
    window.setTimeout(() => setLiveNotice(''), 6500);
  }, [receiptArchive.data]);

  const currentMembership = useMemo(() => (groupDetail.data?.members ?? currentGroup?.members ?? []).find((m: any) => m.user?.id === me.data?.id), [groupDetail.data, currentGroup, me.data]);
  const canDeleteCurrentGroup = Boolean(currentMembership && ['OWNER', 'ADMIN'].includes(currentMembership.role));
  const members: User[] = useMemo(() => (groupDetail.data?.members ?? currentGroup?.members ?? []).map((m: any) => m.user), [groupDetail.data, currentGroup]);
  const groupExpenses: Expense[] = groupDetail.data?.expenses ?? [];
  const visibleExpenses: Expense[] = useMemo(() => filterExpenses(groupExpenses, search, members), [groupExpenses, search, members]);
  const amount = parseAmount(amountInput);
  const totalAll = useMemo(() => (allExpenses.data ?? []).reduce((sum, e) => sum + e.total, 0), [allExpenses.data]);
  const totalGroup = useMemo(() => groupExpenses.reduce((sum, e) => sum + e.total, 0), [groupExpenses]);
  const openDebt = useMemo(() => (balances.data ?? []).reduce((sum, b) => sum + b.amount, 0), [balances.data]);
  const groupTotals = useMemo(() => aggregateGroups(allExpenses.data ?? [], groups.data ?? []), [allExpenses.data, groups.data]);
  const categoryData = useMemo(() => aggregateByCategory(groupExpenses), [groupExpenses]);
  const userShareData = useMemo(() => aggregateByUserShares(groupExpenses, members), [groupExpenses, members]);
  const recentExpenses = useMemo(() => (allExpenses.data ?? []).slice(0, 5), [allExpenses.data]);
  const splitSum = Object.values(exactSplits).reduce((sum, v) => sum + parseAmount(v), 0);
  const hasSplitError = splitMode === 'exact' && Math.abs(splitSum - amount) > 0.05;
  const memberBalances = useMemo(() => aggregateMemberBalances(groupExpenses, members, settlements.data ?? []), [groupExpenses, members, settlements.data]);
  const averageGroupExpense = groupExpenses.length ? totalGroup / groupExpenses.length : 0;
  const topCategory = categoryData[0];
  const largestExpense = useMemo(() => [...groupExpenses].sort((a, b) => b.total - a.total)[0], [groupExpenses]);

  function resetExpenseForm() {
    setExpenseTitle(''); setAmountInput(''); setCategory('general'); setPayer(''); setSplitMode('equal'); setExactSplits({}); setEditing(null);
  }
  function submitExpense(e: React.FormEvent) {
    e.preventDefault();
    if (!currentGroup || !members.length || amount <= 0) return;
    const payer = payerId || me.data?.id || members[0].id;
    const splits = splitMode === 'equal' ? equalSplits(members, amount) : members.map(u => ({ userId: u.id, amount: parseAmount(exactSplits[u.id] || '') }));
    const payload = { id: editing?.id, groupId: currentGroup.id, title: expenseTitle, category, total: amount, currency: currentGroup.currency, splitKind: splitMode, payers: [{ userId: payer, amount }], splits };
    editing ? updateExpense.mutate(payload) : createExpense.mutate(payload);
  }
  function startEdit(e: Expense) {
    setEditing(e); setExpenseTitle(e.title); setAmountInput(String(e.total).replace('.', ',')); setCategory(e.category); setSplitMode(e.splitKind === 'exact' ? 'exact' : 'equal'); setPayer(e.payers?.[0]?.userId ?? e.payers?.[0]?.user?.id ?? '');
    setExactSplits(Object.fromEntries((e.splits ?? []).map((s: any) => [s.userId ?? s.user?.id, String(Number(s.amount ?? 0)).replace('.', ',')])));
    setExpenseFormOpen(true);
    setTab('expenses');
  }
  function createNewGroup(e: React.FormEvent) {
    e.preventDefault();
    createGroup.mutate({ name: groupName, currency: groupCurrency, memberEmails: memberEmails.split(',').map(s => s.trim()).filter(Boolean) });
  }
  async function handleReceiptArchiveFile(file?: File) {
    if (!file) return;
    const dataUrl = await scanReceiptDocument(file);
    setReceiptPreview(dataUrl);
    setReceiptFileName((file.name || 'scontrino.jpg').replace(/\.[^.]+$/, '') + '-scansione.jpg');
    setReceiptArchiveOpen(true);
  }

  function saveReceiptArchive() {
    if (!currentGroup || !receiptPreview) return;
    saveReceipt.mutate({ groupId: currentGroup.id, imageDataUrl: receiptPreview, fileName: receiptFileName, mimeType: 'image/jpeg', note: receiptNote, expenseId: receiptExpenseId || undefined });
  }

  function settlementKey(b: Balance) {
    return `${b.from}-${b.to}`;
  }

  function registerSettlement(b: Balance, rawAmount?: string) {
    if (!currentGroup) return;
    const requested = rawAmount ? parseAmount(rawAmount) : b.amount;
    const value = Math.min(Math.max(requested, 0), b.amount);
    if (value <= 0) return;
    settle.mutate({ groupId: currentGroup.id, fromUserId: b.from, toUserId: b.to, amount: value, currency: b.currency });
  }

  if (me.isLoading) return <main className="loading">Caricamento...</main>;
  if (me.error) return <main className="loading error-state">
    <div className="panel" style={{ maxWidth: 520 }}>
      <h2>Sessione non valida</h2>
      <p>Il login è stato completato, ma la verifica della sessione non è riuscita. Esci e accedi di nuovo; se succede ancora, controlla che /api/me risponda correttamente.</p>
      <button className="primary" onClick={onLogout}>Torna al login</button>
    </div>
  </main>;

  return <main className="app">
    <aside className="sidebar">
      <div className="brand-lockup mini"><div className="logo"><Sparkles size={20} /></div><span>FairSplit</span></div>
      <nav aria-label="Navigazione principale">
        <button className={tab === 'dashboard' ? 'active' : ''} onClick={() => setTab('dashboard')}><Home size={18} /> Dashboard</button>
        <button className={tab === 'expenses' ? 'active' : ''} onClick={() => setTab('expenses')}><ReceiptText size={18} /> Spese</button>
        <button className={tab === 'groups' ? 'active' : ''} onClick={() => setTab('groups')}><Users size={18} /> Gruppi</button>
        <button className={tab === 'insights' ? 'active' : ''} onClick={() => setTab('insights')}><PieIcon size={18} /> Grafici</button>
      </nav>
      <div className="profile-card"><div className="avatar big">{me.data?.name.slice(0, 2).toUpperCase()}</div><b>{me.data?.name}</b><small>{me.data?.email}</small><button onClick={onLogout}><LogOut size={15} /> Esci</button></div>
    </aside>

    <section className="workspace">
      <header className="topbar">
        <div><span className="eyebrow">{tabLabel(tab)}</span><h1>{tab === 'dashboard' ? `Ciao ${me.data?.name.split(' ')[0] ?? ''}` : currentGroup?.name ?? 'FairSplit'}</h1></div>
        <div className="top-actions">
          <select value={currentGroup?.id ?? ''} onChange={e => setSelectedGroup(e.target.value)}>
            {(groups.data ?? []).map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <button type="button" className="mobile-logout" onClick={onLogout} aria-label="Esci dall'account"><LogOut size={17} /> Esci</button>
        </div>
      </header>
      {liveNotice && <div className="live-notice"><Bell size={16} /> {liveNotice}</div>}

      {tab === 'dashboard' && <section className="dashboard-grid dashboard-simple dashboard-clean">
        <Metric icon={<Users />} title="Gruppi" value={groups.data?.length ?? 0} />
        <Metric icon={<ReceiptText />} title="Spese totali" value={allExpenses.data?.length ?? 0} />
        <Metric icon={<WalletCards />} title="Da saldare" value={fmt(openDebt, currentGroup?.currency ?? 'EUR')} />
        <section className="panel group-list-panel full dashboard-groups-panel"><div className="section-title"><h2>I tuoi gruppi</h2><button onClick={() => { setTab('groups'); setGroupFormOpen(true); }}><Plus size={15} /> Crea gruppo</button></div>
          <p className="section-subtitle">Vedi solo i gruppi a cui partecipi. Tocca una card per aprire spese, saldi e archivio scontrini.</p>
          <div className="group-cards">{(groups.data ?? []).map((g, i) => { const gt = groupTotals.find(x => x.id === g.id); return <button key={g.id} className={`group-card group-card-dashboard tone-${i % 4}`} onClick={() => { setSelectedGroup(g.id); setTab('expenses'); }}><span>{g.name}</span><b>{fmt(gt?.total ?? 0, g.currency)}</b><small>{g.members.length} membri · {gt?.count ?? 0} spese attive</small></button>; })}</div>
          {!groups.data?.length && <Empty title="Nessun gruppo" text="Crea il primo gruppo e aggiungi utenti già registrati via email." />}
        </section>
        <section className="panel full notification-panel"><div><h2>Notifiche spese</h2><p>Attivale su questo telefono per ricevere avvisi anche quando l’app è chiusa. Su iPhone è più affidabile se aggiungi FairSplit alla schermata Home.</p></div><button className="secondary" onClick={() => enableNotifications.mutate()} disabled={enableNotifications.isPending}><Bell size={16} /> {enableNotifications.isPending ? 'Attivo...' : 'Attiva notifiche'}</button>{notificationStatus && <small>{notificationStatus}</small>}</section>
      </section>}

      {tab === 'expenses' && <section className="page-grid expenses-layout expenses-redesign">
        <section className="panel balance-first-panel debt-action-panel full"><div className="section-title"><div><h2>Debiti del gruppo</h2><p className="section-subtitle">Registra un pagamento parziale o chiudi direttamente il debito tra due membri.</p></div><span>{currentGroup?.currency}</span></div>
          {(groupBalances.data ?? []).length ? <div className="debt-action-list">{groupBalances.data!.map(b => { const key = settlementKey(b); const partial = partialSettlements[key] ?? ''; return <article className="debt-action-card" key={`${key}-${b.amount}`}><div className="debt-copy"><span><b>{nameOf(members, b.from)}</b> deve a <b>{nameOf(members, b.to)}</b></span><strong>{fmt(b.amount, b.currency)}</strong></div><div className="debt-controls"><label><small>Importo dato</small><input type="text" inputMode="decimal" value={partial} onChange={e => setPartialSettlements(prev => ({ ...prev, [key]: cleanMoneyInput(e.target.value) }))} placeholder={formatMoneyInput(b.amount)} /></label><button type="button" className="secondary" disabled={settle.isPending || parseAmount(partial) <= 0} onClick={() => registerSettlement(b, partial)}>Registra parziale</button><button type="button" className="primary" disabled={settle.isPending} onClick={() => registerSettlement(b)}>Pareggia tutto</button></div></article>; })}</div> : <p className="balanced-message">Il gruppo è in pari: nessun debito aperto.</p>}
          {settle.error && <p className="error">{translateError(settle.error.message)}</p>}
        </section>

        <section className={`panel form-panel collapsible-card full ${expenseFormOpen || editing ? 'open' : ''}`}><div className="section-title"><div><h2>{editing ? 'Modifica spesa' : 'Aggiungi una spesa'}</h2><p className="section-subtitle">Il form resta chiuso finché non serve, così la sezione spese resta leggibile.</p></div><button type="button" className="primary" onClick={() => setExpenseFormOpen(v => !v)}><Plus size={16} /> {expenseFormOpen || editing ? 'Chiudi' : 'Aggiungi spesa'}</button></div>
          {(expenseFormOpen || editing) && <>
          <div className={`receipt-tool ${receiptArchiveOpen ? 'open' : ''}`}>
            <button type="button" className="secondary receipt-toggle" onClick={() => setReceiptArchiveOpen(v => !v)}><Archive size={16} /> {receiptArchiveOpen ? 'Chiudi archivio scontrino' : 'Archivia scontrino per resi'}</button>
            {receiptArchiveOpen && <div className="receipt-tool-body"><p>Scansiona lo scontrino come documento. Non è obbligatorio collegarlo alla spesa.</p><label className="primary upload-button"><Camera size={16} /> Scansiona scontrino<input type="file" accept="image/*" capture="environment" onChange={e => handleReceiptArchiveFile(e.target.files?.[0])} /></label>{receiptPreview && <div className="receipt-preview"><img src={receiptPreview} alt="Scansione scontrino" /><div className="receipt-actions"><button type="button" className="secondary" onClick={() => openDataUrl(receiptPreview, receiptFileName || 'scontrino.jpg')}><ExternalLink size={14} /> Apri</button><button type="button" className="secondary" onClick={() => downloadDataUrl(receiptPreview, receiptFileName || 'scontrino.jpg')}><Download size={14} /> Scarica</button></div><label>Nota opzionale<input value={receiptNote} onChange={e => setReceiptNote(e.target.value)} placeholder="Es. Reso scarpe, garanzia telefono..." /></label><label>Collega a una spesa, opzionale<select value={receiptExpenseId} onChange={e => setReceiptExpenseId(e.target.value)}><option value="">Nessuna spesa collegata</option>{groupExpenses.map(e => <option key={e.id} value={e.id}>{e.title} · {fmt(e.total, e.currency)}</option>)}</select></label><button type="button" className="primary" onClick={saveReceiptArchive} disabled={saveReceipt.isPending}><Save size={16} /> Salva scansione</button></div>}{saveReceipt.error && <p className="error">{translateError(saveReceipt.error.message)}</p>}</div>}
          </div>
          {currentGroup ? <form className="form" onSubmit={submitExpense}>
            <label>Titolo<input value={expenseTitle} onChange={e => setExpenseTitle(e.target.value)} placeholder="Cena, supermercato, benzina..." required /></label>
            <div className="form-row"><label>Importo<input type="text" inputMode="decimal" value={amountInput} onChange={e => setAmountInput(cleanMoneyInput(e.target.value))} placeholder="0,00" required /></label><label>Categoria<select value={category} onChange={e => setCategory(e.target.value)}>{CATEGORIES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label></div>
            <div className="form-row"><label>Pagato da<select value={payerId || me.data?.id || ''} onChange={e => setPayer(e.target.value)}>{members.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label><label>Divisione<select value={splitMode} onChange={e => setSplitMode(e.target.value as any)}><option value="equal">Uguale tra tutti</option><option value="exact">Importi esatti</option></select></label></div>
            {splitMode === 'exact' && <div className="split-box">{members.map(u => <label key={u.id}>{u.name}<input type="text" inputMode="decimal" value={exactSplits[u.id] ?? ''} onChange={e => setExactSplits({ ...exactSplits, [u.id]: cleanMoneyInput(e.target.value) })} placeholder="0,00" /></label>)}<small className={hasSplitError ? 'error' : 'muted'}>Totale divisione: {fmt(splitSum, currentGroup.currency)} / {fmt(amount, currentGroup.currency)}</small></div>}
            <div className="button-row"><button className="primary" disabled={createExpense.isPending || updateExpense.isPending || hasSplitError || !members.length || amount <= 0}><Save size={16} /> {editing ? 'Salva modifiche' : 'Aggiungi spesa'}</button>{editing && <button type="button" className="ghost" onClick={resetExpenseForm}>Annulla</button>}</div>
            {(createExpense.error || updateExpense.error) && <p className="error">{translateError((createExpense.error || updateExpense.error)?.message)}</p>}
          </form> : <Empty title="Nessun gruppo" text="Crea un gruppo prima di aggiungere spese." />}</>}</section>

        <section className="panel list-panel expenses-list-panel full"><div className="section-title"><div><h2>Spese del gruppo</h2><p className="section-subtitle">Storico spese con ricerca e modifica rapida.</p></div><span>{visibleExpenses.length} risultati</span></div><div className="searchbox"><Search size={18} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cerca titolo, categoria, persona, importo..." /></div><div className="expense-list-stack">{visibleExpenses.length ? visibleExpenses.map(e => <ExpenseRow key={e.id} e={e} onEdit={() => startEdit(e)} onDelete={() => deleteExpense.mutate(e.id)} />) : <Empty title="Nessuna spesa trovata" text="Prova a cercare altro oppure aggiungi una nuova spesa." />}</div></section>

        <section className="panel full receipt-archive-panel"><div className="section-title"><div><h2>Archivio scontrini</h2><p className="section-subtitle">Scansioni documentali salvate per resi e garanzie. Puoi collegarle a una spesa, ma non è obbligatorio.</p></div><label className="secondary upload-inline"><Camera size={16} /> Nuova scansione<input type="file" accept="image/*" capture="environment" onChange={e => handleReceiptArchiveFile(e.target.files?.[0])} /></label></div>{receiptPreview && <div className="receipt-preview archive-inline"><img src={receiptPreview} alt="Scansione scontrino" /><div className="receipt-actions"><button type="button" className="secondary" onClick={() => openDataUrl(receiptPreview, receiptFileName || 'scontrino.jpg')}><ExternalLink size={14} /> Apri</button><button type="button" className="secondary" onClick={() => downloadDataUrl(receiptPreview, receiptFileName || 'scontrino.jpg')}><Download size={14} /> Scarica</button></div><label>Nota opzionale<input value={receiptNote} onChange={e => setReceiptNote(e.target.value)} placeholder="Es. regalo, reso, garanzia..." /></label><label>Collega a una spesa, opzionale<select value={receiptExpenseId} onChange={e => setReceiptExpenseId(e.target.value)}><option value="">Nessuna spesa collegata</option>{groupExpenses.map(e => <option key={e.id} value={e.id}>{e.title} · {fmt(e.total, e.currency)}</option>)}</select></label><button type="button" className="primary" onClick={saveReceiptArchive} disabled={saveReceipt.isPending}><Save size={16} /> Salva scansione</button></div>}{receiptArchive.data?.length ? <div className="receipt-grid">{receiptArchive.data.map(r => <article className="receipt-card" key={r.id}><button type="button" className="receipt-thumb" onClick={() => setOpenedReceipt(r)}><img src={r.imageDataUrl} alt={r.note || r.fileName || 'Scontrino scansionato'} /></button><div><b>{r.note || r.fileName || 'Scontrino scansionato'}</b><small>{new Date(r.createdAt).toLocaleDateString('it-IT')} · {r.uploader?.name ?? 'Utente'}</small>{r.expense && <small className="receipt-linked">Collegato a: {r.expense.title} · {fmt(r.expense.total, r.expense.currency)}</small>}<div className="receipt-actions"><button type="button" className="secondary" onClick={() => setOpenedReceipt(r)}><ExternalLink size={14} /> Apri</button><button type="button" className="secondary" onClick={() => downloadDataUrl(r.imageDataUrl, r.fileName || 'scontrino.jpg')}><Download size={14} /> Scarica</button><button type="button" className="danger receipt-delete" onClick={() => deleteReceipt.mutate(r.id)} disabled={deleteReceipt.isPending}><Trash2 size={14} /> Elimina</button></div></div></article>)}</div> : <Empty title="Archivio vuoto" text="Scansiona uno scontrino e salvalo qui per ritrovarlo quando serve." />}{(saveReceipt.error || deleteReceipt.error) && <p className="error">{translateError((saveReceipt.error || deleteReceipt.error)?.message)}</p>}</section>
      </section>}

      {tab === 'groups' && <section className="page-grid groups-layout">
        <section className={`panel collapsible-card ${groupFormOpen ? 'open' : ''}`}><div className="section-title"><h2>Crea gruppo</h2><button type="button" className="primary" onClick={() => setGroupFormOpen(v => !v)}><Plus size={16} /> {groupFormOpen ? 'Chiudi' : 'Nuovo'}</button></div>{!groupFormOpen && <p className="helper-text">Crea un gruppo solo quando ti serve: la sezione resta compatta e più leggibile.</p>}{groupFormOpen && <form className="form" onSubmit={createNewGroup}><label>Nome gruppo<input value={groupName} onChange={e => setGroupName(e.target.value)} placeholder="Vacanza a Lisbona" required /></label><label>Valuta<select value={groupCurrency} onChange={e => setGroupCurrency(e.target.value)}><option>EUR</option><option>USD</option><option>GBP</option></select></label><label>Email membri già registrati<input value={memberEmails} onChange={e => setMemberEmails(e.target.value)} placeholder="alice@email.com, bob@email.com" /></label><button className="primary"><Plus size={16} /> Crea gruppo</button>{createGroup.error && <p className="error">{translateError(createGroup.error.message)}</p>}</form>}</section>
        <section className="panel"><div className="section-title"><h2>Membri di {currentGroup?.name ?? 'gruppo'}</h2><span>{members.length}</span></div>{currentGroup ? <><div className="member-list">{members.map(u => <div className="member" key={u.id}><div className="avatar">{u.name.slice(0, 2).toUpperCase()}</div><span><b>{u.name}</b><small>{u.email}</small></span></div>)}</div><form className="form inline-form" onSubmit={e => { e.preventDefault(); if (inviteEmail) addMember.mutate({ email: inviteEmail }); }}><input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="email già registrata" /><button className="primary"><UserPlus size={16} /> Aggiungi</button></form>{addMember.error && <p className="error">{translateError(addMember.error.message)}</p>}</> : <Empty title="Nessun gruppo" text="Crea un gruppo per aggiungere membri." />}</section>
        <section className={`panel full collapsible-card ${userSearchOpen ? 'open' : ''}`}><div className="section-title"><h2>Cerca utente registrato</h2><button type="button" className="secondary" onClick={() => setUserSearchOpen(v => !v)}><Search size={16} /> {userSearchOpen ? 'Chiudi' : 'Cerca'}</button></div>{!userSearchOpen && <p className="helper-text">Usa questa funzione solo quando vuoi verificare se una mail è già registrata.</p>}{userSearchOpen && <><form className="form inline-form" onSubmit={e => { e.preventDefault(); findUser.mutate(lookupEmail); }}><input type="email" value={lookupEmail} onChange={e => setLookupEmail(e.target.value)} placeholder="persona@email.com" /><button className="primary"><Search size={16} /> Cerca</button></form>{findUser.data && <div className="found-user"><b>{findUser.data.name}</b><span>{findUser.data.email}</span>{currentGroup && <button onClick={() => addMember.mutate({ userId: findUser.data!.id })}>Aggiungi a {currentGroup.name}</button>}</div>}{findUser.error && <p className="error">{translateError(findUser.error.message)}</p>}</>}</section>
        <section className="panel full danger-zone"><div className="section-title"><div><h2>Elimina gruppo</h2><p className="section-subtitle">Elimina definitivamente gruppo, membri, spese, pagamenti e scansioni collegate.</p></div></div>{currentGroup ? (canDeleteCurrentGroup ? <div className="delete-group-box"><p>Per confermare scrivi <b>{currentGroup.name}</b> e premi elimina. Questa operazione non può essere annullata.</p><div className="inline-form danger-inline"><input value={deleteConfirm} onChange={e => setDeleteConfirm(e.target.value)} placeholder={currentGroup.name} /><button type="button" className="danger" disabled={deleteGroup.isPending || deleteConfirm !== currentGroup.name} onClick={() => deleteGroup.mutate(currentGroup.id)}><Trash2 size={16} /> Elimina gruppo</button></div>{deleteGroup.error && <p className="error">{translateError(deleteGroup.error.message)}</p>}</div> : <p className="helper-text">Solo chi ha creato il gruppo o un amministratore può eliminarlo.</p>) : <Empty title="Nessun gruppo selezionato" text="Crea o seleziona un gruppo prima di eliminarlo." />}</section>
      </section>}

      {tab === 'insights' && <section className="page-grid insights-layout">
        <section className="panel spending-summary-panel full"><div className="section-title"><div><h2>Totale spese del gruppo</h2><p className="section-subtitle">Riepilogo generale spostato qui, insieme ai grafici e alle statistiche del gruppo.</p></div></div>
          <div className="spending-summary-grid"><div className="spending-main"><span>Totale gruppo</span><strong>{fmt(totalGroup, currentGroup?.currency ?? 'EUR')}</strong><small>{groupExpenses.length} spese attive</small></div><div><span>Media spesa</span><b>{fmt(averageGroupExpense, currentGroup?.currency ?? 'EUR')}</b></div><div><span>Categoria principale</span><b>{topCategory ? `${labelCategory(topCategory.category)} · ${fmt(topCategory.total, currentGroup?.currency ?? 'EUR')}` : '—'}</b></div><div><span>Spesa più alta</span><b>{largestExpense ? `${largestExpense.title} · ${fmt(largestExpense.total, largestExpense.currency)}` : '—'}</b></div></div>
        </section>
        <section className="panel chart-panel"><div className="section-title"><h2>Ripartizione per categoria</h2><span>{fmt(totalGroup, currentGroup?.currency ?? 'EUR')}</span></div><ResponsiveContainer height={300}>{categoryData.length ? <PieChart><Pie data={categoryData} dataKey="total" nameKey="category" outerRadius={105} label={(d: any) => labelCategory(d.category)}>{categoryData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip formatter={(v: any) => fmt(Number(v), currentGroup?.currency ?? 'EUR')} /><Legend /></PieChart> : <BarChart data={[]} />}</ResponsiveContainer></section>
        <section className="panel chart-panel"><div className="section-title"><h2>Quote per persona</h2><span>{members.length} membri</span></div><ResponsiveContainer height={300}><BarChart data={userShareData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis /><Tooltip formatter={(v: any) => fmt(Number(v), currentGroup?.currency ?? 'EUR')} /><Bar dataKey="total" radius={[10, 10, 0, 0]}>{userShareData.map((_, i) => <Cell key={i} fill={COLORS[(i + 2) % COLORS.length]} />)}</Bar></BarChart></ResponsiveContainer></section>
        <section className="panel chart-panel full"><div className="section-title"><h2>Totale per categoria</h2><button onClick={() => downloadCsv()}><Download size={16} /> Export CSV</button></div><ResponsiveContainer height={320}><BarChart data={analytics.data ?? []}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="category" tickFormatter={labelCategory} /><YAxis /><Tooltip formatter={(v: any) => fmt(Number(v), currentGroup?.currency ?? 'EUR')} /><Bar dataKey="total" radius={[10, 10, 0, 0]}>{(analytics.data ?? []).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Bar></BarChart></ResponsiveContainer></section>
        <section className="panel full"><h2>Pagamenti registrati</h2>{settlements.data?.length ? settlements.data.map(s => <div className="balance" key={s.id}><span><b>{s.fromUser.name}</b> ha pagato <b>{s.toUser.name}</b></span><strong>{fmt(s.amount, s.currency)}</strong><button className="danger" onClick={() => deleteSettlement.mutate(s.id)}>Annulla</button></div>) : <Empty title="Nessun pagamento" text="I pagamenti saldati compariranno qui." />}</section>
      </section>}
    </section>
    {openedReceipt && <div className="receipt-modal" role="dialog" aria-modal="true" aria-label="Scansione scontrino" onClick={() => setOpenedReceipt(null)}><div className="receipt-modal-card" onClick={e => e.stopPropagation()}><div className="section-title"><div><h2>{openedReceipt.note || openedReceipt.fileName || 'Scontrino scansionato'}</h2>{openedReceipt.expense && <p className="section-subtitle">Collegato a {openedReceipt.expense.title}</p>}</div><button type="button" className="secondary" onClick={() => setOpenedReceipt(null)}>Chiudi</button></div><img src={openedReceipt.imageDataUrl} alt={openedReceipt.note || 'Scontrino scansionato'} /><div className="receipt-actions"><button type="button" className="primary" onClick={() => openDataUrl(openedReceipt.imageDataUrl, openedReceipt.fileName || 'scontrino.jpg')}><ExternalLink size={15} /> Apri in nuova scheda</button><button type="button" className="secondary" onClick={() => downloadDataUrl(openedReceipt.imageDataUrl, openedReceipt.fileName || 'scontrino.jpg')}><Download size={15} /> Scarica</button></div></div></div>}
  </main>;
}



function normalizeText(value: string) {
  return value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9,\. ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function filterExpenses(expenses: Expense[], search: string, members: User[]) {
  const q = normalizeText(search);
  if (!q) return expenses;
  const terms = q.split(' ').filter(Boolean);
  return expenses.filter(e => {
    const payerNames = (e.payers ?? []).map((p: any) => p.user?.name ?? members.find(m => m.id === p.userId)?.name ?? '').join(' ');
    const splitNames = (e.splits ?? []).map((sp: any) => sp.user?.name ?? members.find(m => m.id === sp.userId)?.name ?? '').join(' ');
    const haystack = normalizeText([e.title, e.description ?? '', e.category, labelCategory(e.category), e.currency, e.total.toString().replace('.', ','), new Date(e.date).toLocaleDateString('it-IT'), payerNames, splitNames].join(' '));
    return terms.every(term => haystack.includes(term));
  });
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename || 'scontrino.jpg';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function openDataUrl(dataUrl: string, filename: string) {
  const win = window.open('', '_blank');
  if (!win) { downloadDataUrl(dataUrl, filename); return; }
  win.document.write(`<html><head><title>${filename}</title><meta name="viewport" content="width=device-width, initial-scale=1" /></head><body style="margin:0;background:#111;display:grid;place-items:center;min-height:100vh"><img src="${dataUrl}" style="max-width:100%;height:auto" /></body></html>`);
  win.document.close();
}

function formatMoneyInput(value: number) {
  return String(Math.round(value * 100) / 100).replace('.', ',');
}


async function scanReceiptDocument(file: File): Promise<string> {
  const dataUrl = await fileToDataUrl(file);
  const img = await loadImage(dataUrl);
  const maxSide = 1800;
  const ratio = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * ratio));
  const height = Math.max(1, Math.round(img.naturalHeight * ratio));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return dataUrl;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    const contrasted = Math.max(0, Math.min(255, (gray - 128) * 1.45 + 128));
    const clean = contrasted > 205 ? 255 : contrasted < 72 ? 0 : contrasted;
    data[i] = data[i + 1] = data[i + 2] = clean;
    data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL('image/jpeg', 0.9);
}


function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('IMAGE_READ_FAILED'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('IMAGE_LOAD_FAILED'));
    img.src = src;
  });
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

function parseAmount(value: string) { const n = Number(value.replace(',', '.')); return Number.isFinite(n) ? n : 0; }
function cleanMoneyInput(value: string) { return value.replace(/[^0-9,.]/g, '').replace(/([,.].*)[,.]/g, '$1'); }
function equalSplits(users: User[], total: number) { if (!users.length) return []; const cents = Math.round(total * 100); const base = Math.floor(cents / users.length); let rest = cents - base * users.length; return users.map(u => ({ userId: u.id, amount: (base + (rest-- > 0 ? 1 : 0)) / 100 })); }
function aggregateMemberBalances(expenses: Expense[], members: User[], settlements: Settlement[] = []) {
  const map = new Map(members.map(m => [m.id, { user: m, paid: 0, owed: 0, settledOut: 0, settledIn: 0, net: 0 }]));
  for (const e of expenses) {
    for (const p of e.payers ?? []) {
      const id = p.userId ?? p.user?.id;
      if (id && map.has(id)) map.get(id)!.paid += Number(p.amount ?? 0);
    }
    for (const s of e.splits ?? []) {
      const id = s.userId ?? s.user?.id;
      if (id && map.has(id)) map.get(id)!.owed += Number(s.amount ?? 0);
    }
  }
  for (const s of settlements ?? []) {
    const from = s.fromUser?.id;
    const to = s.toUser?.id;
    if (from && map.has(from)) map.get(from)!.settledOut += Number(s.amount ?? 0);
    if (to && map.has(to)) map.get(to)!.settledIn += Number(s.amount ?? 0);
  }
  return [...map.values()].map(item => ({ ...item, net: Math.round((item.paid - item.owed - item.settledIn + item.settledOut) * 100) / 100 })).sort((a, b) => b.net - a.net);
}
function aggregateByCategory(expenses: Expense[]) { const map = new Map<string, number>(); for (const e of expenses) map.set(e.category || 'general', (map.get(e.category || 'general') ?? 0) + e.total); return [...map.entries()].map(([category, total]) => ({ category, total })).sort((a, b) => b.total - a.total); }
function aggregateByUserShares(expenses: Expense[], members: User[]) { const names = new Map(members.map(m => [m.id, m.name])); const map = new Map<string, number>(); for (const e of expenses) for (const s of e.splits ?? []) { const id = s.userId ?? s.user?.id; if (id) map.set(id, (map.get(id) ?? 0) + Number(s.amount ?? 0)); } return [...map.entries()].map(([id, total]) => ({ name: names.get(id) ?? id.slice(0, 6), total })).sort((a, b) => b.total - a.total); }
function aggregateGroups(expenses: Expense[], groups: Group[]) { const totals = new Map<string, number>(); const counts = new Map<string, number>(); for (const e of expenses) { const id = e.group?.id ?? e.groupId; if (id) { totals.set(id, (totals.get(id) ?? 0) + e.total); counts.set(id, (counts.get(id) ?? 0) + 1); } } const max = Math.max(1, ...totals.values()); return [...groups.map(g => ({ id: g.id, name: g.name, currency: g.currency, total: totals.get(g.id) ?? 0, count: counts.get(g.id) ?? 0, percent: Math.round(((totals.get(g.id) ?? 0) / max) * 100) }))].sort((a, b) => b.total - a.total); }
function translateError(message?: string) {
  const m = message ?? '';
  if (m.includes('EMAIL_ALREADY_REGISTERED')) return 'Questa email è già registrata.';
  if (m.includes('INVALID_EMAIL_OR_PASSWORD')) return 'Email o password non validi.';
  if (m.includes('USER_NOT_FOUND')) return 'Nessun account trovato con questa email. Prima crea l’account.';
  if (m.includes('USERS_NOT_FOUND')) return 'Una o più email non corrispondono ad account registrati.';
  if (m.includes('PASSWORD_MIN_8_CHARS')) return 'La password deve avere almeno 8 caratteri.';
  if (m.includes('NOT_A_GROUP_MEMBER')) return 'Non puoi accedere a gruppi di cui non fai parte.';
  if (m.includes('ONLY_OWNER_CAN_DELETE_GROUP')) return 'Solo il proprietario o un amministratore può eliminare il gruppo.';
  if (m.includes('DATABASE_SCHEMA_NOT_READY')) return 'Il database Neon è collegato, ma le tabelle non sono ancora state create. Apri il terminale e lancia: vercel env pull .env && npm run db:push.';
  if (m.includes('DATABASE_NOT_CONFIGURED')) return 'Database non configurato: su Vercel deve esistere DATABASE_URL oppure POSTGRES_URL/POSTGRES_PRISMA_URL da Neon.';
  if (m.includes('DATABASE_NOT_REACHABLE')) return 'Il database non è raggiungibile: controlla le variabili Neon in Vercel.';
  if (m.includes('NETWORK_OR_API_OFFLINE')) return 'L’API non risponde. Prova ad aprire /api/health e /api/debug sul dominio Vercel per verificare il backend.';
  if (m.includes('VALIDATION_ERROR')) return 'Controlla i dati inseriti e riprova.';
  if (m.includes('PUSH_NOT_SUPPORTED')) return 'Questo browser non supporta le notifiche push.';
  if (m.includes('PUSH_NOT_CONFIGURED')) return 'Notifiche non configurate: aggiungi VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY nelle variabili ambiente.';
  if (m.includes('PUSH_PERMISSION_DENIED')) return 'Permesso notifiche negato sul telefono.';
  if (m.includes('API_RETURNED_HTML_INSTEAD_OF_JSON')) return 'La chiamata API sta tornando la pagina HTML dell’app invece del backend. Questo pacchetto corregge le route /api su Vercel.';
  if (m.includes('__HTTP_404')) return 'API non trovata: controlla Root Directory e Build Command su Vercel.';
  if (m.includes('__HTTP_500')) return 'Errore server: controlla i Function Logs su Vercel oppure apri /api/debug.';
  return m.replace(/__HTTP_\d+/, '') || 'Errore imprevisto';
}
function tabLabel(tab: Tab) { return ({ dashboard: 'Dashboard', expenses: 'Gestione spese', groups: 'Gruppi e membri', insights: 'Grafici e pagamenti' } as Record<Tab, string>)[tab]; }
function Metric({ icon, title, value }: { icon: React.ReactNode; title: string; value: React.ReactNode }) { return <div className="metric"><div>{icon}</div><span>{title}</span><b>{value}</b></div>; }
function Empty({ title, text }: { title: string; text: string }) { return <div className="empty"><h3>{title}</h3><p>{text}</p></div>; }
function nameOf(users: User[] | undefined, id: string) { return users?.find(u => u.id === id)?.name ?? id.slice(0, 6); }
function ExpenseRow({ e, onEdit, onDelete }: { e: Expense; onEdit: () => void; onDelete: () => void }) { return <article className="expense"><div><b>{e.title}</b><span>{e.group?.name ?? 'Gruppo'} · {labelCategory(e.category)} · {new Date(e.date).toLocaleDateString('it-IT')}</span></div><strong>{fmt(e.total, e.currency)}</strong><div className="actions"><button onClick={onEdit}>Modifica</button><button className="danger" onClick={onDelete}><Trash2 size={14} /> Elimina</button></div></article>; }
function MiniExpense({ e }: { e: Expense }) { return <div className="mini-expense"><span><b>{e.title}</b><small>{e.group?.name ?? 'Gruppo'} · {labelCategory(e.category)}</small></span><strong>{fmt(e.total, e.currency)}</strong></div>; }
function labelCategory(c: string) { return ({ food: 'Cibo', transport: 'Trasporti', home: 'Casa', travel: 'Viaggi', shopping: 'Shopping', health: 'Salute', fun: 'Svago', general: 'Altro' } as Record<string, string>)[c] ?? c; }

const qc = new QueryClient();
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={qc}><Shell /></QueryClientProvider>);
