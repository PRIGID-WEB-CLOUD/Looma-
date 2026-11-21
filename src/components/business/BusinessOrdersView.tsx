import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  MessageSquare,
  Package,
  Store,
} from 'lucide-react';
import type { BusinessMembershipRole, BusinessProfile } from '../../types/business';
import type {
  MarketplaceOrder,
  OrderStatus,
  PaymentStatus,
} from '../../types/marketplace';
import {
  subscribeSellerMarketplaceOrders,
  updateSellerMarketplaceOrderStatus,
} from '../../services/commerce';
import { formatCurrencyCents } from '../../services/marketplaceCatalogAssets';
import { formatRelativeTime } from '../../utils/socialLogic';

interface BusinessOrdersViewProps {
  businessProfile: BusinessProfile;
  role: BusinessMembershipRole;
  viewerUid: string;
  onMessageCustomer: (order: MarketplaceOrder) => Promise<void> | void;
  onActivateStorefront?: () => void;
}

const ORDER_STATUSES: OrderStatus[] = [
  'PENDING',
  'CONFIRMED',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
];

const PAYMENT_STATUSES: PaymentStatus[] = ['pending', 'paid', 'refunded'];

export function BusinessOrdersView({
  businessProfile,
  role,
  viewerUid,
  onMessageCustomer,
  onActivateStorefront,
}: BusinessOrdersViewProps) {
  const [orders, setOrders] = useState<MarketplaceOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [permissionNotice, setPermissionNotice] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'ALL'>('ALL');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [messagingOrderId, setMessagingOrderId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const isStoreOwner = Boolean(viewerUid && viewerUid === businessProfile.ownerUid);
  const canUpdateOrders = isStoreOwner && (role === 'OWNER' || role === 'ADMIN');

  useEffect(() => {
    if (!businessProfile.commerceStoreId) {
      setOrders([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setPermissionNotice(null);
    return subscribeSellerMarketplaceOrders(
      businessProfile.ownerUid,
      (items) => {
        setOrders(
          items.filter((o) => o.storeId === businessProfile.commerceStoreId)
        );
        setLoading(false);
      },
      () => {
        setOrders([]);
        setLoading(false);
        setPermissionNotice(
          'Customer orders ledger is scoped to the Business Owner under Firestore security rules. You can still manage customer inquiries from the Business Inbox.'
        );
      }
    );
  }, [businessProfile.commerceStoreId, businessProfile.ownerUid]);

  const filteredOrders = useMemo(() => {
    if (statusFilter === 'ALL') return orders;
    return orders.filter((o) => o.status === statusFilter);
  }, [orders, statusFilter]);

  const handleStatusChange = async (
    orderId: string,
    updates: { status?: OrderStatus; paymentStatus?: PaymentStatus }
  ) => {
    setError(null);
    setNotice(null);
    setUpdatingId(orderId);
    try {
      await updateSellerMarketplaceOrderStatus(orderId, updates);
      setNotice('Order status updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update order.');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleMessageClick = async (order: MarketplaceOrder) => {
    setError(null);
    setMessagingOrderId(order.id);
    try {
      await onMessageCustomer(order);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to open customer chat.');
    } finally {
      setMessagingOrderId(null);
    }
  };

  if (!businessProfile.commerceStoreId) {
    return (
      <section aria-label="Business Orders Setup" className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-10 text-center space-y-3">
        <Store className="w-8 h-8 text-slate-400 mx-auto" aria-hidden="true" />
        <p className="text-sm font-bold text-slate-900 dark:text-white">
          Storefront Not Activated
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
          Activate a storefront in the Catalog section to start accepting and managing customer orders.
        </p>
        {onActivateStorefront && (
          <button
            type="button"
            onClick={onActivateStorefront}
            className="min-h-[40px] px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
          >
            Go to Catalog Setup
          </button>
        )}
      </section>
    );
  }

  return (
    <section aria-label="Business Orders" className="space-y-5">
      <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
            Customer Orders ({orders.length})
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Track order fulfillment, payment reconciliation, and direct customer threads.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
          {(['ALL', ...ORDER_STATUSES] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setStatusFilter(tab)}
              className={`min-h-[32px] px-3 rounded-lg text-xs font-semibold cursor-pointer ${
                statusFilter === tab
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {tab === 'ALL' ? 'All' : tab.charAt(0) + tab.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div role="alert" className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-2 w-full">
          <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{notice}</span>
        </div>
      )}
      {permissionNotice && (
        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 text-xs text-amber-800 dark:text-amber-200">
          {permissionNotice}
        </div>
      )}

      {loading ? (
        <div className="space-y-3 animate-pulse">
          {[1, 2].map((n) => (
            <div key={n} className="h-32 rounded-3xl bg-slate-200 dark:bg-slate-800" />
          ))}
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-10 text-center space-y-2">
          <Package className="w-8 h-8 text-slate-400 mx-auto" aria-hidden="true" />
          <p className="text-sm font-semibold">No orders matching this filter</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredOrders.map((order) => {
            const busy = updatingId === order.id;
            return (
              <div
                key={order.id}
                className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-display text-sm font-bold text-slate-900 dark:text-white">
                        Order #{order.id.slice(-8)}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        · {order.buyerName}
                      </span>
                      <span className="text-xs text-slate-400 tabular-nums">
                        · {formatRelativeTime(order.createdAtMs)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Ship to: {order.shippingName} · {order.shippingCity} ({order.shippingAddress})
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display text-base font-bold text-slate-900 dark:text-white tabular-nums mr-2">
                      {formatCurrencyCents(order.totalCents, order.currency)}
                    </span>
                    <button
                      type="button"
                      disabled={messagingOrderId === order.id}
                      onClick={() => void handleMessageClick(order)}
                      className="min-h-[38px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                    >
                      <MessageSquare className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                      <span>
                        {messagingOrderId === order.id
                          ? 'Opening...'
                          : 'Message Customer'}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Items */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {order.items.map((item, idx) => (
                    <div
                      key={`${order.id}_item_${idx}`}
                      className="flex items-center gap-3 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 p-2.5 text-xs"
                    >
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt={item.title}
                          className="w-11 h-11 rounded-xl object-cover shrink-0"
                        />
                      ) : (
                        <div className="w-11 h-11 rounded-xl bg-slate-200 dark:bg-slate-800 shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-slate-900 dark:text-white truncate">
                          {item.title}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                          Qty {item.quantity} · {formatCurrencyCents(item.priceCents, order.currency)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Status controls */}
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-4 text-xs">
                  <div className="flex items-center gap-2">
                    <label htmlFor={`order-status-${order.id}`} className="font-semibold text-slate-600 dark:text-slate-300">
                      Fulfillment:
                    </label>
                    <select
                      id={`order-status-${order.id}`}
                      disabled={!canUpdateOrders || busy}
                      value={order.status}
                      onChange={(e) =>
                        void handleStatusChange(order.id, {
                          status: e.target.value as OrderStatus,
                        })
                      }
                      className="min-h-[36px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-medium disabled:opacity-60"
                    >
                      {ORDER_STATUSES.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <label htmlFor={`order-pay-${order.id}`} className="font-semibold text-slate-600 dark:text-slate-300">
                      Payment:
                    </label>
                    <select
                      id={`order-pay-${order.id}`}
                      disabled={!canUpdateOrders || busy}
                      value={order.paymentStatus}
                      onChange={(e) =>
                        void handleStatusChange(order.id, {
                          paymentStatus: e.target.value as PaymentStatus,
                        })
                      }
                      className="min-h-[36px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-medium disabled:opacity-60"
                    >
                      {PAYMENT_STATUSES.map((ps) => (
                        <option key={ps} value={ps}>
                          {ps.toUpperCase()}
                        </option>
                      ))}
                    </select>
                  </div>

                  {order.note && (
                    <p className="text-slate-500 dark:text-slate-400">
                      Note: <span className="text-slate-700 dark:text-slate-200">{order.note}</span>
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
