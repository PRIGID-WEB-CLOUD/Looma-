import { useEffect, useState } from 'react';
import {
  ArrowRight,
  ExternalLink,
  Megaphone,
  MessageSquare,
  Package,
  Plus,
  Settings,
  ShoppingBag,
  Store,
  Users,
} from 'lucide-react';
import type {
  BusinessMembership,
  BusinessMembershipRole,
  BusinessProfile,
  BusinessWorkspaceSection,
} from '../../types/business';
import type { BusinessChatThread } from '../../types/businessChat';
import type { MarketplaceOrder, MarketplaceProduct } from '../../types/marketplace';
import type { Post } from '../../types/social';
import {
  subscribeSellerMarketplaceOrders,
  subscribeStoreMarketplaceProducts,
} from '../../services/commerce';
import { formatCurrencyCents } from '../../services/marketplaceCatalogAssets';
import { subscribeBusinessMembers } from '../../services/businessProfiles';
import { formatRelativeTime } from '../../utils/socialLogic';
import { Avatar } from '../Avatar';

interface BusinessDashboardViewProps {
  businessProfile: BusinessProfile;
  role: BusinessMembershipRole;
  viewerUid: string;
  posts: Post[];
  inboxThreads: BusinessChatThread[];
  portalBusy: boolean;
  onSelectSection: (section: BusinessWorkspaceSection, threadId?: string) => void;
  onCreateBrandPost: () => void;
  onLaunchSellerPortal: () => Promise<void> | void;
  onOpenPublicBusinessPage: () => void;
}

export function BusinessDashboardView({
  businessProfile,
  role,
  viewerUid,
  posts,
  inboxThreads,
  portalBusy,
  onSelectSection,
  onCreateBrandPost,
  onLaunchSellerPortal,
  onOpenPublicBusinessPage,
}: BusinessDashboardViewProps) {
  const [products, setProducts] = useState<MarketplaceProduct[]>([]);
  const [orders, setOrders] = useState<MarketplaceOrder[]>([]);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [members, setMembers] = useState<BusinessMembership[]>([]);

  const isAdminOrOwner = role === 'OWNER' || role === 'ADMIN';
  const canEdit = role === 'OWNER' || role === 'ADMIN' || role === 'EDITOR';

  useEffect(() => {
    if (!businessProfile.commerceStoreId) {
      setProducts([]);
      return;
    }
    return subscribeStoreMarketplaceProducts(
      businessProfile.commerceStoreId,
      businessProfile.ownerUid,
      viewerUid,
      setProducts,
      () => setProducts([])
    );
  }, [businessProfile.commerceStoreId, businessProfile.ownerUid, viewerUid]);

  useEffect(() => {
    if (!businessProfile.commerceStoreId) {
      setOrders([]);
      setOrdersError(null);
      return;
    }
    setOrdersError(null);
    return subscribeSellerMarketplaceOrders(
      businessProfile.ownerUid,
      (items) => {
        setOrders(items.filter((o) => o.storeId === businessProfile.commerceStoreId));
      },
      () => {
        setOrders([]);
        setOrdersError(
          'Live order ledger is restricted to the Store Owner under Firestore security rules.'
        );
      }
    );
  }, [businessProfile.commerceStoreId, businessProfile.ownerUid]);

  useEffect(() => {
    return subscribeBusinessMembers(businessProfile.id, setMembers);
  }, [businessProfile.id]);

  const brandPostsCount = posts.filter(
    (p) =>
      p.businessProfileId === businessProfile.id ||
      (p.authorType === 'business' && p.authorId === businessProfile.id)
  ).length;

  const unreadInboxCount = inboxThreads.filter((t) => t.unreadByBusiness).length;
  const openOrdersCount = orders.filter(
    (o) => o.status === 'PENDING' || o.status === 'CONFIRMED'
  ).length;

  return (
    <section aria-label="Business Overview Dashboard" className="space-y-6">
      {/* Header Banner */}
      <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-display text-lg sm:text-xl font-bold text-slate-900 dark:text-white truncate">
            {businessProfile.displayName} Workspace
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            @{businessProfile.slug} · {businessProfile.category} · {members.length}{' '}
            {members.length === 1 ? 'Team Member' : 'Team Members'} · Role: {role}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {canEdit && (
            <button
              type="button"
              onClick={onCreateBrandPost}
              className="min-h-[40px] px-4 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold inline-flex items-center gap-1.5 hover:opacity-90 cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>Create Brand Post</span>
            </button>
          )}
          <button
            type="button"
            onClick={onOpenPublicBusinessPage}
            className="min-h-[40px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Public Page</span>
          </button>
          {isAdminOrOwner && (
            <button
              type="button"
              disabled={portalBusy}
              onClick={() => void onLaunchSellerPortal()}
              title={portalBusy ? 'Authorizing...' : 'Seller Portal'}
              aria-label={portalBusy ? 'Authorizing...' : 'Seller Portal'}
              className="min-h-[40px] w-[40px] rounded-xl bg-blue-600 hover:bg-blue-700 text-white inline-flex items-center justify-center cursor-pointer disabled:opacity-60 shrink-0"
            >
              <Store className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 tabular-nums">
        <button
          type="button"
          onClick={() => onSelectSection('posts')}
          className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 text-left hover:border-blue-300 dark:hover:border-blue-800 transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Followers</span>
            <Users className="w-4 h-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
          </div>
          <p className="font-display text-2xl font-bold text-slate-900 dark:text-white mt-2">
            {businessProfile.followersCount}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            {brandPostsCount} published brand {brandPostsCount === 1 ? 'post' : 'posts'}
          </p>
        </button>

        <button
          type="button"
          onClick={() => onSelectSection('catalog')}
          className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 text-left hover:border-blue-300 dark:hover:border-blue-800 transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Catalog Products</span>
            <ShoppingBag className="w-4 h-4 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
          </div>
          <p className="font-display text-2xl font-bold text-slate-900 dark:text-white mt-2">
            {products.length}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            {businessProfile.commerceStoreId ? 'Storefront active' : 'Storefront not activated'}
          </p>
        </button>

        <button
          type="button"
          onClick={() => onSelectSection('orders')}
          className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 text-left hover:border-blue-300 dark:hover:border-blue-800 transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Orders</span>
            <Package className="w-4 h-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          </div>
          <p className="font-display text-2xl font-bold text-slate-900 dark:text-white mt-2">
            {orders.length}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            {openOrdersCount} open to fulfill
          </p>
        </button>

        <button
          type="button"
          onClick={() => onSelectSection('inbox')}
          className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 text-left hover:border-blue-300 dark:hover:border-blue-800 transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Unread Inquiries</span>
            <MessageSquare className="w-4 h-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
          </div>
          <p className="font-display text-2xl font-bold text-slate-900 dark:text-white mt-2">
            {unreadInboxCount}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            {inboxThreads.length} total customer {inboxThreads.length === 1 ? 'thread' : 'threads'}
          </p>
        </button>
      </div>

      {/* Operational Split: Recent Orders & Customer Inquiries */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">
              Recent Customer Orders
            </h3>
            <button
              type="button"
              onClick={() => onSelectSection('orders')}
              className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              <span>Manage Orders</span>
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>

          {ordersError ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 p-4">
              {ordersError}
            </p>
          ) : orders.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 p-6 text-center">
              No marketplace orders recorded for this business storefront yet.
            </p>
          ) : (
            <div className="space-y-2.5">
              {orders.slice(0, 5).map((ord) => (
                <div
                  key={ord.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 px-3.5 py-2.5 text-xs"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 dark:text-white truncate">
                      {ord.buyerName} · {ord.items.length} {ord.items.length === 1 ? 'item' : 'items'}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                      #{ord.id.slice(-8)} · {ord.status} · {formatRelativeTime(ord.createdAtMs)}
                    </p>
                  </div>
                  <span className="font-bold text-slate-900 dark:text-white tabular-nums shrink-0">
                    {formatCurrencyCents(ord.totalCents, ord.currency)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">
              Customer Inbox Queue
            </h3>
            <button
              type="button"
              onClick={() => onSelectSection('inbox')}
              className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              <span>Open Business Inbox</span>
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>

          {inboxThreads.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 p-6 text-center">
              No customer conversations yet. Customers can message this business from your Business Profile or products.
            </p>
          ) : (
            <div className="space-y-2.5">
              {inboxThreads.slice(0, 5).map((thread) => (
                <button
                  key={thread.id}
                  type="button"
                  onClick={() => onSelectSection('inbox', thread.id)}
                  className="w-full text-left flex items-center justify-between gap-3 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 hover:bg-slate-100 dark:hover:bg-slate-800/70 px-3.5 py-2.5 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Avatar
                      src={thread.customerAvatar}
                      name={thread.customerName}
                      size="sm"
                    />
                    <div className="min-w-0 text-xs">
                      <p className="font-semibold text-slate-900 dark:text-white truncate">
                        {thread.customerName}
                        {thread.unreadByBusiness && (
                          <span className="ml-2 text-[11px] font-bold text-blue-600 dark:text-blue-400">
                            · Unread
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {thread.lastMessageText || 'No messages yet'}
                      </p>
                    </div>
                  </div>
                  <span className="text-[11px] text-slate-400 shrink-0 tabular-nums">
                    {formatRelativeTime(thread.updatedAtMs)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick Operations Bar */}
      <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
        <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white mb-3">
          Quick Business Actions
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          {[
            { id: 'catalog' as const, label: 'Catalog', icon: ShoppingBag },
            { id: 'orders' as const, label: 'Orders', icon: Package },
            { id: 'inbox' as const, label: 'Business Inbox', icon: MessageSquare },
            { id: 'posts' as const, label: 'Brand Posts', icon: Megaphone },
            { id: 'team' as const, label: 'Team & Roles', icon: Users },
            { id: 'settings' as const, label: 'Settings & Verify', icon: Settings },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectSection(item.id)}
                className="min-h-[48px] px-3 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/70 flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer transition-colors"
              >
                <Icon className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" aria-hidden="true" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
