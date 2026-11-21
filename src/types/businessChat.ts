export type BusinessChatStatus = 'open' | 'pending' | 'resolved';

export type BusinessChatSenderType = 'customer' | 'business' | 'system';

export type BusinessChatMessageType =
  | 'text'
  | 'product'
  | 'order'
  | 'auto_welcome'
  | 'auto_away';

export interface BusinessChatProductAttachment {
  productId: string;
  title: string;
  priceCents: number;
  currency: string;
  imageUrl: string;
  storeSlug?: string;
}

export interface BusinessChatThread {
  id: string;
  businessProfileId: string;
  businessName: string;
  businessAvatar: string;
  businessSlug: string;
  customerUid: string;
  customerName: string;
  customerAvatar: string;
  customerHandle: string;
  participantIds: string[];
  status: BusinessChatStatus;
  labels: string[];
  assignedUid: string;
  linkedProductId?: string;
  linkedProductTitle?: string;
  linkedProductPrice?: string;
  linkedProductImage?: string;
  linkedOrderId?: string;
  lastMessageText: string;
  lastMessageSenderId: string;
  lastMessageSenderType: BusinessChatSenderType;
  unreadByBusiness: boolean;
  unreadByCustomer: boolean;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface BusinessChatMessage {
  id: string;
  chatId: string;
  businessProfileId: string;
  customerUid: string;
  senderUid: string;
  senderType: BusinessChatSenderType;
  senderName: string;
  senderAvatar: string;
  text: string;
  messageType: BusinessChatMessageType;
  productAttachment?: BusinessChatProductAttachment;
  orderId?: string;
  participantIds: string[];
  createdAtMs: number;
}

export interface BusinessChatAnalytics {
  totalThreads: number;
  openCount: number;
  pendingCount: number;
  resolvedCount: number;
  unreadCount: number;
  assignedToMeCount: number;
}

export interface QuickReplyItem {
  id: string;
  label: string;
  text: string;
}

export interface BusinessMessagingSettings {
  businessProfileId: string;
  welcomeEnabled: boolean;
  welcomeMessage: string;
  awayEnabled: boolean;
  awayMessage: string;
  quickReplies: QuickReplyItem[];
  updatedByUid: string;
  updatedAtMs: number;
}

