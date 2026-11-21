import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import {
  emitBusinessNotification,
  getBusinessMessagingSettings,
} from './businessProfiles';
import type {
  BusinessChatAnalytics,
  BusinessChatMessage,
  BusinessChatMessageType,
  BusinessChatProductAttachment,
  BusinessChatSenderType,
  BusinessChatStatus,
  BusinessChatThread,
} from '../types/businessChat';

function timestampToMs(val: unknown): number {
  if (val instanceof Timestamp) return val.toMillis();
  if (typeof val === 'number') return val;
  if (
    val &&
    typeof val === 'object' &&
    'toMillis' in val &&
    typeof (val as { toMillis: () => number }).toMillis === 'function'
  ) {
    return (val as { toMillis: () => number }).toMillis();
  }
  return Date.now();
}

function makeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now()}_${rand}`;
}

export function buildBusinessChatId(businessProfileId: string, customerUid: string): string {
  const cleanBp = businessProfileId.replace(/[^a-zA-Z0-9_-]/g, '');
  const cleanCust = customerUid.replace(/[^a-zA-Z0-9_-]/g, '');
  return `bchat_${cleanBp}_${cleanCust}`.slice(0, 128);
}

function mapBusinessChatThread(id: string, d: Record<string, unknown>): BusinessChatThread {
  const statusRaw = String(d.status || 'open');
  const status: BusinessChatStatus =
    statusRaw === 'pending' || statusRaw === 'resolved' ? statusRaw : 'open';
  const senderTypeRaw = String(d.lastMessageSenderType || 'customer');
  const lastMessageSenderType: BusinessChatSenderType =
    senderTypeRaw === 'business' || senderTypeRaw === 'system' ? senderTypeRaw : 'customer';

  return {
    id: String(d.id || id),
    businessProfileId: String(d.businessProfileId || ''),
    businessName: String(d.businessName || 'Business'),
    businessAvatar: String(d.businessAvatar || ''),
    businessSlug: String(d.businessSlug || 'business'),
    customerUid: String(d.customerUid || ''),
    customerName: String(d.customerName || 'Customer'),
    customerAvatar: String(d.customerAvatar || ''),
    customerHandle: String(d.customerHandle || ''),
    participantIds: Array.isArray(d.participantIds) ? d.participantIds.map(String) : [],
    status,
    labels: Array.isArray(d.labels) ? d.labels.map(String) : [],
    assignedUid: String(d.assignedUid || ''),
    ...(typeof d.linkedProductId === 'string' && d.linkedProductId
      ? { linkedProductId: d.linkedProductId }
      : {}),
    ...(typeof d.linkedProductTitle === 'string' && d.linkedProductTitle
      ? { linkedProductTitle: d.linkedProductTitle }
      : {}),
    ...(typeof d.linkedProductPrice === 'string' && d.linkedProductPrice
      ? { linkedProductPrice: d.linkedProductPrice }
      : {}),
    ...(typeof d.linkedProductImage === 'string' && d.linkedProductImage
      ? { linkedProductImage: d.linkedProductImage }
      : {}),
    ...(typeof d.linkedOrderId === 'string' && d.linkedOrderId
      ? { linkedOrderId: d.linkedOrderId }
      : {}),
    lastMessageText: String(d.lastMessageText || ''),
    lastMessageSenderId: String(d.lastMessageSenderId || ''),
    lastMessageSenderType,
    unreadByBusiness: Boolean(d.unreadByBusiness),
    unreadByCustomer: Boolean(d.unreadByCustomer),
    createdAtMs: timestampToMs(d.createdAt),
    updatedAtMs: timestampToMs(d.updatedAt),
  };
}

function mapBusinessChatMessage(id: string, d: Record<string, unknown>): BusinessChatMessage {
  const senderTypeRaw = String(d.senderType || 'customer');
  const senderType: BusinessChatSenderType =
    senderTypeRaw === 'business' || senderTypeRaw === 'system' ? senderTypeRaw : 'customer';
  const msgTypeRaw = String(d.messageType || 'text');
  const messageType: BusinessChatMessageType =
    msgTypeRaw === 'product' ||
    msgTypeRaw === 'order' ||
    msgTypeRaw === 'auto_welcome' ||
    msgTypeRaw === 'auto_away'
      ? msgTypeRaw
      : 'text';

  let productAttachment: BusinessChatProductAttachment | undefined;
  if (d.productAttachment && typeof d.productAttachment === 'object') {
    const p = d.productAttachment as Record<string, unknown>;
    if (typeof p.productId === 'string' && p.productId) {
      productAttachment = {
        productId: String(p.productId),
        title: String(p.title || 'Product'),
        priceCents: Number(p.priceCents || 0),
        currency: String(p.currency || 'USD'),
        imageUrl: String(p.imageUrl || ''),
        ...(typeof p.storeSlug === 'string' && p.storeSlug ? { storeSlug: p.storeSlug } : {}),
      };
    }
  }

  return {
    id: String(d.id || id),
    chatId: String(d.chatId || ''),
    businessProfileId: String(d.businessProfileId || ''),
    customerUid: String(d.customerUid || ''),
    senderUid: String(d.senderUid || ''),
    senderType,
    senderName: String(d.senderName || 'Member'),
    senderAvatar: String(d.senderAvatar || ''),
    text: String(d.text || ''),
    messageType,
    ...(productAttachment ? { productAttachment } : {}),
    ...(typeof d.orderId === 'string' && d.orderId ? { orderId: d.orderId } : {}),
    participantIds: Array.isArray(d.participantIds) ? d.participantIds.map(String) : [],
    createdAtMs: timestampToMs(d.createdAt),
  };
}

async function resolveStaffUidsForBusiness(
  bpId: string,
  fallbackOwnerUid: string
): Promise<string[]> {
  try {
    const q = query(
      collection(db, 'businessMemberships'),
      where('businessProfileId', '==', bpId),
      where('status', '==', 'ACTIVE')
    );
    const snap = await getDocs(q);
    const uids = snap.docs
      .map((d) => String(d.data()?.uid || ''))
      .filter(Boolean);
    if (fallbackOwnerUid && !uids.includes(fallbackOwnerUid)) {
      uids.unshift(fallbackOwnerUid);
    }
    return Array.from(new Set(uids));
  } catch {
    return fallbackOwnerUid ? [fallbackOwnerUid] : [];
  }
}

export async function startOrOpenBusinessInquiry(params: {
  businessProfileId: string;
  businessName: string;
  businessAvatar: string;
  businessSlug: string;
  businessOwnerUid: string;
  customerUid: string;
  customerName: string;
  customerAvatar: string;
  customerHandle: string;
  actorUid: string;
  initialMessage?: string;
  linkedProduct?: {
    id: string;
    title: string;
    priceFormatted: string;
    imageUrl?: string;
    priceCents?: number;
    currency?: string;
    storeSlug?: string;
  };
  linkedOrderId?: string;
}): Promise<BusinessChatThread> {
  const chatId = buildBusinessChatId(params.businessProfileId, params.customerUid);

  try {
    // Query safely via allow list predicate so nonexistent threads return empty without permission-denied
    const existingSnap = await getDocs(
      query(
        collection(db, 'businessChats'),
        where('businessProfileId', '==', params.businessProfileId),
        where('customerUid', '==', params.customerUid)
      )
    );

    const existingDoc = existingSnap.docs[0];
    if (existingDoc) {
      const existingThread = mapBusinessChatThread(existingDoc.id, existingDoc.data());
      const staffUids = await resolveStaffUidsForBusiness(
        params.businessProfileId,
        params.businessOwnerUid
      );
      const mergedParticipants = Array.from(
        new Set([params.customerUid, ...existingThread.participantIds, ...staffUids])
      ).slice(0, 50);

      if (params.linkedProduct || params.linkedOrderId || mergedParticipants.length !== existingThread.participantIds.length) {
        await updateDoc(doc(db, 'businessChats', existingThread.id), {
          participantIds: mergedParticipants,
          ...(params.linkedProduct
            ? {
                linkedProductId: params.linkedProduct.id.slice(0, 128),
                linkedProductTitle: params.linkedProduct.title.slice(0, 120),
                linkedProductPrice: params.linkedProduct.priceFormatted.slice(0, 40),
                ...(params.linkedProduct.imageUrl
                  ? { linkedProductImage: params.linkedProduct.imageUrl.slice(0, 600000) }
                  : {}),
              }
            : {}),
          ...(params.linkedOrderId ? { linkedOrderId: params.linkedOrderId.slice(0, 128) } : {}),
          updatedAt: serverTimestamp(),
        });
      }

      if (params.initialMessage?.trim()) {
        await sendBusinessChatMessage({
          thread: {
            ...existingThread,
            participantIds: mergedParticipants,
          },
          senderUid: params.actorUid,
          senderType: params.actorUid === params.customerUid ? 'customer' : 'business',
          senderName: params.actorUid === params.customerUid ? params.customerName : params.businessName,
          senderAvatar: params.actorUid === params.customerUid ? params.customerAvatar : params.businessAvatar,
          text: params.initialMessage.trim(),
          messageType: params.linkedProduct ? 'product' : params.linkedOrderId ? 'order' : 'text',
          ...(params.linkedProduct && typeof params.linkedProduct.priceCents === 'number'
            ? {
                productAttachment: {
                  productId: params.linkedProduct.id,
                  title: params.linkedProduct.title,
                  priceCents: params.linkedProduct.priceCents,
                  currency: params.linkedProduct.currency || 'USD',
                  imageUrl: params.linkedProduct.imageUrl || '',
                  ...(params.linkedProduct.storeSlug
                    ? { storeSlug: params.linkedProduct.storeSlug }
                    : {}),
                },
              }
            : {}),
          ...(params.linkedOrderId ? { orderId: params.linkedOrderId } : {}),
        });
      }

      return {
        ...existingThread,
        participantIds: mergedParticipants,
      };
    }

    const staffUids = await resolveStaffUidsForBusiness(
      params.businessProfileId,
      params.businessOwnerUid
    );
    const participantIds = Array.from(
      new Set([params.customerUid, params.actorUid, ...staffUids].filter(Boolean))
    ).slice(0, 50);

    const previewText = params.initialMessage?.trim().slice(0, 500) || 'Started a conversation';
    const isCustomerActor = params.actorUid === params.customerUid;

    const payload = {
      id: chatId,
      businessProfileId: params.businessProfileId,
      businessName: params.businessName.slice(0, 80) || 'Business',
      businessAvatar: (params.businessAvatar || '').slice(0, 250000),
      businessSlug: params.businessSlug.slice(0, 64) || 'business',
      customerUid: params.customerUid,
      customerName: params.customerName.slice(0, 80) || 'Customer',
      customerAvatar: (params.customerAvatar || '').slice(0, 250000),
      customerHandle: (params.customerHandle || '').slice(0, 64),
      participantIds,
      status: 'open' as const,
      labels: [],
      assignedUid: '',
      ...(params.linkedProduct
        ? {
            linkedProductId: params.linkedProduct.id.slice(0, 128),
            linkedProductTitle: params.linkedProduct.title.slice(0, 120),
            linkedProductPrice: params.linkedProduct.priceFormatted.slice(0, 40),
            ...(params.linkedProduct.imageUrl
              ? { linkedProductImage: params.linkedProduct.imageUrl.slice(0, 600000) }
              : {}),
          }
        : {}),
      ...(params.linkedOrderId ? { linkedOrderId: params.linkedOrderId.slice(0, 128) } : {}),
      lastMessageText: previewText,
      lastMessageSenderId: params.actorUid,
      lastMessageSenderType: isCustomerActor ? ('customer' as const) : ('business' as const),
      unreadByBusiness: isCustomerActor,
      unreadByCustomer: !isCustomerActor,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await setDoc(doc(db, 'businessChats', chatId), payload);

    const now = Date.now();
    const createdThread: BusinessChatThread = {
      id: chatId,
      businessProfileId: payload.businessProfileId,
      businessName: payload.businessName,
      businessAvatar: payload.businessAvatar,
      businessSlug: payload.businessSlug,
      customerUid: payload.customerUid,
      customerName: payload.customerName,
      customerAvatar: payload.customerAvatar,
      customerHandle: payload.customerHandle,
      participantIds,
      status: 'open',
      labels: [],
      assignedUid: '',
      ...(payload.linkedProductId ? { linkedProductId: payload.linkedProductId } : {}),
      ...(payload.linkedProductTitle ? { linkedProductTitle: payload.linkedProductTitle } : {}),
      ...(payload.linkedProductPrice ? { linkedProductPrice: payload.linkedProductPrice } : {}),
      ...(payload.linkedProductImage ? { linkedProductImage: payload.linkedProductImage } : {}),
      ...(payload.linkedOrderId ? { linkedOrderId: payload.linkedOrderId } : {}),
      lastMessageText: payload.lastMessageText,
      lastMessageSenderId: payload.lastMessageSenderId,
      lastMessageSenderType: payload.lastMessageSenderType,
      unreadByBusiness: payload.unreadByBusiness,
      unreadByCustomer: payload.unreadByCustomer,
      createdAtMs: now,
      updatedAtMs: now,
    };

    if (params.initialMessage?.trim()) {
      await sendBusinessChatMessage({
        thread: createdThread,
        senderUid: params.actorUid,
        senderType: isCustomerActor ? 'customer' : 'business',
        senderName: isCustomerActor ? params.customerName : params.businessName,
        senderAvatar: isCustomerActor ? params.customerAvatar : params.businessAvatar,
        text: params.initialMessage.trim(),
        messageType: params.linkedProduct ? 'product' : params.linkedOrderId ? 'order' : 'text',
        ...(params.linkedProduct && typeof params.linkedProduct.priceCents === 'number'
          ? {
              productAttachment: {
                productId: params.linkedProduct.id,
                title: params.linkedProduct.title,
                priceCents: params.linkedProduct.priceCents,
                currency: params.linkedProduct.currency || 'USD',
                imageUrl: params.linkedProduct.imageUrl || '',
                ...(params.linkedProduct.storeSlug
                  ? { storeSlug: params.linkedProduct.storeSlug }
                  : {}),
              },
            }
          : {}),
        ...(params.linkedOrderId ? { orderId: params.linkedOrderId } : {}),
      });
    }

    // Automated Welcome / Away response when a customer initiates a new business conversation
    if (isCustomerActor) {
      const settings = await getBusinessMessagingSettings(params.businessProfileId);
      if (settings.welcomeEnabled && settings.welcomeMessage.trim()) {
        await sendBusinessChatMessage({
          thread: createdThread,
          senderUid: params.actorUid,
          senderType: 'system',
          senderName: params.businessName,
          senderAvatar: params.businessAvatar,
          text: settings.welcomeMessage.trim(),
          messageType: 'auto_welcome',
        }).catch(() => {});
      } else if (settings.awayEnabled && settings.awayMessage.trim()) {
        await sendBusinessChatMessage({
          thread: createdThread,
          senderUid: params.actorUid,
          senderType: 'system',
          senderName: params.businessName,
          senderAvatar: params.businessAvatar,
          text: settings.awayMessage.trim(),
          messageType: 'auto_away',
        }).catch(() => {});
      }
    }

    return createdThread;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `businessChats/${chatId}`);
  }
}

export async function sendBusinessChatMessage(params: {
  thread: BusinessChatThread;
  senderUid: string;
  senderType: BusinessChatSenderType;
  senderName: string;
  senderAvatar: string;
  text: string;
  messageType?: BusinessChatMessageType;
  productAttachment?: BusinessChatProductAttachment;
  orderId?: string;
}): Promise<BusinessChatMessage> {
  const cleanText = params.text.trim().slice(0, 2000);
  if (!cleanText) {
    throw new Error('Enter a message before sending.');
  }
  const messageId = makeId('bmsg');
  const participantIds = Array.from(
    new Set([params.thread.customerUid, ...params.thread.participantIds].filter(Boolean))
  ).slice(0, 50);

  const messageDoc = {
    id: messageId,
    chatId: params.thread.id,
    businessProfileId: params.thread.businessProfileId,
    customerUid: params.thread.customerUid,
    senderUid: params.senderUid,
    senderType: params.senderType,
    senderName: params.senderName.slice(0, 80) || 'Member',
    senderAvatar: (params.senderAvatar || '').slice(0, 250000),
    text: cleanText,
    messageType: params.messageType || 'text',
    ...(params.productAttachment ? { productAttachment: params.productAttachment } : {}),
    ...(params.orderId ? { orderId: params.orderId.slice(0, 128) } : {}),
    participantIds,
    createdAt: serverTimestamp(),
  };

  try {
    const batch = writeBatch(db);
    batch.set(
      doc(db, 'businessChats', params.thread.id, 'messages', messageId),
      messageDoc
    );
    batch.update(doc(db, 'businessChats', params.thread.id), {
      lastMessageText: cleanText.slice(0, 500),
      lastMessageSenderId: params.senderUid,
      lastMessageSenderType: params.senderType,
      unreadByBusiness: params.senderType === 'customer',
      unreadByCustomer: params.senderType === 'business' || params.senderType === 'system',
      updatedAt: serverTimestamp(),
    });
    await batch.commit();

    if (params.senderType === 'customer') {
      void emitBusinessNotification({
        bpId: params.thread.businessProfileId,
        actorId: params.senderUid,
        actorName: params.senderName,
        actorAvatar: params.senderAvatar,
        type: 'system',
        title: `New inquiry from ${params.senderName}`,
        body: cleanText.slice(0, 220),
        targetId: params.thread.id,
      }).catch(() => {});
    }

    return {
      id: messageId,
      chatId: params.thread.id,
      businessProfileId: params.thread.businessProfileId,
      customerUid: params.thread.customerUid,
      senderUid: params.senderUid,
      senderType: params.senderType,
      senderName: messageDoc.senderName,
      senderAvatar: messageDoc.senderAvatar,
      text: cleanText,
      messageType: messageDoc.messageType,
      ...(params.productAttachment ? { productAttachment: params.productAttachment } : {}),
      ...(params.orderId ? { orderId: params.orderId } : {}),
      participantIds,
      createdAtMs: Date.now(),
    };
  } catch (err) {
    handleFirestoreError(
      err,
      OperationType.WRITE,
      `businessChats/${params.thread.id}/messages/${messageId}`
    );
  }
}

export function subscribeBusinessInboxChats(
  bpId: string,
  uid: string,
  onChange: (threads: BusinessChatThread[]) => void
): Unsubscribe {
  if (!bpId || !uid) {
    onChange([]);
    return () => {};
  }
  const q = query(
    collection(db, 'businessChats'),
    where('businessProfileId', '==', bpId),
    where('participantIds', 'array-contains', uid)
  );
  return onSnapshot(
    q,
    (snap) => {
      onChange(
        snap.docs
          .map((d) => mapBusinessChatThread(d.id, d.data()))
          .sort((a, b) => b.updatedAtMs - a.updatedAtMs)
      );
    },
    (err) => {
      console.warn(`Unable to subscribe businessChats for ${bpId}:`, err);
      onChange([]);
    }
  );
}

export function subscribeCustomerBusinessInquiries(
  customerUid: string,
  onChange: (threads: BusinessChatThread[]) => void
): Unsubscribe {
  if (!customerUid) {
    onChange([]);
    return () => {};
  }
  const q = query(
    collection(db, 'businessChats'),
    where('customerUid', '==', customerUid)
  );
  return onSnapshot(
    q,
    (snap) => {
      onChange(
        snap.docs
          .map((d) => mapBusinessChatThread(d.id, d.data()))
          .sort((a, b) => b.updatedAtMs - a.updatedAtMs)
      );
    },
    (err) => {
      console.warn('Unable to subscribe customer businessChats:', err);
      onChange([]);
    }
  );
}

export function subscribeBusinessChatMessages(
  chatId: string,
  uid: string,
  onChange: (messages: BusinessChatMessage[]) => void
): Unsubscribe {
  if (!chatId || !uid) {
    onChange([]);
    return () => {};
  }
  const q = query(
    collection(db, 'businessChats', chatId, 'messages'),
    where('participantIds', 'array-contains', uid)
  );
  return onSnapshot(
    q,
    (snap) => {
      onChange(
        snap.docs
          .map((d) => mapBusinessChatMessage(d.id, d.data()))
          .sort((a, b) => a.createdAtMs - b.createdAtMs)
      );
    },
    (err) => {
      console.warn(`Unable to subscribe businessChats/${chatId}/messages:`, err);
      onChange([]);
    }
  );
}

export async function markBusinessChatRead(
  chatId: string,
  viewerRole: 'customer' | 'business'
): Promise<void> {
  if (!chatId) return;
  try {
    await updateDoc(
      doc(db, 'businessChats', chatId),
      viewerRole === 'business'
        ? { unreadByBusiness: false, updatedAt: serverTimestamp() }
        : { unreadByCustomer: false, updatedAt: serverTimestamp() }
    );
  } catch {
    // Best-effort read marker update
  }
}

export async function updateBusinessChatMeta(
  chatId: string,
  updates: {
    status?: BusinessChatStatus;
    labels?: string[];
    assignedUid?: string;
  }
): Promise<void> {
  try {
    await updateDoc(doc(db, 'businessChats', chatId), {
      ...(updates.status ? { status: updates.status } : {}),
      ...(Array.isArray(updates.labels)
        ? {
            labels: updates.labels
              .map((l) => l.trim().slice(0, 32))
              .filter(Boolean)
              .slice(0, 8),
          }
        : {}),
      ...(typeof updates.assignedUid === 'string'
        ? { assignedUid: updates.assignedUid.slice(0, 128) }
        : {}),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `businessChats/${chatId}`);
  }
}

export async function syncBusinessChatStaffParticipants(
  bpId: string,
  uid: string,
  ownerUid: string
): Promise<void> {
  if (!bpId || !uid) return;
  try {
    const staffUids = await resolveStaffUidsForBusiness(bpId, ownerUid);
    const snap = await getDocs(
      query(
        collection(db, 'businessChats'),
        where('businessProfileId', '==', bpId),
        where('participantIds', 'array-contains', uid)
      )
    );
    if (snap.empty) return;
    const batch = writeBatch(db);
    for (const d of snap.docs) {
      const custUid = String(d.data()?.customerUid || '');
      if (!custUid) continue;
      const merged = Array.from(new Set([custUid, ...staffUids])).slice(0, 50);
      batch.update(d.ref, {
        participantIds: merged,
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  } catch (err) {
    console.warn('Unable to sync business chat staff participants:', err);
  }
}

export function computeBusinessInboxAnalytics(
  threads: BusinessChatThread[],
  currentUid: string
): BusinessChatAnalytics {
  let openCount = 0;
  let pendingCount = 0;
  let resolvedCount = 0;
  let unreadCount = 0;
  let assignedToMeCount = 0;

  for (const t of threads) {
    if (t.status === 'open') openCount += 1;
    else if (t.status === 'pending') pendingCount += 1;
    else resolvedCount += 1;
    if (t.unreadByBusiness) unreadCount += 1;
    if (t.assignedUid && t.assignedUid === currentUid && t.status !== 'resolved') {
      assignedToMeCount += 1;
    }
  }

  return {
    totalThreads: threads.length,
    openCount,
    pendingCount,
    resolvedCount,
    unreadCount,
    assignedToMeCount,
  };
}
