import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  CheckCircle2,
  Inbox,
  MessageSquare,
  Package,
  Plus,
  Search,
  Send,
  Settings,
  ShoppingBag,
  Tag,
  UserCheck,
  X,
} from 'lucide-react';
import type { BusinessMembership, BusinessMembershipRole, BusinessProfile } from '../types/business';
import type {
  BusinessChatMessage,
  BusinessChatStatus,
  BusinessChatThread,
  BusinessMessagingSettings,
  QuickReplyItem,
} from '../types/businessChat';
import type { MarketplaceOrder, MarketplaceProduct } from '../types/marketplace';
import type { UserProfile } from '../types/social';
import {
  computeBusinessInboxAnalytics,
  markBusinessChatRead,
  sendBusinessChatMessage,
  subscribeBusinessChatMessages,
  subscribeBusinessInboxChats,
  updateBusinessChatMeta,
} from '../services/businessChat';
import {
  saveBusinessMessagingSettings,
  subscribeBusinessMessagingSettings,
} from '../services/businessProfiles';
import { formatCurrencyCents } from '../services/marketplaceCatalogAssets';
import { formatRelativeTime } from '../utils/socialLogic';
import { Avatar } from './Avatar';

interface BusinessInboxViewProps {
  businessProfile: BusinessProfile;
  activeRole: BusinessMembershipRole | null;
  currentProfile: UserProfile;
  members: BusinessMembership[];
  products: MarketplaceProduct[];
  orders: MarketplaceOrder[];
  initialThreadId?: string | null;
  onOpenProduct?: (productId: string) => void;
}

const PRESET_LABELS = ['Pre-Sale', 'Order Support', 'VIP', 'Follow-Up', 'Wholesale'];

export function BusinessInboxView({
  businessProfile,
  activeRole,
  currentProfile,
  members,
  products,
  orders,
  initialThreadId = null,
  onOpenProduct,
}: BusinessInboxViewProps) {
  const [threads, setThreads] = useState<BusinessChatThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string>(initialThreadId || '');
  const [messages, setMessages] = useState<BusinessChatMessage[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | BusinessChatStatus>('all');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [messagingSettings, setMessagingSettings] = useState<BusinessMessagingSettings | null>(null);
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [showAutomationModal, setShowAutomationModal] = useState(false);
  const [customLabel, setCustomLabel] = useState('');

  // Automation & Quick Replies form state
  const [welcomeEnabled, setWelcomeEnabled] = useState(false);
  const [welcomeMessage, setWelcomeMessage] = useState('');
  const [awayEnabled, setAwayEnabled] = useState(false);
  const [awayMessage, setAwayMessage] = useState('');
  const [quickRepliesDraft, setQuickRepliesDraft] = useState<QuickReplyItem[]>([]);
  const [newQuickLabel, setNewQuickLabel] = useState('');
  const [newQuickText, setNewQuickText] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);

  const messageEndRef = useRef<HTMLDivElement | null>(null);
  const canRespond =
    activeRole === 'OWNER' || activeRole === 'ADMIN' || activeRole === 'EDITOR';

  useEffect(() => {
    const unsub = subscribeBusinessInboxChats(
      businessProfile.id,
      currentProfile.uid,
      (loaded) => {
        setThreads(loaded);
      }
    );
    return () => unsub();
  }, [businessProfile.id, currentProfile.uid]);

  useEffect(() => {
    const unsub = subscribeBusinessMessagingSettings(businessProfile.id, (cfg) => {
      setMessagingSettings(cfg);
      setWelcomeEnabled(cfg.welcomeEnabled);
      setWelcomeMessage(cfg.welcomeMessage);
      setAwayEnabled(cfg.awayEnabled);
      setAwayMessage(cfg.awayMessage);
      setQuickRepliesDraft(cfg.quickReplies);
    });
    return () => unsub();
  }, [businessProfile.id]);

  useEffect(() => {
    if (initialThreadId && threads.some((t) => t.id === initialThreadId)) {
      setActiveThreadId(initialThreadId);
    }
  }, [initialThreadId, threads]);

  const filteredThreads = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return threads.filter((t) => {
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      if (unreadOnly && !t.unreadByBusiness) return false;
      if (!q) return true;
      return (
        t.customerName.toLowerCase().includes(q) ||
        t.customerHandle.toLowerCase().includes(q) ||
        t.lastMessageText.toLowerCase().includes(q) ||
        (t.linkedProductTitle || '').toLowerCase().includes(q)
      );
    });
  }, [searchQuery, statusFilter, threads, unreadOnly]);

  const activeThread = useMemo(() => {
    if (!activeThreadId) return filteredThreads[0] || null;
    return threads.find((t) => t.id === activeThreadId) || filteredThreads[0] || null;
  }, [activeThreadId, filteredThreads, threads]);

  useEffect(() => {
    if (!activeThread) {
      setMessages([]);
      return;
    }
    const unsub = subscribeBusinessChatMessages(
      activeThread.id,
      currentProfile.uid,
      (list) => setMessages(list)
    );
    if (activeThread.unreadByBusiness && canRespond) {
      void markBusinessChatRead(activeThread.id, 'business');
    }
    return () => unsub();
  }, [activeThread?.id, activeThread?.unreadByBusiness, canRespond, currentProfile.uid]);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, activeThread?.id]);

  const analytics = useMemo(
    () => computeBusinessInboxAnalytics(threads, currentProfile.uid),
    [threads, currentProfile.uid]
  );

  const customerOrders = useMemo(() => {
    if (!activeThread) return [];
    return orders.filter((o) => o.buyerUid === activeThread.customerUid);
  }, [activeThread, orders]);

  const handleSendText = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeThread || !canRespond || sending) return;
    const clean = draft.trim();
    if (!clean) return;
    setError(null);
    setSending(true);
    try {
      await sendBusinessChatMessage({
        thread: activeThread,
        senderUid: currentProfile.uid,
        senderType: 'business',
        senderName: businessProfile.displayName,
        senderAvatar: businessProfile.logoUrl,
        text: clean,
        messageType: 'text',
      });
      setDraft('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send message.');
    } finally {
      setSending(false);
    }
  };

  const handleShareProduct = async (product: MarketplaceProduct) => {
    if (!activeThread || !canRespond || sending) return;
    setSending(true);
    setShowProductPicker(false);
    setError(null);
    try {
      const priceLabel = formatCurrencyCents(product.priceCents, product.currency);
      await sendBusinessChatMessage({
        thread: activeThread,
        senderUid: currentProfile.uid,
        senderType: 'business',
        senderName: businessProfile.displayName,
        senderAvatar: businessProfile.logoUrl,
        text: `Shared product: ${product.title} (${priceLabel})`,
        messageType: 'product',
        productAttachment: {
          productId: product.id,
          title: product.title,
          priceCents: product.priceCents,
          currency: product.currency,
          imageUrl: product.imageUrl,
          storeSlug: product.storeSlug,
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to share product.');
    } finally {
      setSending(false);
    }
  };

  const handleUpdateThreadStatus = async (status: BusinessChatStatus) => {
    if (!activeThread || !canRespond) return;
    try {
      await updateBusinessChatMeta(activeThread.id, { status });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update conversation status.');
    }
  };

  const handleAssignThread = async (assignedUid: string) => {
    if (!activeThread || !canRespond) return;
    try {
      await updateBusinessChatMeta(activeThread.id, { assignedUid });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to assign conversation.');
    }
  };

  const handleToggleLabel = async (label: string) => {
    if (!activeThread || !canRespond) return;
    const clean = label.trim().slice(0, 32);
    if (!clean) return;
    const exists = activeThread.labels.includes(clean);
    const nextLabels = exists
      ? activeThread.labels.filter((l) => l !== clean)
      : [...activeThread.labels, clean].slice(0, 8);
    try {
      await updateBusinessChatMeta(activeThread.id, { labels: nextLabels });
      setCustomLabel('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update labels.');
    }
  };

  const handleSaveAutomation = async (e: FormEvent) => {
    e.preventDefault();
    if (!canRespond || savingSettings) return;
    setSavingSettings(true);
    try {
      await saveBusinessMessagingSettings(businessProfile.id, currentProfile.uid, {
        welcomeEnabled,
        welcomeMessage,
        awayEnabled,
        awayMessage,
        quickReplies: quickRepliesDraft,
      });
      setShowAutomationModal(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save messaging automation.');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleAddQuickReply = () => {
    if (!newQuickLabel.trim() || !newQuickText.trim()) return;
    setQuickRepliesDraft((prev) => [
      ...prev.slice(0, 19),
      {
        id: `qr_${Date.now()}`,
        label: newQuickLabel.trim().slice(0, 60),
        text: newQuickText.trim().slice(0, 500),
      },
    ]);
    setNewQuickLabel('');
    setNewQuickText('');
  };

  return (
    <div data-testid="business-inbox-view" className="space-y-4">
      {/* Top Messaging KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Total Inquiries
          </p>
          <p className="text-xl font-bold text-slate-900 dark:text-white tabular-nums mt-1">
            {analytics.totalThreads}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Open Queue
          </p>
          <p className="text-xl font-bold text-blue-600 dark:text-blue-400 tabular-nums mt-1">
            {analytics.openCount}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Unread
          </p>
          <p className="text-xl font-bold text-amber-600 dark:text-amber-400 tabular-nums mt-1">
            {analytics.unreadCount}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 flex items-center justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Assigned to You
            </p>
            <p className="text-xl font-bold text-slate-900 dark:text-white tabular-nums mt-1">
              {analytics.assignedToMeCount}
            </p>
          </div>
          {canRespond && (
            <button
              type="button"
              onClick={() => setShowAutomationModal(true)}
              aria-label="Configure automated responses and quick replies"
              className="min-h-[40px] min-w-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Settings className="w-4 h-4" aria-hidden="true" />
              <span className="hidden sm:inline">Automations</span>
            </button>
          )}
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/30 px-3.5 py-2.5 text-xs text-rose-700 dark:text-rose-300"
        >
          {error}
        </div>
      )}

      {/* 3-Pane Business Inbox Container */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden grid grid-cols-1 lg:grid-cols-12 min-h-[620px]">
        {/* Left Thread List */}
        <div className="lg:col-span-4 xl:col-span-3 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800 flex flex-col">
          <div className="p-3 border-b border-slate-200 dark:border-slate-800 space-y-2.5">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search customer inquiries..."
                className="w-full min-h-[38px] pl-9 pr-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div className="flex items-center gap-1 overflow-x-auto">
              {(['all', 'open', 'pending', 'resolved'] as const).map((tab) => {
                const active = statusFilter === tab;
                return (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setStatusFilter(tab)}
                    className={`min-h-[30px] px-2.5 rounded-lg text-[11px] font-semibold capitalize whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                      active
                        ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    {tab}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setUnreadOnly((v) => !v)}
                aria-pressed={unreadOnly}
                className={`min-h-[30px] px-2.5 rounded-lg text-[11px] font-semibold whitespace-nowrap shrink-0 cursor-pointer border ${
                  unreadOnly
                    ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-300'
                    : 'border-transparent text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                Unread
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/80 max-h-[540px]">
            {filteredThreads.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <Inbox className="w-7 h-7 mx-auto text-slate-300 dark:text-slate-700" aria-hidden="true" />
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  No customer inquiries
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Inquiries from your storefront and product pages appear here separately from personal chats.
                </p>
              </div>
            ) : (
              filteredThreads.map((t) => {
                const selected = activeThread?.id === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setActiveThreadId(t.id)}
                    className={`w-full text-left p-3.5 flex items-start gap-3 transition-colors cursor-pointer ${
                      selected
                        ? 'bg-blue-50/70 dark:bg-blue-950/30'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <Avatar src={t.customerAvatar} name={t.customerName} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                          {t.customerName}
                        </span>
                        <span className="text-[10px] text-slate-400 tabular-nums shrink-0">
                          {formatRelativeTime(t.updatedAtMs)}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                        {t.lastMessageText}
                      </p>
                      <div className="flex items-center justify-between gap-2 mt-1.5 text-[10px]">
                        <span className="font-semibold text-slate-500 dark:text-slate-400 capitalize">
                          {t.status}
                          {t.labels.length > 0 ? ` · ${t.labels[0]}` : ''}
                        </span>
                        {t.unreadByBusiness && (
                          <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0" aria-label="Unread message" />
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Center Active Conversation */}
        <div className="lg:col-span-8 xl:col-span-6 flex flex-col border-b xl:border-b-0 xl:border-r border-slate-200 dark:border-slate-800">
          {!activeThread ? (
            <div className="flex-1 flex flex-col items-center justify-center p-10 text-center space-y-2">
              <MessageSquare className="w-8 h-8 text-slate-300 dark:text-slate-700" aria-hidden="true" />
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Select a customer inquiry
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm">
                Messages in this inbox belong strictly to @{businessProfile.slug} and are shared only with authorized business team members.
              </p>
            </div>
          ) : (
            <>
              <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Avatar
                    src={activeThread.customerAvatar}
                    name={activeThread.customerName}
                    size="sm"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                      {activeThread.customerName}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      @{activeThread.customerHandle || 'customer'}
                    </p>
                  </div>
                </div>
                {canRespond && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <select
                      aria-label="Conversation status"
                      value={activeThread.status}
                      onChange={(e) =>
                        void handleUpdateThreadStatus(e.target.value as BusinessChatStatus)
                      }
                      className="min-h-[34px] px-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-xs font-semibold"
                    >
                      <option value="open">Open</option>
                      <option value="pending">Pending</option>
                      <option value="resolved">Resolved</option>
                    </select>
                  </div>
                )}
              </div>

              {activeThread.linkedProductTitle && (
                <div className="px-4 py-2 bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 text-xs">
                  <span className="truncate text-slate-700 dark:text-slate-300">
                    Product inquiry: <strong>{activeThread.linkedProductTitle}</strong>{' '}
                    {activeThread.linkedProductPrice ? `(${activeThread.linkedProductPrice})` : ''}
                  </span>
                  {activeThread.linkedProductId && onOpenProduct && (
                    <button
                      type="button"
                      onClick={() => onOpenProduct(activeThread.linkedProductId!)}
                      className="text-blue-600 dark:text-blue-400 font-semibold hover:underline cursor-pointer shrink-0"
                    >
                      View
                    </button>
                  )}
                </div>
              )}

              <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[420px]">
                {messages.map((msg) => {
                  const isBusinessMsg = msg.senderType === 'business';
                  const isSystemMsg = msg.senderType === 'system';

                  if (isSystemMsg) {
                    return (
                      <div key={msg.id} className="text-center py-1">
                        <p className="inline-block max-w-md px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-[11px] text-slate-600 dark:text-slate-300">
                          {msg.text}
                        </p>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${isBusinessMsg ? 'items-end' : 'items-start'}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-xs sm:text-sm space-y-2 ${
                          isBusinessMsg
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100'
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                        {msg.productAttachment && (
                          <button
                            type="button"
                            onClick={() => onOpenProduct?.(msg.productAttachment!.productId)}
                            className="w-full text-left p-2 rounded-xl bg-white/95 dark:bg-slate-900 text-slate-900 dark:text-white flex items-center gap-2.5 border border-slate-200 dark:border-slate-700 cursor-pointer"
                          >
                            {msg.productAttachment.imageUrl ? (
                              <img
                                src={msg.productAttachment.imageUrl}
                                alt={msg.productAttachment.title}
                                className="w-10 h-10 rounded-lg object-cover shrink-0"
                              />
                            ) : (
                              <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                                <Package className="w-4 h-4 text-slate-400" aria-hidden="true" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="text-xs font-bold truncate">
                                {msg.productAttachment.title}
                              </p>
                              <p className="text-[11px] text-blue-600 dark:text-blue-400 font-semibold tabular-nums">
                                {formatCurrencyCents(
                                  msg.productAttachment.priceCents,
                                  msg.productAttachment.currency
                                )}
                              </p>
                            </div>
                          </button>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400 mt-1 px-1 tabular-nums">
                        {msg.senderName} · {formatRelativeTime(msg.createdAtMs)}
                      </span>
                    </div>
                  );
                })}
                <div ref={messageEndRef} />
              </div>

              {canRespond ? (
                <div className="p-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
                  {showQuickReplies && (
                    <div className="flex flex-wrap gap-1.5 pb-1">
                      {(messagingSettings?.quickReplies || []).length === 0 ? (
                        <span className="text-[11px] text-slate-500">
                          No quick replies saved yet. Open Automations to add templates.
                        </span>
                      ) : (
                        messagingSettings!.quickReplies.map((qr) => (
                          <button
                            key={qr.id}
                            type="button"
                            onClick={() => {
                              setDraft((prev) => (prev ? `${prev} ${qr.text}` : qr.text));
                              setShowQuickReplies(false);
                            }}
                            className="min-h-[30px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-[11px] font-semibold hover:border-blue-500 cursor-pointer"
                          >
                            {qr.label}
                          </button>
                        ))
                      )}
                    </div>
                  )}

                  {showProductPicker && (
                    <div className="max-h-40 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 divide-y divide-slate-200 dark:divide-slate-800">
                      {products.length === 0 ? (
                        <p className="p-3 text-xs text-slate-500">
                          No catalog products found for this business yet.
                        </p>
                      ) : (
                        products.slice(0, 12).map((prod) => (
                          <button
                            key={prod.id}
                            type="button"
                            onClick={() => void handleShareProduct(prod)}
                            className="w-full p-2.5 text-left flex items-center justify-between gap-2 hover:bg-white dark:hover:bg-slate-900 cursor-pointer"
                          >
                            <span className="text-xs font-semibold truncate">{prod.title}</span>
                            <span className="text-xs font-bold text-blue-600 dark:text-blue-400 tabular-nums shrink-0">
                              {formatCurrencyCents(prod.priceCents, prod.currency)}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  )}

                  <form onSubmit={handleSendText} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowQuickReplies((v) => !v);
                        setShowProductPicker(false);
                      }}
                      title="Quick Replies"
                      className="min-h-[42px] min-w-[42px] px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer shrink-0"
                    >
                      Templates
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowProductPicker((v) => !v);
                        setShowQuickReplies(false);
                      }}
                      aria-label="Share catalog product"
                      title="Attach product from catalog"
                      className="min-h-[42px] min-w-[42px] rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer shrink-0"
                    >
                      <ShoppingBag className="w-4 h-4" aria-hidden="true" />
                    </button>
                    <input
                      type="text"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder={`Reply as ${businessProfile.displayName}...`}
                      maxLength={2000}
                      className="flex-1 min-w-0 min-h-[42px] px-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                    <button
                      type="submit"
                      disabled={sending || !draft.trim()}
                      aria-label="Send reply"
                      className="min-h-[42px] px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shrink-0"
                    >
                      <Send className="w-4 h-4" aria-hidden="true" />
                      <span className="hidden sm:inline">Send</span>
                    </button>
                  </form>
                </div>
              ) : (
                <div className="p-3 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                  Read-only Viewer access — Editors, Admins, or Owners can respond to customers.
                </div>
              )}
            </>
          )}
        </div>

        {/* Right Customer Context & Assignment Sidebar */}
        <div className="xl:col-span-3 p-4 space-y-4 bg-slate-50/60 dark:bg-slate-950/40">
          {!activeThread ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Customer details, conversation labels, assignee, and past orders appear here when a thread is selected.
            </p>
          ) : (
            <>
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Customer Profile
                </h3>
                <div className="mt-2 flex items-center gap-2.5">
                  <Avatar
                    src={activeThread.customerAvatar}
                    name={activeThread.customerName}
                    size="sm"
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                      {activeThread.customerName}
                    </p>
                    <p className="text-[11px] text-slate-500 truncate">
                      @{activeThread.customerHandle || 'customer'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Assigned Staff
                </label>
                <div className="flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
                  <select
                    aria-label="Assign conversation to team member"
                    disabled={!canRespond}
                    value={activeThread.assignedUid}
                    onChange={(e) => void handleAssignThread(e.target.value)}
                    className="flex-1 min-h-[36px] px-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                  >
                    <option value="">Unassigned</option>
                    {members.map((m) => (
                      <option key={m.uid} value={m.uid}>
                        {m.displayName || m.handle || m.uid} ({m.role})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Conversation Labels</span>
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {PRESET_LABELS.map((label) => {
                    const active = activeThread.labels.includes(label);
                    return (
                      <button
                        key={label}
                        type="button"
                        disabled={!canRespond}
                        onClick={() => void handleToggleLabel(label)}
                        className={`min-h-[28px] px-2.5 rounded-lg text-[11px] font-semibold border cursor-pointer transition-colors ${
                          active
                            ? 'bg-blue-600 border-blue-600 text-white'
                            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
                {canRespond && (
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={customLabel}
                      onChange={(e) => setCustomLabel(e.target.value)}
                      placeholder="Custom label"
                      maxLength={32}
                      className="flex-1 min-w-0 min-h-[32px] px-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => void handleToggleLabel(customLabel)}
                      className="min-h-[32px] px-2.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold cursor-pointer"
                    >
                      Add
                    </button>
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 tabular-nums">
                  Customer Orders ({customerOrders.length})
                </p>
                {customerOrders.length === 0 ? (
                  <p className="text-[11px] text-slate-500">No orders placed with this store yet.</p>
                ) : (
                  <div className="space-y-2">
                    {customerOrders.slice(0, 4).map((ord) => (
                      <div
                        key={ord.id}
                        className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-[11px] space-y-0.5"
                      >
                        <div className="flex items-center justify-between font-semibold">
                          <span>#{ord.id.slice(-6)}</span>
                          <span className="tabular-nums">
                            {formatCurrencyCents(ord.totalCents, ord.currency)}
                          </span>
                        </div>
                        <p className="text-slate-500 capitalize">
                          {ord.status.toLowerCase()} · {ord.paymentStatus}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Automation & Quick Replies Modal */}
      {showAutomationModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Messaging automation and quick replies"
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <form
            onSubmit={handleSaveAutomation}
            className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4 max-h-[90dvh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-bold">
                Automated Messages &amp; Quick Replies
              </h2>
              <button
                type="button"
                onClick={() => setShowAutomationModal(false)}
                aria-label="Close automation modal"
                className="min-h-[36px] min-w-[36px] rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={welcomeEnabled}
                  onChange={(e) => setWelcomeEnabled(e.target.checked)}
                />
                <span>Send automated welcome message to new customer inquiries</span>
              </label>
              <textarea
                rows={2}
                maxLength={500}
                value={welcomeMessage}
                onChange={(e) => setWelcomeMessage(e.target.value)}
                placeholder="Thanks for reaching out! Tell us how we can help."
                className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
              />
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={awayEnabled}
                  onChange={(e) => setAwayEnabled(e.target.checked)}
                />
                <span>Enable away message when team is offline</span>
              </label>
              <textarea
                rows={2}
                maxLength={500}
                value={awayMessage}
                onChange={(e) => setAwayMessage(e.target.value)}
                placeholder="We are currently away and will respond shortly."
                className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
              />
            </div>

            <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <p className="text-xs font-bold">Quick Reply Templates</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  type="text"
                  value={newQuickLabel}
                  onChange={(e) => setNewQuickLabel(e.target.value)}
                  placeholder="Short label"
                  maxLength={60}
                  className="min-h-[36px] px-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
                />
                <input
                  type="text"
                  value={newQuickText}
                  onChange={(e) => setNewQuickText(e.target.value)}
                  placeholder="Message body"
                  maxLength={500}
                  className="sm:col-span-2 min-h-[36px] px-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
                />
              </div>
              <button
                type="button"
                onClick={handleAddQuickReply}
                className="min-h-[34px] px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Add Quick Reply</span>
              </button>

              {quickRepliesDraft.length > 0 && (
                <div className="space-y-1.5 max-h-36 overflow-y-auto">
                  {quickRepliesDraft.map((qr) => (
                    <div
                      key={qr.id}
                      className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-950 text-xs"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{qr.label}</p>
                        <p className="text-slate-500 truncate">{qr.text}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setQuickRepliesDraft((prev) => prev.filter((item) => item.id !== qr.id))
                        }
                        aria-label={`Remove quick reply ${qr.label}`}
                        className="text-slate-400 hover:text-rose-600 cursor-pointer shrink-0"
                      >
                        <X className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAutomationModal(false)}
                className="min-h-[38px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingSettings}
                className="min-h-[38px] px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
              >
                <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                <span>{savingSettings ? 'Saving...' : 'Save Settings'}</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
