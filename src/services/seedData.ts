import type {
  AppNotification,
  ChatMessage,
  ChatThread,
  Post,
  PostComment,
  StoryItem,
  UserProfile,
} from '../types/social';

export const ASSET_AVATAR_MAYA = '/images/avatar_maya_1794518947315.jpg';
export const ASSET_AVATAR_KENJI = '/images/avatar_kenji_1794518947553.jpg';
export const ASSET_AVATAR_ELENA = '/images/avatar_elena_1794518948136.jpg';
export const ASSET_POST_ARCH = '/images/post_architecture_1794518948238.jpg';
export const ASSET_POST_CAFE = '/images/post_cafe_workspace_1794518949649.jpg';
export const ASSET_POST_ALPINE = '/images/post_alpine_trail_1794518949014.jpg';

export const SEED_CREATORS: UserProfile[] = [
  {
    uid: 'creator_maya',
    displayName: 'Maya Lin',
    handle: 'maya.lin',
    bio: 'Creative director documenting quiet spaces, light geometry, and analog photography.',
    avatarUrl: ASSET_AVATAR_MAYA,
    location: 'Copenhagen',
    interests: ['Architecture', 'Photography', 'Typography'],
    followersCount: 1840,
    followingCount: 312,
    onboardingCompleted: true,
    createdAtMs: Date.now() - 86400_000 * 30,
    updatedAtMs: Date.now() - 3600_000 * 2,
  },
  {
    uid: 'creator_kenji',
    displayName: 'Kenji Sato',
    handle: 'kenji.sato',
    bio: 'Industrial designer exploring timber joinery, studio workflows, and tactile hardware.',
    avatarUrl: ASSET_AVATAR_KENJI,
    location: 'Kyoto',
    interests: ['Industrial Design', 'Studio Craft', 'Photography'],
    followersCount: 2410,
    followingCount: 198,
    onboardingCompleted: true,
    createdAtMs: Date.now() - 86400_000 * 45,
    updatedAtMs: Date.now() - 3600_000 * 5,
  },
  {
    uid: 'creator_elena',
    displayName: 'Elena Vance',
    handle: 'elena.vance',
    bio: 'Landscape architect & alpine trail runner. Field notes from high ridges and civic courtyards.',
    avatarUrl: ASSET_AVATAR_ELENA,
    location: 'Zurich',
    interests: ['Alpine Travel', 'Urbanism', 'Architecture'],
    followersCount: 1290,
    followingCount: 405,
    onboardingCompleted: true,
    createdAtMs: Date.now() - 86400_000 * 20,
    updatedAtMs: Date.now() - 3600_000 * 8,
  },
];

export const SEED_COMMUNITY_MEMBERS: UserProfile[] = [
  ...SEED_CREATORS,
  {
    uid: 'creator_soren',
    displayName: 'Soren Lindqvist',
    handle: 'soren.l',
    bio: 'Bookbinder and editorial printmaker archiving Nordic exhibition catalogs.',
    avatarUrl: ASSET_AVATAR_KENJI,
    location: 'Stockholm',
    interests: ['Typography', 'Studio Craft', 'Analog Film'],
    followersCount: 640,
    followingCount: 218,
    onboardingCompleted: true,
    createdAtMs: Date.now() - 86400_000 * 18,
    updatedAtMs: Date.now() - 3600_000 * 11,
  },
  {
    uid: 'creator_nadia',
    displayName: 'Nadia Okafor',
    handle: 'nadia.okafor',
    bio: 'Urban planner documenting daylighting in civic libraries and transit halls.',
    avatarUrl: ASSET_AVATAR_ELENA,
    location: 'London',
    interests: ['Urbanism', 'Architecture', 'Photography'],
    followersCount: 920,
    followingCount: 310,
    onboardingCompleted: true,
    createdAtMs: Date.now() - 86400_000 * 14,
    updatedAtMs: Date.now() - 3600_000 * 6,
  },
];

export const DEFAULT_FOLLOWER_IDS: string[] = [
  'creator_maya',
  'creator_kenji',
  'creator_elena',
  'creator_soren',
];

export const DEFAULT_FOLLOWED_IDS: string[] = [
  'creator_maya',
  'creator_kenji',
];

export const SEED_FOLLOW_GRAPH: Record<
  string,
  { followers: string[]; following: string[] }
> = {
  creator_maya: {
    followers: ['creator_kenji', 'creator_elena', 'creator_soren', 'creator_nadia'],
    following: ['creator_kenji', 'creator_elena', 'creator_soren'],
  },
  creator_kenji: {
    followers: ['creator_maya', 'creator_elena', 'creator_nadia'],
    following: ['creator_maya', 'creator_elena'],
  },
  creator_elena: {
    followers: ['creator_maya', 'creator_kenji', 'creator_soren'],
    following: ['creator_maya', 'creator_kenji', 'creator_nadia'],
  },
  creator_soren: {
    followers: ['creator_maya', 'creator_nadia'],
    following: ['creator_maya', 'creator_elena'],
  },
  creator_nadia: {
    followers: ['creator_elena'],
    following: ['creator_maya', 'creator_kenji', 'creator_soren'],
  },
};

export function createInitialMemberProfile(
  overrides: Partial<UserProfile> = {}
): UserProfile {
  const now = Date.now();
  return {
    uid: 'member_alex',
    displayName: 'Alex Rivera',
    handle: 'alex.rivera',
    bio: 'Exploring cross-platform product design, daylight photography, and quiet morning routines.',
    avatarUrl: ASSET_AVATAR_MAYA,
    location: 'San Francisco',
    interests: ['Architecture', 'Photography', 'Industrial Design'],
    followersCount: DEFAULT_FOLLOWER_IDS.length,
    followingCount: DEFAULT_FOLLOWED_IDS.length,
    onboardingCompleted: false,
    createdAtMs: now,
    updatedAtMs: now,
    ...overrides,
  };
}

export function createStarterRegisteredAccounts(): UserProfile[] {
  return [
    createInitialMemberProfile({
      onboardingCompleted: true,
    }),
    ...SEED_COMMUNITY_MEMBERS,
  ];
}

export function createSeedPosts(now = Date.now()): Post[] {
  const min = 60_000;
  const hr = 3_600_000;
  return [
    {
      id: 'seed_post_1',
      authorId: 'creator_maya',
      authorName: 'Maya Lin',
      authorHandle: 'maya.lin',
      authorAvatar: ASSET_AVATAR_MAYA,
      caption:
        'Late afternoon sun cutting across the cedar louvers and travertine pool. Shadow study with @kenji.sato on timber acoustics. #architecture #minimalism',
      imageUrl: ASSET_POST_ARCH,
      category: 'Architecture',
      likesCount: 142,
      commentsCount: 2,
      createdAtMs: now - 14 * min,
      updatedAtMs: now - 14 * min,
    },
    {
      id: 'seed_post_2',
      authorId: 'creator_kenji',
      authorName: 'Kenji Sato',
      authorHandle: 'kenji.sato',
      authorAvatar: ASSET_AVATAR_KENJI,
      caption:
        'Morning ritual before studio crit: single-origin pour-over, linen sketchbook, brass pocket pen, and 35mm rangefinder loaded with Tri-X. Tagging @maya.lin for notes. #design #photography',
      imageUrl: ASSET_POST_CAFE,
      category: 'Design',
      likesCount: 98,
      commentsCount: 1,
      createdAtMs: now - 52 * min,
      updatedAtMs: now - 52 * min,
    },
    {
      id: 'seed_post_3',
      authorId: 'creator_elena',
      authorName: 'Elena Vance',
      authorHandle: 'elena.vance',
      authorAvatar: ASSET_AVATAR_ELENA,
      caption:
        'Above the inversion layer at 06:40. Twenty minutes of crisp granite ridge air with @elena.vance before descending back into valley mist. #travel #photography',
      imageUrl: ASSET_POST_ALPINE,
      category: 'Travel',
      likesCount: 215,
      commentsCount: 1,
      createdAtMs: now - 2 * hr,
      updatedAtMs: now - 2 * hr,
    },
    {
      id: 'seed_post_4',
      authorId: 'creator_maya',
      authorName: 'Maya Lin',
      authorHandle: 'maya.lin',
      authorAvatar: ASSET_AVATAR_MAYA,
      caption:
        'Quick note on responsive typography: pairing a geometric display face with generous 1.65 body leading makes long-form mobile threads effortless to scan. #typography #design',
      imageUrl: '',
      category: 'Journal',
      likesCount: 64,
      commentsCount: 0,
      createdAtMs: now - 4 * hr,
      updatedAtMs: now - 4 * hr,
    },
    {
      id: 'seed_post_5',
      authorId: 'creator_kenji',
      authorName: 'Kenji Sato',
      authorHandle: 'kenji.sato',
      authorAvatar: ASSET_AVATAR_KENJI,
      caption:
        'Testing matte anodized aluminum finishes under north-facing skylight. Subtle bead-blasting removes glare without losing crisp chamfers.',
      imageUrl: ASSET_POST_CAFE,
      category: 'Photography',
      likesCount: 77,
      commentsCount: 0,
      createdAtMs: now - 6 * hr,
      updatedAtMs: now - 6 * hr,
    },
    {
      id: 'seed_post_6',
      authorId: 'creator_elena',
      authorName: 'Elena Vance',
      authorHandle: 'elena.vance',
      authorAvatar: ASSET_AVATAR_ELENA,
      caption:
        'Courtyard drainage detail using permeable limestone pavers—stays bone dry right after summer downpours and softens acoustic echo between brick facades.',
      imageUrl: ASSET_POST_ARCH,
      category: 'Architecture',
      likesCount: 119,
      commentsCount: 0,
      createdAtMs: now - 9 * hr,
      updatedAtMs: now - 9 * hr,
    },
    {
      id: 'seed_post_7',
      authorId: 'creator_maya',
      authorName: 'Maya Lin',
      authorHandle: 'maya.lin',
      authorAvatar: ASSET_AVATAR_MAYA,
      caption:
        'Field recording from the harbour ferry at dusk. Low-frequency engine hum layered over gull calls makes a surprisingly calm focus soundtrack.',
      imageUrl: '',
      category: 'Journal',
      likesCount: 41,
      commentsCount: 0,
      createdAtMs: now - 13 * hr,
      updatedAtMs: now - 13 * hr,
    },
    {
      id: 'seed_post_8',
      authorId: 'creator_elena',
      authorName: 'Elena Vance',
      authorHandle: 'elena.vance',
      authorAvatar: ASSET_AVATAR_ELENA,
      caption:
        'Packed 11L trail vest for a two-day hut traverse: merino base layer, titanium mug, compact shell, and one 28mm prime lens.',
      imageUrl: ASSET_POST_ALPINE,
      category: 'Travel',
      likesCount: 153,
      commentsCount: 0,
      createdAtMs: now - 18 * hr,
      updatedAtMs: now - 18 * hr,
    },
    {
      id: 'seed_post_9',
      authorId: 'creator_kenji',
      authorName: 'Kenji Sato',
      authorHandle: 'kenji.sato',
      authorAvatar: ASSET_AVATAR_KENJI,
      caption:
        'Why physical detents still matter on digital cameras: muscle memory lets you adjust exposure compensation without taking your eye off the frame.',
      imageUrl: '',
      category: 'Design',
      likesCount: 89,
      commentsCount: 0,
      createdAtMs: now - 23 * hr,
      updatedAtMs: now - 23 * hr,
    },
    {
      id: 'seed_post_10',
      authorId: 'creator_maya',
      authorName: 'Maya Lin',
      authorHandle: 'maya.lin',
      authorAvatar: ASSET_AVATAR_MAYA,
      caption:
        'Reflections on quiet architecture—buildings that age gracefully with moss, patina, and rain streaks rather than fighting the climate.',
      imageUrl: ASSET_POST_ARCH,
      category: 'Photography',
      likesCount: 168,
      commentsCount: 0,
      createdAtMs: now - 28 * hr,
      updatedAtMs: now - 28 * hr,
    },
  ];
}

export function createSeedComments(now = Date.now()): Record<string, PostComment[]> {
  return {
    seed_post_1: [
      {
        id: 'c_1',
        postId: 'seed_post_1',
        authorId: 'creator_kenji',
        authorName: 'Kenji Sato',
        authorHandle: 'kenji.sato',
        authorAvatar: ASSET_AVATAR_KENJI,
        text: 'The warmth of that cedar against raw board-formed concrete is spot on.',
        createdAtMs: now - 9 * 60_000,
      },
      {
        id: 'c_2',
        postId: 'seed_post_1',
        authorId: 'creator_elena',
        authorName: 'Elena Vance',
        authorHandle: 'elena.vance',
        authorAvatar: ASSET_AVATAR_ELENA,
        text: 'Love how the reflecting pool doubles the canopy depth @maya.lin! #architecture',
        createdAtMs: now - 4 * 60_000,
      },
    ],
    seed_post_2: [
      {
        id: 'c_3',
        postId: 'seed_post_2',
        authorId: 'creator_maya',
        authorName: 'Maya Lin',
        authorHandle: 'maya.lin',
        authorAvatar: ASSET_AVATAR_MAYA,
        text: 'Nothing beats Tri-X in morning window light @kenji.sato.',
        createdAtMs: now - 31 * 60_000,
      },
    ],
    seed_post_3: [
      {
        id: 'c_4',
        postId: 'seed_post_3',
        authorId: 'creator_kenji',
        authorName: 'Kenji Sato',
        authorHandle: 'kenji.sato',
        authorAvatar: ASSET_AVATAR_KENJI,
        text: 'That cloud inversion looks unreal. Which pass is this?',
        createdAtMs: now - 95 * 60_000,
      },
    ],
  };
}

export function createSeedChats(
  currentUid: string,
  now = Date.now()
): { threads: ChatThread[]; messagesByChat: Record<string, ChatMessage[]> } {
  const threads: ChatThread[] = [
    {
      id: 'chat_maya',
      title: 'Maya Lin',
      isGroup: false,
      memberIds: [currentUid, 'creator_maya'],
      partnerAvatar: ASSET_AVATAR_MAYA,
      partnerHandle: 'maya.lin',
      lastMessageText: 'Did you get a chance to review the pavilion light study?',
      lastMessageSenderId: 'creator_maya',
      createdAtMs: now - 7200_000,
      updatedAtMs: now - 480_000,
    },
    {
      id: 'chat_kenji',
      title: 'Kenji Sato',
      isGroup: false,
      memberIds: [currentUid, 'creator_kenji'],
      partnerAvatar: ASSET_AVATAR_KENJI,
      partnerHandle: 'kenji.sato',
      lastMessageText: 'Sending over the walnut prototype shots from Kyoto.',
      lastMessageSenderId: 'creator_kenji',
      createdAtMs: now - 86400_000,
      updatedAtMs: now - 3600_000,
    },
    {
      id: 'chat_studio_group',
      title: 'Field & Form Collective',
      isGroup: true,
      memberIds: [currentUid, 'creator_maya', 'creator_kenji', 'creator_elena'],
      partnerAvatar: ASSET_AVATAR_ELENA,
      partnerHandle: '3 members',
      lastMessageText: 'Elena: Shared the Saturday dawn ridge route GPX.',
      lastMessageSenderId: 'creator_elena',
      createdAtMs: now - 172800_000,
      updatedAtMs: now - 9000_000,
    },
  ];

  const messagesByChat: Record<string, ChatMessage[]> = {
    chat_maya: [
      {
        id: 'm_1',
        chatId: 'chat_maya',
        senderId: 'creator_maya',
        senderName: 'Maya Lin',
        senderAvatar: ASSET_AVATAR_MAYA,
        text: 'Hey! Just uploaded the afternoon courtyard photos from the pavilion.',
        memberIds: [currentUid, 'creator_maya'],
        createdAtMs: now - 1800_000,
      },
      {
        id: 'm_2',
        chatId: 'chat_maya',
        senderId: 'creator_maya',
        senderName: 'Maya Lin',
        senderAvatar: ASSET_AVATAR_MAYA,
        text: 'Did you get a chance to review the pavilion light study?',
        memberIds: [currentUid, 'creator_maya'],
        createdAtMs: now - 480_000,
      },
    ],
    chat_kenji: [
      {
        id: 'm_3',
        chatId: 'chat_kenji',
        senderId: 'creator_kenji',
        senderName: 'Kenji Sato',
        senderAvatar: ASSET_AVATAR_KENJI,
        text: 'Sending over the walnut prototype shots from Kyoto.',
        memberIds: [currentUid, 'creator_kenji'],
        createdAtMs: now - 3600_000,
      },
    ],
    chat_studio_group: [
      {
        id: 'm_4',
        chatId: 'chat_studio_group',
        senderId: 'creator_elena',
        senderName: 'Elena Vance',
        senderAvatar: ASSET_AVATAR_ELENA,
        text: 'Shared the Saturday dawn ridge route GPX.',
        memberIds: [currentUid, 'creator_maya', 'creator_kenji', 'creator_elena'],
        createdAtMs: now - 9000_000,
      },
    ],
  };

  return { threads, messagesByChat };
}

export function createSeedNotifications(
  recipientId: string,
  now = Date.now()
): AppNotification[] {
  return [
    {
      id: 'notif_1',
      recipientId,
      actorId: 'creator_maya',
      actorName: 'Maya Lin',
      actorAvatar: ASSET_AVATAR_MAYA,
      type: 'message',
      title: 'New message from Maya Lin',
      body: 'Did you get a chance to review the pavilion light study?',
      targetPostId: '',
      read: false,
      createdAtMs: now - 480_000,
    },
    {
      id: 'notif_2',
      recipientId,
      actorId: 'creator_kenji',
      actorName: 'Kenji Sato',
      actorAvatar: ASSET_AVATAR_KENJI,
      type: 'like',
      title: 'Kenji Sato liked your note',
      body: 'Cross-platform dark mode typography study',
      targetPostId: 'seed_post_1',
      read: false,
      createdAtMs: now - 2400_000,
    },
    {
      id: 'notif_3',
      recipientId,
      actorId: 'creator_elena',
      actorName: 'Elena Vance',
      actorAvatar: ASSET_AVATAR_ELENA,
      type: 'follow',
      title: 'Elena Vance started following you',
      body: 'Zurich · Landscape Architecture',
      targetPostId: '',
      read: true,
      createdAtMs: now - 14400_000,
    },
  ];
}

export const DEFAULT_ONLINE_USER_IDS: string[] = [
  'creator_maya',
  'creator_kenji',
  'creator_elena',
  'creator_soren',
];

export function createSeedStories(now = Date.now()): StoryItem[] {
  const hr = 3_600_000;
  const ttl = 24 * hr;
  return [
    {
      id: 'story_maya_1',
      authorId: 'creator_maya',
      authorName: 'Maya Lin',
      authorHandle: 'maya.lin',
      authorAvatar: ASSET_AVATAR_MAYA,
      imageUrl: ASSET_POST_ARCH,
      caption: 'Golden hour shadows moving across the timber courtyard.',
      createdAtMs: now - 25 * 60_000,
      expiresAtMs: now + ttl,
    },
    {
      id: 'story_maya_2',
      authorId: 'creator_maya',
      authorName: 'Maya Lin',
      authorHandle: 'maya.lin',
      authorAvatar: ASSET_AVATAR_MAYA,
      imageUrl: ASSET_POST_CAFE,
      caption: 'Proof prints from the Copenhagen pavilion study.',
      createdAtMs: now - 12 * 60_000,
      expiresAtMs: now + ttl,
    },
    {
      id: 'story_kenji_1',
      authorId: 'creator_kenji',
      authorName: 'Kenji Sato',
      authorHandle: 'kenji.sato',
      authorAvatar: ASSET_AVATAR_KENJI,
      imageUrl: ASSET_POST_CAFE,
      caption: 'Morning espresso & brass pen sketches before studio crit.',
      createdAtMs: now - 55 * 60_000,
      expiresAtMs: now + ttl,
    },
    {
      id: 'story_elena_1',
      authorId: 'creator_elena',
      authorName: 'Elena Vance',
      authorHandle: 'elena.vance',
      authorAvatar: ASSET_AVATAR_ELENA,
      imageUrl: ASSET_POST_ALPINE,
      caption: 'Above the valley cloud deck at 2,400m.',
      createdAtMs: now - 2 * hr,
      expiresAtMs: now + ttl,
    },
    {
      id: 'story_soren_1',
      authorId: 'creator_soren',
      authorName: 'Soren Lindqvist',
      authorHandle: 'soren.l',
      authorAvatar: ASSET_AVATAR_KENJI,
      imageUrl: ASSET_POST_ARCH,
      caption: 'Fresh linen-bound monograph proofs off the press.',
      createdAtMs: now - 3 * hr,
      expiresAtMs: now + ttl,
    },
    {
      id: 'story_nadia_1',
      authorId: 'creator_nadia',
      authorName: 'Nadia Okafor',
      authorHandle: 'nadia.okafor',
      authorAvatar: ASSET_AVATAR_ELENA,
      imageUrl: ASSET_POST_ALPINE,
      caption: 'Daylight readings at the civic timber library.',
      createdAtMs: now - 4 * hr,
      expiresAtMs: now + ttl,
    },
  ];
}

