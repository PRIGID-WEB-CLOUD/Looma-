import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildChatPreview,
  buildStoryFromPost,
  canSharePostToStory,
  canUseAutostart,
  computeConnections,
  computeOtherUserConnections,
  countUnreadNotifications,
  createDirectThreadMemberIds,
  DIRECT_CHAT_SHARED_TITLE,
  enrichCommentWithVerifiedAuthor,
  enrichNotificationWithAuthor,
  enrichPostWithVerifiedAuthor,
  enrichStoryGroupsWithVerifiedAuthors,
  enrichVerificationRequestWithUser,
  extractFirstUrl,
  filterUsersByQuery,
  findAccountByHandle,
  formatRelativeTime,
  getThreadOnlineStatus,
  groupStoriesByAuthor,
  isAuthorizedSession,
  isUserOnline,
  matchesDirectThreadParticipants,
  normalizeAssetUrl,
  normalizeProfileUpdateFields,
  paginateFeed,
  parseRichUrl,
  resolveAppStage,
  resolveChatThreadForViewer,
  resolveDirectChatParticipant,
  resolveLiveProfile,
  resolvePostLinkPreview,
  resolvePublicProfile,
  sanitizeHandle,
  sanitizeSafeHttpUrl,
  isOpaqueMediaIdentifier,
  sanitizeMediaTitle,
  sanitizeUploadedFilenameTitle,
  toggleFollowState,
  togglePostLikeState,
  validateAuthForm,
  validateBusinessAccountDetails,
  validateCommentInput,
  validatePostInput,
  validateProfileInput,
  extractHashtags,
  extractMentions,
  parseTextWithTagsAndMentions,
  getMentionQueryAtCursor,
  getHashtagQueryAtCursor,
  filterActiveAnnouncementsForMember,
  mergeAnnouncementsIntoNotifications,
  extractAnnouncementIdFromNotificationId,
  filterCreatorsForMention,
  filterHashtags,
  validateGroupChatInput,
  createGroupThreadRecord,
  isGroupAdmin,
  addGroupParticipantsState,
  removeGroupParticipantState,
  promoteGroupAdminState,
  formatChatPushPayload,
  shouldDispatchChatPushNotification,
  resolvePostMediaDescriptor,
  filterMediaPosts,
  cyclePlaybackSpeed,
  cycleZoomLevel,
  stepMediaIndex,
  deriveMediaDownloadName,
  formatVoiceNote,
  parseVoiceNote,
  formatGifMessage,
  parseGifMessage,
  normalizeGifUrl,
  formatLastMessageSnippet,
  filterGifs,
  CURATED_GIFS,
  deleteNotificationItem,
  normalizeHashtag,
  mergeSavedHashtags,
  formatSharedPostMessage,
  buildPostSharePayload,
  formatMissedCallMessage,
  parseMissedCallMessage,
  filterAndSortFeed,
  filterActiveTypingUids,
  resolveThreadReadStatus,
  validatePasswordResetEmail,
  TYPING_STALE_MS,
} from './socialLogic';
import type {
  AppNotification,
  ChatMessage,
  ChatReadReceipt,
  ChatThread,
  ChatTypingStatus,
  CallSession,
  Post,
  PostComment,
  StoryGroup,
  StoryItem,
  UserProfile,
} from '../types/social';

function makePost(index: number, category: Post['category'] = 'Design'): Post {
  return {
    id: `post_${index}`,
    authorId: `user_${index}`,
    authorName: `Creator ${index}`,
    authorHandle: `creator_${index}`,
    authorAvatar: '',
    caption: `Editorial note number ${index}`,
    imageUrl: '',
    category,
    likesCount: index,
    commentsCount: 0,
    createdAtMs: 1000 * index,
    updatedAtMs: 1000 * index,
  };
}

test('validatePostInput enforces non-empty caption unless attachment is provided and validates category', () => {
  assert.equal(validatePostInput('   ', 'Design').valid, false);
  assert.equal(validatePostInput('   ', 'Design', true).valid, true);
  assert.equal(validatePostInput('Hello world', 'InvalidCat').valid, false);
  assert.equal(validatePostInput('Hello world', 'Architecture').valid, true);
  assert.equal(validatePostInput('a'.repeat(1201), 'Journal').valid, false);
});

test('validateProfileInput and sanitizeHandle enforce safe handles', () => {
  assert.equal(sanitizeHandle('@Maya Lin!!'), 'mayalin');
  assert.equal(sanitizeHandle('x'), 'looma_member');
  assert.equal(validateProfileInput('Maya Lin', 'maya.lin', 'Architect').valid, true);
  assert.equal(validateProfileInput('', 'maya.lin', '').valid, false);
  assert.equal(validateProfileInput('Maya', 'bad handle!', '').valid, false);
});

test('validateCommentInput rejects empty and oversized comments', () => {
  assert.equal(validateCommentInput('   ').valid, false);
  assert.equal(validateCommentInput('Great composition').valid, true);
  assert.equal(validateCommentInput('x'.repeat(501)).valid, false);
});

test('paginateFeed filters by category/query and computes hasMore for infinite scroll', () => {
  const posts = [
    makePost(1, 'Architecture'),
    makePost(2, 'Design'),
    makePost(3, 'Architecture'),
    makePost(4, 'Travel'),
    makePost(5, 'Architecture'),
    makePost(6, 'Photography'),
  ];

  const page1 = paginateFeed(posts, 4, 4, 'All', '');
  assert.equal(page1.items.length, 4);
  assert.equal(page1.items[0].id, 'post_6');
  assert.equal(page1.hasMore, true);

  const page2 = paginateFeed(posts, 4, 8, 'All', '');
  assert.equal(page2.items.length, 6);
  assert.equal(page2.hasMore, false);

  const archOnly = paginateFeed(posts, 4, 4, 'Architecture', '');
  assert.equal(archOnly.filteredTotal, 3);
  assert.equal(archOnly.hasMore, false);

  const searchHit = paginateFeed(posts, 4, 4, 'All', 'creator_4');
  assert.equal(searchHit.items.length, 1);
  assert.equal(searchHit.items[0].id, 'post_4');
});

test('togglePostLikeState increments and decrements safely without going below zero', () => {
  const zeroPost = makePost(0);
  const liked = togglePostLikeState(zeroPost, false);
  assert.equal(liked.liked, true);
  assert.equal(liked.post.likesCount, 1);

  const unliked = togglePostLikeState(liked.post, true);
  assert.equal(unliked.liked, false);
  assert.equal(unliked.post.likesCount, 0);

  const clamped = togglePostLikeState(zeroPost, true);
  assert.equal(clamped.post.likesCount, 0);
});

test('countUnreadNotifications counts only unread items', () => {
  const list: AppNotification[] = [
    {
      id: 'n1',
      recipientId: 'u1',
      actorId: 'u2',
      actorName: 'Kenji',
      actorAvatar: '',
      type: 'like',
      title: 'New like',
      body: 'Liked your photo',
      targetPostId: 'p1',
      read: false,
      createdAtMs: 100,
    },
    {
      id: 'n2',
      recipientId: 'u1',
      actorId: 'u3',
      actorName: 'Elena',
      actorAvatar: '',
      type: 'comment',
      title: 'New comment',
      body: 'Commented',
      targetPostId: 'p1',
      read: true,
      createdAtMs: 200,
    },
  ];
  assert.equal(countUnreadNotifications(list), 1);
});

test('formatRelativeTime and buildChatPreview format human-readable output', () => {
  const now = 1_700_000_000_000;
  assert.equal(formatRelativeTime(now - 25_000, now), 'just now');
  assert.equal(formatRelativeTime(now - 5 * 60_000, now), '5m ago');
  assert.equal(formatRelativeTime(now - 3 * 3600_000, now), '3h ago');
  assert.equal(formatRelativeTime(now - 2 * 86400_000, now), '2d ago');

  const msgs: ChatMessage[] = [
    {
      id: 'm1',
      chatId: 'c1',
      senderId: 'u1',
      senderName: 'Maya',
      senderAvatar: '',
      text: 'First note',
      memberIds: ['u1', 'u2'],
      createdAtMs: 100,
    },
    {
      id: 'm2',
      chatId: 'c1',
      senderId: 'u2',
      senderName: 'Kenji',
      senderAvatar: '',
      text: 'See you at the gallery opening at 6pm',
      memberIds: ['u1', 'u2'],
      createdAtMs: 200,
    },
  ];
  assert.equal(buildChatPreview(msgs), 'See you at the gallery opening at 6pm');
  assert.equal(buildChatPreview([]), 'No messages yet');
});

test('resolvePublicProfile resolves seed creators and falls back to post metadata', () => {
  const me: UserProfile = {
    uid: 'me',
    displayName: 'Alex',
    handle: 'alex',
    bio: '',
    avatarUrl: '',
    location: 'SF',
    interests: [],
    followersCount: 10,
    followingCount: 5,
    onboardingCompleted: true,
    createdAtMs: 1,
    updatedAtMs: 1,
  };
  const creator: UserProfile = {
    ...me,
    uid: 'creator_1',
    displayName: 'Maya Lin',
    handle: 'maya.lin',
  };
  const posts = [makePost(7, 'Architecture')];

  assert.equal(resolvePublicProfile('me', me, [creator], posts)?.displayName, 'Alex');
  assert.equal(resolvePublicProfile('creator_1', me, [creator], posts)?.displayName, 'Maya Lin');
  const fromPost = resolvePublicProfile('user_7', me, [creator], posts);
  assert.equal(fromPost?.displayName, 'Creator 7');
  assert.equal(fromPost?.handle, 'creator_7');
  assert.equal(resolvePublicProfile('unknown', me, [creator], posts), null);
});

test('toggleFollowState toggles followed IDs and clamps following count', () => {
  const followed = toggleFollowState([], 'creator_maya', 5);
  assert.equal(followed.isFollowing, true);
  assert.deepEqual(followed.followedIds, ['creator_maya']);
  assert.equal(followed.followingCount, 6);

  const unfollowed = toggleFollowState(followed.followedIds, 'creator_maya', 6);
  assert.equal(unfollowed.isFollowing, false);
  assert.deepEqual(unfollowed.followedIds, []);
  assert.equal(unfollowed.followingCount, 5);

  const clamped = toggleFollowState(['creator_maya'], 'creator_maya', 0);
  assert.equal(clamped.followingCount, 0);
});

test('validateAuthForm validates signin handle and signup displayName + handle', () => {
  assert.equal(validateAuthForm('signin', '@maya.lin').valid, true);
  assert.equal(validateAuthForm('signin', 'x').valid, false);
  assert.equal(validateAuthForm('signin', 'bad handle!').valid, false);
  assert.equal(validateAuthForm('signup', 'maya.lin', '').valid, false);
  assert.equal(validateAuthForm('signup', 'maya.lin', 'Maya Lin').valid, true);
});

test('computeConnections and filterUsersByQuery derive followers, following, mutual friends, and search matches', () => {
  const base: UserProfile = {
    uid: 'u1',
    displayName: 'Maya Lin',
    handle: 'maya.lin',
    bio: 'Architecture & daylight',
    avatarUrl: '',
    location: 'Copenhagen',
    interests: ['Architecture'],
    followersCount: 10,
    followingCount: 5,
    onboardingCompleted: true,
    createdAtMs: 1,
    updatedAtMs: 1,
  };
  const users: UserProfile[] = [
    base,
    { ...base, uid: 'u2', displayName: 'Kenji Sato', handle: 'kenji.sato', location: 'Kyoto', bio: 'Industrial design' },
    { ...base, uid: 'u3', displayName: 'Elena Vance', handle: 'elena.vance', location: 'Zurich', bio: 'Alpine trails' },
  ];

  const grouped = computeConnections(users, ['u1', 'u3'], ['u1', 'u2']);
  assert.deepEqual(grouped.followers.map((u) => u.uid), ['u1', 'u3']);
  assert.deepEqual(grouped.following.map((u) => u.uid), ['u1', 'u2']);
  assert.deepEqual(grouped.friends.map((u) => u.uid), ['u1']);

  assert.equal(filterUsersByQuery(users, 'kyoto').length, 1);
  assert.equal(filterUsersByQuery(users, 'elena.vance')[0].uid, 'u3');
  assert.equal(filterUsersByQuery(users, '').length, 3);
});

test('isUserOnline and getThreadOnlineStatus compute direct and group online presence', () => {
  const onlineIds = ['creator_maya', 'creator_kenji'];
  assert.equal(isUserOnline('creator_maya', onlineIds), true);
  assert.equal(isUserOnline('creator_nadia', onlineIds), false);

  const directOnline: ChatThread = {
    id: 'c1',
    title: 'Maya Lin',
    isGroup: false,
    memberIds: ['me', 'creator_maya'],
    partnerAvatar: '',
    partnerHandle: 'maya.lin',
    lastMessageText: 'Hi',
    lastMessageSenderId: 'creator_maya',
    createdAtMs: 100,
    updatedAtMs: 200,
  };
  assert.deepEqual(getThreadOnlineStatus(directOnline, 'me', onlineIds), {
    isOnline: true,
    onlineCount: 1,
    statusLabel: 'Online',
  });

  const directOffline: ChatThread = {
    ...directOnline,
    id: 'c2',
    memberIds: ['me', 'creator_nadia'],
  };
  assert.deepEqual(getThreadOnlineStatus(directOffline, 'me', onlineIds), {
    isOnline: false,
    onlineCount: 0,
    statusLabel: 'Offline',
  });

  const groupThread: ChatThread = {
    ...directOnline,
    id: 'g1',
    isGroup: true,
    memberIds: ['me', 'creator_maya', 'creator_kenji', 'creator_nadia'],
  };
  assert.deepEqual(getThreadOnlineStatus(groupThread, 'me', onlineIds), {
    isOnline: true,
    onlineCount: 2,
    statusLabel: '2 online',
  });
});

test('groupStoriesByAuthor filters expired stories, tracks unviewed state, and orders current user & unviewed first', () => {
  const now = 1_700_000_000_000;
  const stories: StoryItem[] = [
    {
      id: 's1',
      authorId: 'creator_maya',
      authorName: 'Maya Lin',
      authorHandle: 'maya.lin',
      authorAvatar: '',
      imageUrl: '/a.jpg',
      caption: 'Viewed story',
      createdAtMs: now - 1000,
      expiresAtMs: now + 60_000,
    },
    {
      id: 's2',
      authorId: 'creator_kenji',
      authorName: 'Kenji Sato',
      authorHandle: 'kenji.sato',
      authorAvatar: '',
      imageUrl: '/b.jpg',
      caption: 'Unviewed story',
      createdAtMs: now - 5000,
      expiresAtMs: now + 60_000,
    },
    {
      id: 's_expired',
      authorId: 'creator_elena',
      authorName: 'Elena Vance',
      authorHandle: 'elena.vance',
      authorAvatar: '',
      imageUrl: '/c.jpg',
      caption: 'Expired story',
      createdAtMs: now - 90_000,
      expiresAtMs: now - 1,
    },
    {
      id: 's_me',
      authorId: 'me',
      authorName: 'Alex Rivera',
      authorHandle: 'alex.rivera',
      authorAvatar: '',
      imageUrl: '/d.jpg',
      caption: 'My story',
      createdAtMs: now - 9000,
      expiresAtMs: now + 60_000,
    },
  ];

  const grouped = groupStoriesByAuthor(stories, 'me', ['s1'], now);
  assert.equal(grouped.length, 3);
  assert.equal(grouped[0].authorId, 'me');
  assert.equal(grouped[1].authorId, 'creator_kenji');
  assert.equal(grouped[1].hasUnviewed, true);
  assert.equal(grouped[2].authorId, 'creator_maya');
  assert.equal(grouped[2].hasUnviewed, false);
});

test('resolveAppStage orders pages strictly from loading -> auth -> onboarding -> app', () => {
  assert.equal(resolveAppStage(false, false, false), 'loading');
  assert.equal(resolveAppStage(true, false, false), 'loading');
  assert.equal(resolveAppStage(true, true, false), 'loading');
  assert.equal(resolveAppStage(false, false, true), 'auth');
  assert.equal(resolveAppStage(false, true, true), 'auth');
  assert.equal(resolveAppStage(true, false, true), 'onboarding');
  assert.equal(resolveAppStage(true, true, true), 'app');
});

test('findAccountByHandle normalizes @ prefix and case when matching registered accounts', () => {
  const accounts: UserProfile[] = [
    {
      uid: 'member_alex',
      displayName: 'Alex Rivera',
      handle: 'alex.rivera',
      bio: '',
      avatarUrl: '',
      location: 'San Francisco',
      interests: [],
      followersCount: 0,
      followingCount: 0,
      onboardingCompleted: true,
      createdAtMs: 1,
      updatedAtMs: 1,
    },
  ];
  assert.equal(findAccountByHandle(accounts, '@Alex.Rivera')?.uid, 'member_alex');
  assert.equal(findAccountByHandle(accounts, 'alex.rivera')?.uid, 'member_alex');
  assert.equal(findAccountByHandle(accounts, 'unknown_user'), null);
});

test('normalizeAssetUrl rewrites legacy /src/assets/images/ paths to /images/', () => {
  assert.equal(
    normalizeAssetUrl('/src/assets/images/avatar_maya_1794518947315.jpg'),
    '/images/avatar_maya_1794518947315.jpg'
  );
  assert.equal(normalizeAssetUrl('https://cdn.example.com/photo.jpg'), 'https://cdn.example.com/photo.jpg');
});

test('extractFirstUrl and parseRichUrl detect YouTube, Vimeo, video, audio, image, and web links', () => {
  assert.equal(
    extractFirstUrl('Check out https://looma.design/architecture-notes!'),
    'https://looma.design/architecture-notes'
  );
  assert.equal(extractFirstUrl('Plain text only'), null);

  const yt = parseRichUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.equal(yt?.kind, 'youtube');
  assert.equal(yt?.embedUrl, 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');

  const ytShort = parseRichUrl('https://youtu.be/abc123XYZ');
  assert.equal(ytShort?.kind, 'youtube');
  assert.equal(ytShort?.embedUrl, 'https://www.youtube-nocookie.com/embed/abc123XYZ');

  const vimeo = parseRichUrl('https://vimeo.com/76979871');
  assert.equal(vimeo?.kind, 'vimeo');
  assert.equal(vimeo?.embedUrl, 'https://player.vimeo.com/video/76979871');

  const mp4 = parseRichUrl('https://cdn.example.com/clips/studio-walkthrough.mp4');
  assert.equal(mp4?.kind, 'video');
  assert.equal(mp4?.displayTitle, 'Studio Walkthrough');

  const mp3 = parseRichUrl('https://cdn.example.com/audio/ferry-dusk.mp3');
  assert.equal(mp3?.kind, 'audio');

  const img = parseRichUrl('https://cdn.example.com/photos/courtyard.jpg');
  assert.equal(img?.kind, 'image');

  const article = parseRichUrl('https://example.org/essays/daylight-timber-study');
  assert.equal(article?.kind, 'link');
  assert.equal(article?.hostname, 'example.org');
  assert.equal(article?.displayTitle, 'Daylight Timber Study');
});

test('computeOtherUserConnections derives followers, following, and mutual friends for any creator', () => {
  const mk = (uid: string, name: string): UserProfile => ({
    uid,
    displayName: name,
    handle: uid,
    bio: '',
    avatarUrl: '',
    location: 'Earth',
    interests: [],
    followersCount: 0,
    followingCount: 0,
    onboardingCompleted: true,
    createdAtMs: 1,
    updatedAtMs: 1,
  });
  const me = mk('me', 'Alex');
  const maya = mk('creator_maya', 'Maya');
  const kenji = mk('creator_kenji', 'Kenji');
  const elena = mk('creator_elena', 'Elena');
  const seedGraph = {
    creator_maya: {
      followers: ['creator_kenji'],
      following: ['creator_kenji', 'creator_elena'],
    },
  };

  const connsWithMyFollow = computeOtherUserConnections(
    'creator_maya',
    me,
    [maya, kenji, elena],
    ['creator_maya'],
    ['creator_maya'],
    seedGraph
  );
  assert.deepEqual(connsWithMyFollow.followerIds, ['creator_kenji', 'me']);
  assert.deepEqual(connsWithMyFollow.followingIds, ['creator_kenji', 'creator_elena', 'me']);
  assert.deepEqual(
    connsWithMyFollow.friends.map((u) => u.uid),
    ['creator_kenji', 'me']
  );

  const connsWithoutMyFollow = computeOtherUserConnections(
    'creator_maya',
    me,
    [maya, kenji, elena],
    [],
    ['creator_maya'],
    seedGraph
  );
  assert.deepEqual(connsWithoutMyFollow.followerIds, ['creator_kenji']);
});

test('canUseAutostart and isAuthorizedSession block unauthorized and remote bypass access', () => {
  assert.equal(canUseAutostart('?autostart=1', 'localhost'), true);
  assert.equal(canUseAutostart('?autostart=1', '127.0.0.1'), true);
  assert.equal(canUseAutostart('?autostart=1', 'ais-dev-example.run.app'), false);
  assert.equal(canUseAutostart('?autostart=1', 'ais-pre-example.run.app'), false);
  assert.equal(canUseAutostart('', 'localhost'), false);

  assert.equal(isAuthorizedSession(false, false, false), false);
  assert.equal(isAuthorizedSession(true, false, false), false);
  assert.equal(isAuthorizedSession(true, true, false), true);
  assert.equal(isAuthorizedSession(false, false, true), true);
});

test('parseRichUrl parses internal Cloudflare R2 /api/storage/file/ URLs for image, video, and audio', () => {
  const img = parseRichUrl('/api/storage/file/uploads/uid1/posts/123-abc.webp');
  assert.equal(img?.kind, 'image');
  assert.equal(img?.hostname, 'cloudflare-r2');

  const vid = parseRichUrl('/api/storage/file/uploads/uid1/posts/123-abc.mp4');
  assert.equal(vid?.kind, 'video');
  assert.equal(vid?.hostname, 'cloudflare-r2');

  const aud = parseRichUrl('/api/storage/file/uploads/uid1/posts/123-abc.mp3');
  assert.equal(aud?.kind, 'audio');
  assert.equal(aud?.hostname, 'cloudflare-r2');
});

test('canSharePostToStory and buildStoryFromPost enforce ownership, media fallback, and 280-char limit', () => {
  assert.equal(canSharePostToStory('user_1', 'user_1'), true);
  assert.equal(canSharePostToStory('user_2', 'user_1'), false);
  assert.equal(canSharePostToStory('user_1', ''), false);

  const imagePost: Post = {
    id: 'p1',
    authorId: 'user_1',
    authorName: 'Alex',
    authorHandle: 'alex',
    authorAvatar: '',
    caption: 'A'.repeat(320),
    imageUrl: '/api/storage/file/uploads/user_1/posts/photo.jpg',
    category: 'Journal',
    likesCount: 0,
    commentsCount: 0,
    createdAtMs: 1,
    updatedAtMs: 1,
  };
  const fromImg = buildStoryFromPost(imagePost);
  assert.equal(fromImg.imageUrl, '/api/storage/file/uploads/user_1/posts/photo.jpg');
  assert.equal(fromImg.caption.length, 280);
  assert.equal(fromImg.caption.endsWith('...'), true);

  const ytPost: Post = {
    ...imagePost,
    imageUrl: '',
    caption: 'Watch this https://youtu.be/dQw4w9WgXcQ',
  };
  const fromYt = buildStoryFromPost(ytPost);
  assert.equal(
    fromYt.imageUrl,
    'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg'
  );

  const textPost: Post = {
    ...imagePost,
    imageUrl: '',
    caption: 'Quiet morning desk notes.',
  };
  const fromText = buildStoryFromPost(textPost);
  assert.equal(fromText.imageUrl, '');
  assert.equal(fromText.caption, 'Quiet morning desk notes.');
});

test('extractHashtags extracts unique lowercase tags without # symbol', () => {
  const text = 'Exploring #Architecture in #Kyoto and #architecture again with #Minimalism!';
  const tags = extractHashtags(text);
  assert.deepEqual(tags, ['architecture', 'kyoto', 'minimalism']);
  assert.deepEqual(extractHashtags('No tags here'), []);
  assert.deepEqual(extractHashtags(''), []);
});

test('extractMentions extracts unique lowercase handles without @ and strips trailing punctuation', () => {
  const text = 'Hello @maya.lin and @kenji_sato! Also pinging @maya.lin.';
  const mentions = extractMentions(text);
  assert.deepEqual(mentions, ['maya.lin', 'kenji_sato']);
  assert.deepEqual(extractMentions('No mentions here'), []);
  assert.deepEqual(extractMentions(''), []);
});

test('parseTextWithTagsAndMentions tokenizes text, hashtags, and mentions preserving punctuation', () => {
  const text = 'Notes with @maya.lin on #Minimalism.';
  const tokens = parseTextWithTagsAndMentions(text);
  assert.deepEqual(tokens, [
    { type: 'text', value: 'Notes with ', raw: 'Notes with ' },
    { type: 'mention', value: 'maya.lin', raw: '@maya.lin' },
    { type: 'text', value: ' on ', raw: ' on ' },
    { type: 'hashtag', value: 'minimalism', raw: '#Minimalism' },
    { type: 'text', value: '.', raw: '.' },
  ]);
});

test('getMentionQueryAtCursor and getHashtagQueryAtCursor detect active query at cursor', () => {
  const mentionText = 'Hey @may';
  const mentionQuery = getMentionQueryAtCursor(mentionText, mentionText.length);
  assert.deepEqual(mentionQuery, { query: 'may', startIndex: 4 });

  const hashText = 'Studying #arch';
  const hashQuery = getHashtagQueryAtCursor(hashText, hashText.length);
  assert.deepEqual(hashQuery, { query: 'arch', startIndex: 9 });

  assert.equal(getMentionQueryAtCursor('Hello world', 5), null);
  assert.equal(getHashtagQueryAtCursor('Hello world', 5), null);
});

test('filterCreatorsForMention and filterHashtags filter candidates cleanly', () => {
  const creators: UserProfile[] = [
    {
      uid: 'c1',
      displayName: 'Maya Lin',
      handle: 'maya.lin',
      bio: '',
      avatarUrl: '',
      location: '',
      interests: [],
      followersCount: 0,
      followingCount: 0,
      onboardingCompleted: true,
      createdAtMs: 0,
      updatedAtMs: 0,
    },
    {
      uid: 'c2',
      displayName: 'Kenji Sato',
      handle: 'kenji.sato',
      bio: '',
      avatarUrl: '',
      location: '',
      interests: [],
      followersCount: 0,
      followingCount: 0,
      onboardingCompleted: true,
      createdAtMs: 0,
      updatedAtMs: 0,
    },
  ];

  const matchedCreators = filterCreatorsForMention('maya', creators);
  assert.equal(matchedCreators.length, 1);
  assert.equal(matchedCreators[0].handle, 'maya.lin');

  const matchedTags = filterHashtags('arch');
  assert.ok(matchedTags.includes('architecture'));
  assert.ok(!matchedTags.includes('kyoto'));
});

test('group chat creation, participant management, and push notification rules work accurately', () => {
  const makeUser = (uid: string, name: string): UserProfile => ({
    uid,
    displayName: name,
    handle: uid,
    bio: '',
    avatarUrl: `/images/${uid}.jpg`,
    location: 'Studio',
    interests: [],
    followersCount: 0,
    followingCount: 0,
    onboardingCompleted: true,
    createdAtMs: 1,
    updatedAtMs: 1,
  });

  const me = makeUser('me', 'Alex Rivera');
  const maya = makeUser('creator_maya', 'Maya Lin');
  const kenji = makeUser('creator_kenji', 'Kenji Sato');
  const elena = makeUser('creator_elena', 'Elena Vance');

  assert.equal(validateGroupChatInput('   ', ['creator_maya'], 'me').valid, false);
  assert.equal(validateGroupChatInput('Studio Crit', [], 'me').valid, false);
  assert.equal(
    validateGroupChatInput('Studio Crit', ['creator_maya', 'creator_kenji'], 'me').valid,
    true
  );

  const group = createGroupThreadRecord({
    id: 'group_1',
    title: 'Studio Crit',
    creator: me,
    participants: [maya, kenji],
    nowMs: 1000,
  });
  assert.equal(group.isGroup, true);
  assert.deepEqual(group.memberIds, ['me', 'creator_maya', 'creator_kenji']);
  assert.equal(group.partnerHandle, '3 members');

  const added = addGroupParticipantsState(group, [elena, maya], 'Alex Rivera', 2000);
  assert.equal(added.addedUsers.length, 1);
  assert.deepEqual(added.thread.memberIds, [
    'me',
    'creator_maya',
    'creator_kenji',
    'creator_elena',
  ]);
  assert.equal(added.thread.partnerHandle, '4 members');

  const removed = removeGroupParticipantState(
    added.thread,
    'creator_kenji',
    'Kenji Sato',
    'me',
    3000
  );
  assert.equal(removed.removedSelf, false);
  assert.deepEqual(removed.thread.memberIds, ['me', 'creator_maya', 'creator_elena']);
  assert.equal(removed.thread.partnerHandle, '3 members');

  const selfLeft = removeGroupParticipantState(
    removed.thread,
    'me',
    'Alex Rivera',
    'me',
    4000
  );
  assert.equal(selfLeft.removedSelf, true);
  assert.deepEqual(selfLeft.thread.memberIds, ['creator_maya', 'creator_elena']);

  const payload = formatChatPushPayload(group, 'Maya Lin', 'Updated the elevation!');
  assert.equal(payload.title, 'Studio Crit');
  assert.equal(payload.body, 'Maya Lin: Updated the elevation!');

  assert.equal(
    shouldDispatchChatPushNotification({
      senderId: 'creator_maya',
      currentUid: 'me',
      chatId: 'group_1',
      mutedChatIds: [],
      notifyMessages: true,
    }),
    true
  );
  assert.equal(
    shouldDispatchChatPushNotification({
      senderId: 'me',
      currentUid: 'me',
      chatId: 'group_1',
      mutedChatIds: [],
      notifyMessages: true,
    }),
    false
  );
  assert.equal(
    shouldDispatchChatPushNotification({
      senderId: 'creator_maya',
      currentUid: 'me',
      chatId: 'group_1',
      mutedChatIds: ['group_1'],
      notifyMessages: true,
    }),
    false
  );
  assert.equal(
    shouldDispatchChatPushNotification({
      senderId: 'creator_maya',
      currentUid: 'me',
      chatId: 'group_1',
      mutedChatIds: [],
      notifyMessages: false,
    }),
    false
  );
});

test('resolvePostMediaDescriptor, filterMediaPosts, playback speed, zoom, and index stepping handle all posted media kinds', () => {
  const imagePost: Post = {
    ...makePost(1),
    id: 'p_img',
    imageUrl: 'https://cdn.example.com/uploads/u1/posts/photo.webp',
    mediaTitle: 'Studio View',
  };
  const videoPost: Post = {
    ...makePost(2),
    id: 'p_vid',
    videoUrl: '/api/storage/file/uploads/u1/posts/clip.mp4',
    mediaTitle: 'Timelapse',
  };
  const audioPost: Post = {
    ...makePost(3),
    id: 'p_aud',
    audioUrl: 'https://cdn.example.com/uploads/u1/posts/mix.mp3',
    mediaTitle: 'Demo Mix',
  };
  const ytPost: Post = {
    ...makePost(4),
    id: 'p_yt',
    caption: 'Watch this https://youtu.be/dQw4w9WgXcQ',
  };
  const textPost: Post = {
    ...makePost(5),
    id: 'p_txt',
    caption: 'Just thoughts with no attachments.',
    imageUrl: '',
  };

  const resolvedImg = resolvePostMediaDescriptor(imagePost);
  assert.equal(resolvedImg?.kind, 'image');
  assert.equal(resolvedImg?.title, 'Studio View');

  const resolvedVid = resolvePostMediaDescriptor(videoPost);
  assert.equal(resolvedVid?.kind, 'video');
  assert.equal(resolvedVid?.url, '/api/storage/file/uploads/u1/posts/clip.mp4');

  const resolvedAud = resolvePostMediaDescriptor(audioPost);
  assert.equal(resolvedAud?.kind, 'audio');
  assert.equal(resolvedAud?.title, 'Demo Mix');

  const resolvedYt = resolvePostMediaDescriptor(ytPost);
  assert.equal(resolvedYt?.kind, 'youtube');
  assert.equal(
    resolvedYt?.embedUrl,
    'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'
  );

  assert.equal(resolvePostMediaDescriptor(textPost), null);

  const gallery = filterMediaPosts([imagePost, textPost, videoPost, audioPost, ytPost]);
  assert.deepEqual(
    gallery.map((g) => g.post.id),
    ['p_img', 'p_vid', 'p_aud', 'p_yt']
  );

  assert.equal(cyclePlaybackSpeed(1), 1.25);
  assert.equal(cyclePlaybackSpeed(2), 0.75);
  assert.equal(cycleZoomLevel(1), 1.5);
  assert.equal(cycleZoomLevel(2.25), 1);

  assert.equal(stepMediaIndex(0, -1, 4), 0);
  assert.equal(stepMediaIndex(0, 1, 4), 1);
  assert.equal(stepMediaIndex(3, 1, 4), 3);

  assert.equal(deriveMediaDownloadName(resolvedVid!, 'p_vid'), 'clip.mp4');
  assert.equal(deriveMediaDownloadName(resolvedImg!, 'p_img'), 'photo.webp');
});

test('call session state transitions (mute, video off, screen share, and end call)', () => {
  const session: CallSession = {
    chatId: 'chat_1',
    title: 'Studio Call',
    isAudioOnly: false,
    active: true,
    isMuted: false,
    isVideoOff: false,
    isScreenSharing: false,
    participants: [
      { uid: 'u1', name: 'Alice', avatar: '', isMuted: false, isVideoOff: false },
    ],
    startedAtMs: Date.now(),
  };

  const muted = { ...session, isMuted: !session.isMuted };
  assert.equal(muted.isMuted, true);

  const camOff = { ...muted, isVideoOff: !muted.isVideoOff };
  assert.equal(camOff.isVideoOff, true);

  const sharing = { ...camOff, isScreenSharing: !camOff.isScreenSharing };
  assert.equal(sharing.isScreenSharing, true);

  const ended = { ...sharing, active: false };
  assert.equal(ended.active, false);
});

test('isGroupAdmin and promoteGroupAdminState enforce admin-only promotions and membership', () => {
  const thread: ChatThread = {
    id: 'grp_admin_test',
    title: 'Design Leads',
    isGroup: true,
    memberIds: ['u_creator', 'u_member', 'u_other'],
    adminIds: ['u_creator'],
    partnerAvatar: '',
    partnerHandle: '3 members',
    lastMessageText: 'Created group',
    lastMessageSenderId: 'u_creator',
    createdAtMs: 100,
    updatedAtMs: 100,
  };

  assert.equal(isGroupAdmin(thread, 'u_creator'), true);
  assert.equal(isGroupAdmin(thread, 'u_member'), false);

  const nonAdminAttempt = promoteGroupAdminState(thread, 'u_other', 'Other', 'u_member', 200);
  assert.equal(Boolean(nonAdminAttempt.error), true);
  assert.deepEqual(nonAdminAttempt.thread.adminIds, ['u_creator']);

  const nonMemberAttempt = promoteGroupAdminState(thread, 'u_outsider', 'Outsider', 'u_creator', 200);
  assert.equal(Boolean(nonMemberAttempt.error), true);

  const validPromote = promoteGroupAdminState(thread, 'u_member', 'Member', 'u_creator', 300);
  assert.equal(validPromote.error, undefined);
  assert.deepEqual(validPromote.thread.adminIds, ['u_creator', 'u_member']);
  assert.equal(isGroupAdmin(validPromote.thread, 'u_member'), true);
});

test('opaque hash/UUID/R2-key identifiers are stripped from media titles and URL path fallbacks', () => {
  assert.equal(isOpaqueMediaIdentifier('bcb87d1a01e84917a844599485d63c6c'), true);
  assert.equal(
    isOpaqueMediaIdentifier('550e8400-e29b-41d4-a716-446655440000'),
    true
  );
  assert.equal(isOpaqueMediaIdentifier('1794518947315-a1b2c3d4e5f6a7b8'), true);
  assert.equal(isOpaqueMediaIdentifier('Studio Walkthrough'), false);
  assert.equal(isOpaqueMediaIdentifier('Daylight Timber Study'), false);

  assert.equal(
    sanitizeUploadedFilenameTitle('bcb87d1a01e84917a844599485d63c6c.mp4'),
    ''
  );
  assert.equal(
    sanitizeUploadedFilenameTitle('550e8400-e29b-41d4-a716-446655440000.jpg'),
    ''
  );
  assert.equal(
    sanitizeUploadedFilenameTitle('Kyoto Morning Walk.mp4'),
    'Kyoto Morning Walk'
  );

  // Even when a legacy post already stored a 32-hex mediaTitle, readers suppress it
  assert.equal(sanitizeMediaTitle('bcb87d1a01e84917a844599485d63c6c'), '');
  assert.equal(sanitizeMediaTitle('Studio View'), 'Studio View');

  const hashVideo = parseRichUrl(
    '/api/storage/file/uploads/u1/posts/1794518947315-a1b2c3d4e5f6a7b8.mp4',
    'bcb87d1a01e84917a844599485d63c6c'
  );
  assert.equal(hashVideo?.kind, 'video');
  assert.equal(hashVideo?.displayTitle, 'Video Clip');

  const hashAudio = parseRichUrl(
    'https://cdn.example.com/audio/bcb87d1a01e84917a844599485d63c6c.mp3'
  );
  assert.equal(hashAudio?.kind, 'audio');
  assert.equal(hashAudio?.displayTitle, 'Audio Track');

  const hashLink = parseRichUrl(
    'https://cdn.example.com/items/bcb87d1a01e84917a844599485d63c6c'
  );
  assert.equal(hashLink?.kind, 'link');
  assert.equal(hashLink?.displayTitle, 'cdn.example.com');

  const legacyHashPost: Post = {
    ...makePost(9),
    id: 'p_hash',
    caption: '',
    videoUrl: '/api/storage/file/uploads/u1/posts/1794518947315-a1b2c3d4e5f6a7b8.mp4',
    mediaTitle: 'bcb87d1a01e84917a844599485d63c6c',
  };
  assert.equal(resolvePostMediaDescriptor(legacyHashPost)?.title, 'Video Clip');

  const legacyHashPhoto: Post = {
    ...makePost(10),
    id: 'p_hash_img',
    caption: '',
    imageUrl: '/api/storage/file/uploads/u1/posts/1794518947315-a1b2c3d4e5f6a7b8.jpg',
    mediaTitle: 'bcb87d1a01e84917a844599485d63c6c',
  };
  assert.equal(buildStoryFromPost(legacyHashPhoto).caption, 'Shared a post');
});

test('voice notes formatting and parsing preserves audio url and duration', () => {
  const url = '/api/storage/file/uploads/u1/voice/12345.webm';
  const formatted = formatVoiceNote(url, 14.8);
  assert.equal(formatted, '[voice:/api/storage/file/uploads/u1/voice/12345.webm:15]');

  const parsed = parseVoiceNote(formatted);
  assert.ok(parsed);
  assert.equal(parsed?.url, url);
  assert.equal(parsed?.durationSec, 15);

  const parsedNoDuration = parseVoiceNote('[voice:https://cdn.example.com/audio/sample.mp3]');
  assert.ok(parsedNoDuration);
  assert.equal(parsedNoDuration?.url, 'https://cdn.example.com/audio/sample.mp3');
  assert.equal(parsedNoDuration?.durationSec, 0);

  assert.equal(parseVoiceNote('Just a normal chat message'), null);
  assert.equal(parseVoiceNote(''), null);
});

test('gif messages formatting and parsing handles media urls, unclosed brackets, and optional captions', () => {
  const gifUrl = 'https://media.giphy.com/media/artj92V8o75VPL7AeQ/giphy.gif';
  const formattedWithCaption = formatGifMessage(gifUrl, 'Huge congratulations team!');
  assert.equal(
    formattedWithCaption,
    `[gif:${gifUrl}] Huge congratulations team!`
  );

  const parsedWithCaption = parseGifMessage(formattedWithCaption);
  assert.ok(parsedWithCaption);
  assert.equal(parsedWithCaption?.url, gifUrl);
  assert.equal(parsedWithCaption?.caption, 'Huge congratulations team!');

  const formattedWithoutCaption = formatGifMessage(gifUrl);
  assert.equal(formattedWithoutCaption, `[gif:${gifUrl}]`);
  const parsedWithoutCaption = parseGifMessage(formattedWithoutCaption);
  assert.ok(parsedWithoutCaption);
  assert.equal(parsedWithoutCaption?.url, gifUrl);
  assert.equal(parsedWithoutCaption?.caption, '');

  // URL normalization
  assert.equal(
    normalizeGifUrl('https://media.giphy.com/media/artj92V8o75VPL7AeQ/'),
    'https://media.giphy.com/media/artj92V8o75VPL7AeQ/giphy.gif'
  );
  assert.equal(
    normalizeGifUrl('https://media.giphy.com/media/artj92V8o75VPL7AeQ'),
    'https://media.giphy.com/media/artj92V8o75VPL7AeQ/giphy.gif'
  );
  assert.equal(
    normalizeGifUrl('https://giphy.com/gifs/artj92V8o75VPL7AeQ'),
    'https://media.giphy.com/media/artj92V8o75VPL7AeQ/giphy.gif'
  );

  // Exact bug report reproduction: unclosed bracket and trailing slash
  const rawBugSnippet = '[gif:https://media.giphy.com/media/artj92V8o75VPL7AeQ/';
  const parsedBug = parseGifMessage(rawBugSnippet);
  assert.ok(parsedBug);
  assert.equal(parsedBug?.url, 'https://media.giphy.com/media/artj92V8o75VPL7AeQ/giphy.gif');
  assert.equal(parsedBug?.caption, '');

  // Unclosed bracket with caption
  const unclosedWithCaption = '[gif:https://media.giphy.com/media/artj92V8o75VPL7AeQ/ Round of applause!';
  const parsedUnclosedWithCap = parseGifMessage(unclosedWithCaption);
  assert.ok(parsedUnclosedWithCap);
  assert.equal(parsedUnclosedWithCap?.url, 'https://media.giphy.com/media/artj92V8o75VPL7AeQ/giphy.gif');
  assert.equal(parsedUnclosedWithCap?.caption, 'Round of applause!');

  assert.equal(parseGifMessage('Hello world'), null);
  assert.equal(parseGifMessage(''), null);
});

test('formatLastMessageSnippet formats GIFs, voice notes, and text cleanly without exposing raw bracket markup', () => {
  // GIFs without caption
  assert.equal(
    formatLastMessageSnippet('[gif:https://media.giphy.com/media/artj92V8o75VPL7AeQ/giphy.gif]'),
    '🎬 GIF'
  );
  // Truncated / unclosed bug snippet
  assert.equal(
    formatLastMessageSnippet('[gif:https://media.giphy.com/media/artj92V8o75VPL7AeQ/'),
    '🎬 GIF'
  );
  // GIFs with caption
  assert.equal(
    formatLastMessageSnippet('[gif:https://media.giphy.com/media/artj92V8o75VPL7AeQ/giphy.gif] Round of applause!'),
    '🎬 GIF: Round of applause!'
  );
  // Voice notes
  assert.equal(
    formatLastMessageSnippet('[voice:https://cdn.example.com/audio.webm:15]'),
    '🎤 Voice message'
  );
  // Plain text
  assert.equal(
    formatLastMessageSnippet('See you at the studio tonight'),
    'See you at the studio tonight'
  );
  // Empty or missing
  assert.equal(formatLastMessageSnippet(''), 'No messages yet');
  assert.equal(formatLastMessageSnippet(null), 'No messages yet');
  assert.equal(formatLastMessageSnippet(undefined), 'No messages yet');

  // Push payload uses formatted snippet
  const groupThread: Pick<ChatThread, 'title' | 'isGroup'> = {
    title: 'Prigid Holdings',
    isGroup: false,
  };
  const gifPush = formatChatPushPayload(
    groupThread,
    'Prigid Holdings',
    '[gif:https://media.giphy.com/media/artj92V8o75VPL7AeQ/giphy.gif]'
  );
  assert.equal(gifPush.title, 'Message from Prigid Holdings');
  assert.equal(gifPush.body, '🎬 GIF');
});

test('curated gif catalog filtering matches keywords, categories, and titles', () => {
  assert.ok(CURATED_GIFS.length >= 10);

  const clapGifs = filterGifs('clap');
  assert.ok(clapGifs.length > 0);
  assert.ok(clapGifs.some((g) => g.id === 'gif-applause'));

  const cheersCategory = filterGifs('', 'Cheers');
  assert.ok(cheersCategory.length >= 2);
  assert.ok(cheersCategory.every((g) => g.category === 'Cheers'));

  const emptyMatch = filterGifs('nonexistentkeyword123456');
  assert.equal(emptyMatch.length, 0);

  const allGifs = filterGifs('', 'All');
  assert.equal(allGifs.length, CURATED_GIFS.length);
});

test('DM participant identity mapping resolves each viewer to the other participant without self-leak or fabricated fallbacks', () => {
  const mkProfile = (
    uid: string,
    displayName: string,
    handle: string,
    avatarUrl: string
  ): UserProfile => ({
    uid,
    displayName,
    handle,
    bio: `${displayName} bio`,
    avatarUrl,
    location: 'Studio',
    interests: [],
    followersCount: 0,
    followingCount: 0,
    onboardingCompleted: true,
    createdAtMs: 100,
    updatedAtMs: 100,
  });

  const userA = mkProfile('uid_a', 'Alice Monroe', 'alice.monroe', '/images/alice.jpg');
  const userB = mkProfile('uid_b', 'Blake Foster', 'blake.foster', '/images/blake.jpg');

  // Self-DM prevention & strict 2-member invariant
  const selfAttempt = createDirectThreadMemberIds('uid_a', 'uid_a');
  assert.equal(selfAttempt.valid, false);
  assert.deepEqual(selfAttempt.memberIds, []);

  const missingTargetAttempt = createDirectThreadMemberIds('uid_a', '');
  assert.equal(missingTargetAttempt.valid, false);

  const validPair = createDirectThreadMemberIds('uid_a', 'uid_b');
  assert.equal(validPair.valid, true);
  assert.deepEqual(validPair.memberIds, ['uid_a', 'uid_b']);

  // Shared Firestore conversation record intentionally stores neutral shared title (like a real reload from Firestore)
  const sharedPersistedDoc: ChatThread = {
    id: 'chat_ab',
    title: userA.displayName, // even if legacy/stale Firestore doc saved creator's name!
    isGroup: false,
    memberIds: ['uid_a', 'uid_b'],
    adminIds: ['uid_a', 'uid_b'],
    partnerAvatar: userA.avatarUrl,
    partnerHandle: userA.handle,
    lastMessageText: 'Hello there',
    lastMessageSenderId: 'uid_a',
    createdAtMs: 1000,
    updatedAtMs: 2000,
  };

  assert.equal(matchesDirectThreadParticipants(sharedPersistedDoc, 'uid_a', 'uid_b'), true);
  assert.equal(matchesDirectThreadParticipants(sharedPersistedDoc, 'uid_b', 'uid_a'), true);
  assert.equal(matchesDirectThreadParticipants(sharedPersistedDoc, 'uid_a', 'uid_a'), false);
  assert.equal(DIRECT_CHAT_SHARED_TITLE, 'Direct Chat');

  // Test A & B: Account A sees Account B; Account B sees Account A (ignoring stale shared title/avatar/handle)
  const viewForA = resolveChatThreadForViewer(sharedPersistedDoc, 'uid_a', [userB], userA);
  assert.equal(viewForA.partnerUid, 'uid_b');
  assert.equal(viewForA.title, 'Blake Foster');
  assert.equal(viewForA.partnerHandle, 'blake.foster');
  assert.equal(viewForA.partnerAvatar, '/images/blake.jpg');
  assert.equal(viewForA.isParticipantResolved, true);

  const viewForB = resolveChatThreadForViewer(sharedPersistedDoc, 'uid_b', [userA], userB);
  assert.equal(viewForB.partnerUid, 'uid_a');
  assert.equal(viewForB.title, 'Alice Monroe');
  assert.equal(viewForB.partnerHandle, 'alice.monroe');
  assert.equal(viewForB.partnerAvatar, '/images/alice.jpg');
  assert.equal(viewForB.isParticipantResolved, true);

  // Test C: Offline/refresh empty communityUsers never falls back to memberIds[0] or self profile, and never fabricates handle/avatar
  const unresolvedForB = resolveChatThreadForViewer(
    { ...sharedPersistedDoc, memberIds: ['uid_b', 'uid_a'] },
    'uid_b',
    [userB], // only self is present in list!
    userB
  );
  assert.equal(unresolvedForB.partnerUid, 'uid_a');
  assert.equal(unresolvedForB.isParticipantResolved, false);
  assert.equal(unresolvedForB.title, 'Direct Message');
  assert.equal(unresolvedForB.partnerHandle, '');
  assert.equal(unresolvedForB.partnerAvatar, '');

  // Test D: Delayed profile load recalculates cleanly
  const delayedResolvedForB = resolveChatThreadForViewer(
    unresolvedForB,
    'uid_b',
    [userB, userA],
    userB
  );
  assert.equal(delayedResolvedForB.isParticipantResolved, true);
  assert.equal(delayedResolvedForB.title, 'Alice Monroe');
  assert.equal(delayedResolvedForB.partnerHandle, 'alice.monroe');

  // Test E: Malformed / self-only memberIds never resolve self
  const malformedDirect = resolveDirectChatParticipant(['uid_a'], 'uid_a', [userA, userB], userA);
  assert.equal(malformedDirect.otherParticipantId, null);
  assert.equal(malformedDirect.participant, null);
  assert.equal(malformedDirect.isValidDirectPair, false);

  // Test F: Group chats preserve group title and member count
  const groupThread: ChatThread = {
    id: 'grp_ab',
    title: 'Design Crit',
    isGroup: true,
    memberIds: ['uid_a', 'uid_b'],
    adminIds: ['uid_a'],
    partnerAvatar: '',
    partnerHandle: '2 members',
    lastMessageText: 'Welcome',
    lastMessageSenderId: 'uid_a',
    createdAtMs: 1000,
    updatedAtMs: 2000,
  };
  const resolvedGroup = resolveChatThreadForViewer(groupThread, 'uid_a', [userB], userA);
  assert.equal(resolvedGroup.title, 'Design Crit');
  assert.equal(resolvedGroup.partnerHandle, '2 members');
  assert.equal(resolvedGroup.partnerAvatar, '/images/blake.jpg');
});

test('toggleFollowState blocks self-following and strips accidental self ID', () => {
  const selfAttempt = toggleFollowState(['creator_maya'], 'uid_me', 1, 'uid_me');
  assert.equal(selfAttempt.isFollowing, false);
  assert.deepEqual(selfAttempt.followedIds, ['creator_maya']);
  assert.equal(selfAttempt.followingCount, 1);

  const accidentalSelfCleaned = toggleFollowState(['uid_me', 'creator_maya'], 'uid_me', 2, 'uid_me');
  assert.equal(accidentalSelfCleaned.isFollowing, false);
  assert.deepEqual(accidentalSelfCleaned.followedIds, ['creator_maya']);
  assert.equal(accidentalSelfCleaned.followingCount, 1);

  const validOther = toggleFollowState(['creator_maya'], 'creator_kenji', 1, 'uid_me');
  assert.equal(validOther.isFollowing, true);
  assert.deepEqual(validOther.followedIds, ['creator_maya', 'creator_kenji']);
  assert.equal(validOther.followingCount, 2);
});

test('deleteNotificationItem removes the specified notification cleanly', () => {
  const items: AppNotification[] = [
    {
      id: 'n1',
      recipientId: 'u1',
      actorId: 'u2',
      actorName: 'Kenji',
      actorAvatar: '',
      type: 'like',
      title: 'New like',
      body: 'Liked your post',
      targetPostId: 'p1',
      read: false,
      createdAtMs: 100,
    },
    {
      id: 'n2',
      recipientId: 'u1',
      actorId: 'u3',
      actorName: 'Maya',
      actorAvatar: '',
      type: 'follow',
      title: 'New follower',
      body: 'Followed you',
      targetPostId: '',
      read: true,
      createdAtMs: 200,
    },
  ];
  const remaining = deleteNotificationItem(items, 'n1');
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].id, 'n2');
  assert.equal(deleteNotificationItem(remaining, 'nonexistent').length, 1);
});

test('normalizeHashtag, mergeSavedHashtags, and filterHashtags persist and suggest newly created tags', () => {
  assert.equal(normalizeHashtag(' #MyCustom_Tag! '), 'mycustom_tag');
  assert.equal(normalizeHashtag('#'), '');

  const merged = mergeSavedHashtags(['architecture', 'MyCustomTag'], ['#custom_two', 'ARCHITECTURE']);
  assert.deepEqual(merged, ['custom_two', 'architecture', 'mycustomtag']);

  const suggestions = filterHashtags('mycust', merged);
  assert.equal(suggestions[0], 'mycustomtag');
  assert.equal(suggestions.includes('architecture'), false);
});

test('formatSharedPostMessage, buildPostSharePayload, and missed call message formatting/parsing work reliably', () => {
  const post: Post = {
    ...makePost(1, 'Architecture'),
    authorName: 'Maya Lin',
    authorHandle: 'maya.lin',
    caption: 'Timber pavilion study in Kyoto',
  };
  const chatShare = formatSharedPostMessage(post);
  assert.equal(
    chatShare,
    'Shared post from Maya Lin (@maya.lin): "Timber pavilion study in Kyoto"'
  );

  const sharePayload = buildPostSharePayload(post, 'https://looma.app/');
  assert.equal(sharePayload.title, 'Maya Lin on Looma');
  assert.equal(sharePayload.url, 'https://looma.app/feed?post=post_1');
  assert.ok(sharePayload.text.includes('Timber pavilion study in Kyoto'));

  const encodedMissed = formatMissedCallMessage('call_123', true, 'Maya Lin');
  assert.equal(encodedMissed, '[missed-call:call_123:voice:Maya Lin]');
  const parsedMissed = parseMissedCallMessage(encodedMissed);
  assert.deepEqual(parsedMissed, {
    callId: 'call_123',
    isAudioOnly: true,
    title: 'Maya Lin',
  });
  assert.equal(formatLastMessageSnippet(encodedMissed), '📞 Missed voice call');
});

test('filterAndSortFeed supports Following stream, category filtering, and top-liked sorting', () => {
  const posts: Post[] = [
    { ...makePost(1, 'Architecture'), authorId: 'u_maya', likesCount: 15, createdAtMs: 100 },
    { ...makePost(2, 'Design'), authorId: 'u_kenji', likesCount: 40, createdAtMs: 200 },
    { ...makePost(3, 'Architecture'), authorId: 'u_me', likesCount: 5, createdAtMs: 300 },
    { ...makePost(4, 'Travel'), authorId: 'u_stranger', likesCount: 99, createdAtMs: 400 },
  ];

  const followingFeed = filterAndSortFeed({
    posts,
    pageSize: 4,
    visibleCount: 4,
    filter: 'Following',
    sortOrder: 'latest',
    searchQuery: '',
    followedUserIds: ['u_maya'],
    currentUserId: 'u_me',
  });
  assert.deepEqual(
    followingFeed.items.map((p) => p.id),
    ['post_3', 'post_1']
  );

  const topArch = filterAndSortFeed({
    posts,
    pageSize: 4,
    visibleCount: 4,
    filter: 'Architecture',
    sortOrder: 'top',
    searchQuery: '',
  });
  assert.deepEqual(
    topArch.items.map((p) => p.id),
    ['post_1', 'post_3']
  );

  const topAll = filterAndSortFeed({
    posts,
    pageSize: 4,
    visibleCount: 4,
    filter: 'All',
    sortOrder: 'top',
    searchQuery: '',
  });
  assert.equal(topAll.items[0].id, 'post_4');
});

test('filterActiveTypingUids, resolveThreadReadStatus, and validatePasswordResetEmail enforce live sync semantics', () => {
  const now = 1_700_000_000_000;
  const memberIds = ['u_me', 'u_maya', 'u_kenji', 'u_elena'];
  const typingRecords: ChatTypingStatus[] = [
    { chatId: 'c1', uid: 'u_me', memberIds, isTyping: true, updatedAtMs: now - 500 },
    { chatId: 'c1', uid: 'u_maya', memberIds, isTyping: true, updatedAtMs: now - 1500 },
    {
      chatId: 'c1',
      uid: 'u_kenji',
      memberIds,
      isTyping: true,
      updatedAtMs: now - (TYPING_STALE_MS + 100),
    },
    { chatId: 'c1', uid: 'u_elena', memberIds, isTyping: false, updatedAtMs: now - 200 },
  ];
  assert.deepEqual(filterActiveTypingUids(typingRecords, 'u_me', now), ['u_maya']);

  const outgoingMsg: Pick<ChatMessage, 'id' | 'senderId' | 'createdAtMs'> = {
    id: 'msg_10',
    senderId: 'u_me',
    createdAtMs: now - 10_000,
  };
  const selfOnlyReceipts: ChatReadReceipt[] = [
    {
      chatId: 'c1',
      uid: 'u_me',
      memberIds: ['u_me', 'u_maya'],
      lastReadMessageId: 'msg_10',
      lastReadAtMs: now - 9_000,
      updatedAtMs: now - 9_000,
    },
    {
      chatId: 'c1',
      uid: 'u_maya',
      memberIds: ['u_me', 'u_maya'],
      lastReadMessageId: 'msg_9',
      lastReadAtMs: now - 20_000,
      updatedAtMs: now - 20_000,
    },
  ];
  assert.deepEqual(
    resolveThreadReadStatus(outgoingMsg, 'u_me', selfOnlyReceipts),
    { seen: false, seenByUids: [], label: 'Delivered' }
  );

  const seenReceipts: ChatReadReceipt[] = [
    ...selfOnlyReceipts,
    {
      chatId: 'c1',
      uid: 'u_maya',
      memberIds: ['u_me', 'u_maya'],
      lastReadMessageId: 'msg_10',
      lastReadAtMs: now - 5_000,
      updatedAtMs: now - 5_000,
    },
  ];
  assert.deepEqual(
    resolveThreadReadStatus(outgoingMsg, 'u_me', seenReceipts),
    { seen: true, seenByUids: ['u_maya'], label: 'Seen' }
  );

  assert.equal(validatePasswordResetEmail('').valid, false);
  assert.equal(validatePasswordResetEmail('not-an-email').valid, false);
  assert.deepEqual(validatePasswordResetEmail('  alex@looma.app '), {
    valid: true,
    email: 'alex@looma.app',
  });
});

test('governance helpers enforce announcements audience, moderation blocks, verified enrichment, and strict queue rules', async () => {
  const {
    enrichPostWithVerifiedAuthor,
    filterActiveAnnouncementsForMember,
    shouldAutoQueuePostReport,
    shouldBlockActionByModeration,
  } = await import('./socialLogic');

  const announcements = [
    { id: 'a1', title: 'Public', body: 'All', severity: 'info' as const, audience: 'all' as const, active: true, createdAtMs: 10 },
    { id: 'a2', title: 'Verified', body: 'Blue', severity: 'warning' as const, audience: 'verified' as const, active: true, createdAtMs: 20 },
    { id: 'a3', title: 'Admins', body: 'Ops', severity: 'maintenance' as const, audience: 'admins' as const, active: true, createdAtMs: 30 },
    { id: 'a4', title: 'Paused', body: 'Off', severity: 'info' as const, audience: 'all' as const, active: false, createdAtMs: 40 },
  ];

  assert.deepEqual(
    filterActiveAnnouncementsForMember(announcements, { isVerified: false, isAdmin: false, dismissedIds: [] }).map((a) => a.id),
    ['a1']
  );
  assert.deepEqual(
    filterActiveAnnouncementsForMember(announcements, { isVerified: true, isAdmin: false, dismissedIds: ['a1'] }).map((a) => a.id),
    ['a2']
  );
  assert.deepEqual(
    filterActiveAnnouncementsForMember(announcements, { isVerified: true, isAdmin: true, dismissedIds: [] }).map((a) => a.id),
    ['a3', 'a2', 'a1']
  );

  assert.equal(shouldBlockActionByModeration('active', 'post').blocked, false);
  assert.equal(shouldBlockActionByModeration('restricted', 'post').blocked, true);
  assert.equal(shouldBlockActionByModeration('restricted', 'call').blocked, true);
  assert.equal(shouldBlockActionByModeration('restricted', 'like').blocked, false);
  assert.equal(shouldBlockActionByModeration('suspended', 'follow').blocked, true);

  const post = makePost(9);
  const enriched = enrichPostWithVerifiedAuthor(
    post,
    [{ uid: post.authorId, isVerified: true }],
    null
  );
  assert.equal(enriched.authorVerified, true);

  assert.equal(shouldAutoQueuePostReport('Check https://example.com', undefined, true), true);
  assert.equal(shouldAutoQueuePostReport('Check https://example.com', undefined, false), false);
  assert.equal(shouldAutoQueuePostReport('No links here', '', true), false);
});

test('verification badge propagation syncs live status across posts, comments, and public profile fallback', () => {
  const verifiedPost: Post = {
    ...makePost(12, 'Architecture'),
    authorVerified: true,
  };

  // resolvePublicProfile preserves authorVerified when falling back to post metadata
  const me: UserProfile = {
    uid: 'me',
    displayName: 'Alex',
    handle: 'alex',
    bio: '',
    avatarUrl: '',
    location: 'SF',
    interests: [],
    followersCount: 0,
    followingCount: 0,
    onboardingCompleted: true,
    isVerified: false,
    createdAtMs: 1,
    updatedAtMs: 1,
  };
  const fallbackProfile = resolvePublicProfile('user_12', me, [], [verifiedPost]);
  assert.equal(fallbackProfile?.isVerified, true);

  // enrichPostWithVerifiedAuthor grants & revokes based on currentProfile and communityUsers
  const postFromMe: Post = {
    ...makePost(1),
    authorId: 'me',
    authorVerified: false,
  };
  const grantedSelfPost = enrichPostWithVerifiedAuthor(
    postFromMe,
    [],
    { uid: 'me', isVerified: true }
  );
  assert.equal(grantedSelfPost.authorVerified, true);

  const revokedSelfPost = enrichPostWithVerifiedAuthor(
    grantedSelfPost,
    [],
    { uid: 'me', isVerified: false }
  );
  assert.equal(revokedSelfPost.authorVerified, false);

  // enrichCommentWithVerifiedAuthor dynamically reflects live isVerified state
  const commentFromOther: PostComment = {
    id: 'c_1',
    postId: 'p_1',
    authorId: 'u_creator',
    authorName: 'Sophia Chen',
    authorHandle: 'sophia.chen',
    authorAvatar: '',
    authorVerified: false,
    text: 'Wonderful framing!',
    createdAtMs: 1000,
  };
  const grantedComment = enrichCommentWithVerifiedAuthor(
    commentFromOther,
    [{ uid: 'u_creator', isVerified: true }],
    null
  );
  assert.equal(grantedComment.authorVerified, true);

  const revokedComment = enrichCommentWithVerifiedAuthor(
    grantedComment,
    [{ uid: 'u_creator', isVerified: false }],
    null
  );
  assert.equal(revokedComment.authorVerified, false);

  const selfComment: PostComment = {
    ...commentFromOther,
    id: 'c_2',
    authorId: 'me',
    authorVerified: false,
  };
  const grantedSelfComment = enrichCommentWithVerifiedAuthor(
    selfComment,
    [],
    { uid: 'me', isVerified: true }
  );
  assert.equal(grantedSelfComment.authorVerified, true);
});

test('posts with uploaded photo, video, or audio suppress link previews while text+link posts derive link previews', () => {
  assert.equal(isOpaqueMediaIdentifier('file_00000000f47082108baed036cbd83873'), true);
  assert.equal(isOpaqueMediaIdentifier('img_a1b2c3d4e5f67890'), true);
  assert.equal(isOpaqueMediaIdentifier('screenshot_014b2671aabbccddeeff'), true);
  assert.equal(
    sanitizeUploadedFilenameTitle('file_00000000f47082108baed036cbd83873.png'),
    ''
  );
  assert.equal(sanitizeMediaTitle('file_00000000f47082108baed036cbd83873'), '');

  // Uploaded photo + link in caption or linkUrl -> no link preview card needed
  const previewWithPhotoAndLink = resolvePostLinkPreview({
    caption: 'Check https://looma.prigidcollection.workers.dev/ for the new badge!',
    linkUrl: 'https://looma.prigidcollection.workers.dev/',
    imageUrl: '/api/storage/file/uploads/u1/posts/123-abc.png',
    mediaTitle: 'Studio Launch Banner',
  });
  assert.equal(previewWithPhotoAndLink, null);

  // Uploaded video + link -> no link preview card needed
  const previewWithVideoAndLink = resolvePostLinkPreview({
    caption: 'More at https://example.com/notes',
    linkUrl: 'https://example.com/notes',
    imageUrl: '',
    videoUrl: '/api/storage/file/uploads/u1/posts/clip.mp4',
  });
  assert.equal(previewWithVideoAndLink, null);

  // Standalone text + link post (no uploaded media) derives link preview cleanly
  const standaloneLink = resolvePostLinkPreview({
    caption: 'Read the notes https://example.com/guide',
    linkUrl: 'https://example.com/guide',
    imageUrl: '',
    mediaTitle: 'Looma Guide',
  });
  assert.equal(standaloneLink?.displayTitle, 'Looma Guide');
  assert.equal(standaloneLink?.hostname, 'example.com');
});

test('parseTextWithTagsAndMentions preserves paragraphs, emojis, hashtags, mentions, and clickable URLs', () => {
  const input =
    '💙 Big update!\n\nVisit https://looma.prigidcollection.workers.dev/ and (https://en.wikipedia.org/wiki/Blue_(color)).\nPing @maya.lin for #Design & #Looma!';
  const tokens = parseTextWithTagsAndMentions(input);

  assert.equal(
    tokens.some((t) => t.type === 'url' && t.value === 'https://looma.prigidcollection.workers.dev/'),
    true
  );
  assert.equal(
    tokens.some((t) => t.type === 'url' && t.value === 'https://en.wikipedia.org/wiki/Blue_(color)'),
    true
  );
  assert.equal(tokens.some((t) => t.type === 'mention' && t.value === 'maya.lin'), true);
  assert.equal(tokens.some((t) => t.type === 'hashtag' && t.value === 'design'), true);
  assert.equal(tokens.some((t) => t.type === 'hashtag' && t.value === 'looma'), true);
  assert.equal(tokens.map((t) => t.raw).join(''), input);
});

test('filterAndSortFeed handles hashtag click queries cleanly', () => {
  const p1: Post = {
    ...makePost(1, 'Design'),
    caption: 'New blue badge launch!\n#Design, #Looma',
  };
  const p2: Post = {
    ...makePost(2, 'Travel'),
    caption: 'Morning walk in Kyoto #travel',
  };

  const res = filterAndSortFeed({
    posts: [p1, p2],
    pageSize: 10,
    visibleCount: 10,
    filter: 'All',
    searchQuery: '#design',
  });
  assert.deepEqual(
    res.items.map((p) => p.id),
    ['post_1']
  );
});

test('announcements merge into Activity notifications and stay suppressed once read or dismissed', () => {
  const announcements = [
    {
      id: 'ann_1',
      title: 'Blue Badge Rollout',
      body: 'Verified creators now see the blue badge across Looma.',
      severity: 'info' as const,
      audience: 'all' as const,
      active: true,
      authorUid: 'admin_1',
      authorName: 'Admin',
      createdAtMs: 5000,
    },
    {
      id: 'ann_2',
      title: 'Verified Only Note',
      body: 'Early access test',
      severity: 'warning' as const,
      audience: 'verified' as const,
      active: true,
      createdAtMs: 6000,
    },
  ];
  const regularNotifs: AppNotification[] = [
    {
      id: 'n_1',
      recipientId: 'u_1',
      actorId: 'u_2',
      actorName: 'Maya',
      actorAvatar: '',
      type: 'like',
      title: 'New like',
      body: 'Maya liked your post',
      targetPostId: 'p_1',
      read: true,
      createdAtMs: 4000,
    },
  ];

  const mergedUnread = mergeAnnouncementsIntoNotifications(regularNotifs, announcements, {
    recipientId: 'u_1',
    isVerified: false,
    isAdmin: false,
    readAnnouncementIds: [],
    deletedAnnouncementIds: [],
  });
  assert.deepEqual(
    mergedUnread.map((n) => n.id),
    ['ann_ann_1', 'n_1']
  );
  assert.equal(mergedUnread[0].read, false);
  assert.equal(mergedUnread[0].isAnnouncement, true);
  assert.equal(extractAnnouncementIdFromNotificationId(mergedUnread[0].id), 'ann_1');
  assert.equal(countUnreadNotifications(mergedUnread), 1);

  // Once marked read, it stays read in Activity and never pops up in banner again
  const mergedRead = mergeAnnouncementsIntoNotifications(regularNotifs, announcements, {
    recipientId: 'u_1',
    isVerified: false,
    isAdmin: false,
    readAnnouncementIds: ['ann_1'],
    deletedAnnouncementIds: [],
  });
  assert.equal(mergedRead[0].read, true);
  assert.equal(countUnreadNotifications(mergedRead), 0);

  const bannerAfterRead = filterActiveAnnouncementsForMember(announcements, {
    isVerified: false,
    isAdmin: false,
    readIds: ['ann_1'],
  });
  assert.equal(bannerAfterRead.length, 0);
});

test('normalizeProfileUpdateFields sanitizes and enforces Firestore schema bounds on profile updates', () => {
  const base: UserProfile = {
    uid: 'u_me',
    displayName: 'Alex Rivera',
    handle: 'alex.rivera',
    bio: 'Old bio',
    avatarUrl: '/images/old.jpg',
    location: 'San Francisco',
    interests: ['Design'],
    followersCount: 12,
    followingCount: 8,
    onboardingCompleted: true,
    isVerified: true,
    createdAtMs: 1000,
    updatedAtMs: 1000,
  };

  const normalized = normalizeProfileUpdateFields(
    base,
    {
      displayName: `  ${'Jordan Blake '.repeat(10)}  `,
      handle: '@Jordan Blake!!',
      bio: ` ${'b'.repeat(320)} `,
      location: ` ${'Tokyo Studio '.repeat(12)} `,
      avatarUrl: '  /src/assets/images/avatar_maya.jpg  ',
      interests: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', '   ', 'x'.repeat(50)],
    },
    9999
  );

  assert.equal(normalized.displayName.length, 60);
  assert.equal(normalized.handle, 'jordanblake');
  assert.equal(normalized.bio.length, 280);
  assert.equal(normalized.location.length, 80);
  assert.equal(normalized.avatarUrl, '/images/avatar_maya.jpg');
  assert.equal(normalized.interests.length, 8);
  assert.equal(normalized.updatedAtMs, 9999);
  assert.equal(normalized.isVerified, true);

  // Blank displayName preserves existing name safely
  const blankName = normalizeProfileUpdateFields(base, { displayName: '   ' }, 5000);
  assert.equal(blankName.displayName, 'Alex Rivera');
  assert.equal(blankName.accountType, 'personal');

  // In-place transition: personal -> business keeps uid, handle, followers, following, verified
  const transitioned = normalizeProfileUpdateFields(
    base,
    {
      accountType: 'business',
      businessCategory: `  ${'Architecture & Objects '.repeat(4)}  `,
      businessWebsiteUrl: '  https://studio.alexrivera.design/shop  ',
    },
    12000
  );
  assert.equal(transitioned.accountType, 'business');
  assert.equal(transitioned.uid, base.uid);
  assert.equal(transitioned.handle, base.handle);
  assert.equal(transitioned.followersCount, 12);
  assert.equal(transitioned.followingCount, 8);
  assert.equal(transitioned.isVerified, true);
  assert.equal((transitioned.businessCategory || '').length, 60);
  assert.equal(
    transitioned.businessWebsiteUrl,
    'https://studio.alexrivera.design/shop'
  );

  // Rejects unsafe URL schemes on businessWebsiteUrl
  const unsafeUrl = normalizeProfileUpdateFields(
    transitioned,
    {
      businessWebsiteUrl: 'javascript:alert(1)',
    },
    13000
  );
  assert.equal(unsafeUrl.accountType, 'business');
  assert.equal(unsafeUrl.businessWebsiteUrl, '');

  // Transition back: business -> personal preserves unified identity
  const reverted = normalizeProfileUpdateFields(
    transitioned,
    { accountType: 'personal' },
    14000
  );
  assert.equal(reverted.accountType, 'personal');
  assert.equal(reverted.uid, base.uid);
  assert.equal(reverted.handle, base.handle);
  assert.equal(reverted.followersCount, 12);
});

test('validateBusinessAccountDetails and sanitizeSafeHttpUrl enforce safe categories and HTTP(S) URLs', () => {
  assert.equal(validateBusinessAccountDetails('Art & Design', '').valid, true);
  assert.equal(
    validateBusinessAccountDetails('Studio & Services', 'https://looma.studio').valid,
    true
  );
  assert.equal(
    validateBusinessAccountDetails('A', 'https://looma.studio').valid,
    false
  );
  assert.equal(
    validateBusinessAccountDetails('Art & Design', 'javascript:alert(1)').valid,
    false
  );
  assert.equal(sanitizeSafeHttpUrl('ftp://files.example.com'), '');
  assert.equal(sanitizeSafeHttpUrl('https://ok.example.com/path'), 'https://ok.example.com/path');
});

test('profile name, handle, and avatar updates dynamically reflect across posts, comments, stories, and live profiles', () => {
  const updatedMe: UserProfile = {
    uid: 'u_me',
    displayName: 'Jordan Blake',
    handle: 'jordan.blake',
    bio: 'Architectural photographer',
    avatarUrl: 'https://cdn.example.com/jordan.jpg',
    location: 'Kyoto',
    interests: ['Architecture'],
    followersCount: 20,
    followingCount: 10,
    onboardingCompleted: true,
    isVerified: true,
    createdAtMs: 1000,
    updatedAtMs: 5000,
  };

  const updatedCreator: UserProfile = {
    ...updatedMe,
    uid: 'u_creator',
    displayName: 'Maya Lin Studio',
    handle: 'maya.studio',
    avatarUrl: 'https://cdn.example.com/maya-new.jpg',
    isVerified: true,
  };

  const legacyPost: Post = {
    ...makePost(1, 'Design'),
    authorId: 'u_me',
    authorName: 'Alex Rivera',
    authorHandle: 'alex.rivera',
    authorAvatar: '/images/old.jpg',
    authorVerified: false,
  };
  const enrichedPost = enrichPostWithVerifiedAuthor(legacyPost, [], updatedMe);
  assert.equal(enrichedPost.authorName, 'Jordan Blake');
  assert.equal(enrichedPost.authorHandle, 'jordan.blake');
  assert.equal(enrichedPost.authorAvatar, 'https://cdn.example.com/jordan.jpg');
  assert.equal(enrichedPost.authorVerified, true);

  const legacyComment: PostComment = {
    id: 'c_me',
    postId: 'post_1',
    authorId: 'u_me',
    authorName: 'Alex Rivera',
    authorHandle: 'alex.rivera',
    authorAvatar: '/images/old.jpg',
    authorVerified: false,
    text: 'Testing updated name',
    createdAtMs: 2000,
  };
  const enrichedComment = enrichCommentWithVerifiedAuthor(legacyComment, [], updatedMe);
  assert.equal(enrichedComment.authorName, 'Jordan Blake');
  assert.equal(enrichedComment.authorHandle, 'jordan.blake');
  assert.equal(enrichedComment.authorAvatar, 'https://cdn.example.com/jordan.jpg');
  assert.equal(enrichedComment.authorVerified, true);

  const legacyStoryGroup: StoryGroup = {
    authorId: 'u_me',
    authorName: 'Alex Rivera',
    authorHandle: 'alex.rivera',
    authorAvatar: '/images/old.jpg',
    authorVerified: false,
    latestCreatedAtMs: 3000,
    hasUnviewed: true,
    items: [
      {
        id: 'st_1',
        authorId: 'u_me',
        authorName: 'Alex Rivera',
        authorHandle: 'alex.rivera',
        authorAvatar: '/images/old.jpg',
        imageUrl: '/images/story.jpg',
        caption: 'Studio light',
        createdAtMs: 3000,
        expiresAtMs: 90000,
      },
    ],
  };
  const [enrichedGroup] = enrichStoryGroupsWithVerifiedAuthors(
    [legacyStoryGroup],
    [],
    updatedMe
  );
  assert.equal(enrichedGroup.authorName, 'Jordan Blake');
  assert.equal(enrichedGroup.authorHandle, 'jordan.blake');
  assert.equal(enrichedGroup.authorAvatar, 'https://cdn.example.com/jordan.jpg');
  assert.equal(enrichedGroup.authorVerified, true);
  assert.equal(enrichedGroup.items[0].authorName, 'Jordan Blake');
  assert.equal(enrichedGroup.items[0].authorHandle, 'jordan.blake');

  // resolveLiveProfile reflects live self & community updates over stale route snapshots
  const staleSelf: UserProfile = { ...updatedMe, displayName: 'Alex Rivera', handle: 'alex.rivera' };
  const staleOther: UserProfile = { ...updatedCreator, displayName: 'Maya Lin', handle: 'maya.lin' };
  assert.equal(resolveLiveProfile(staleSelf, updatedMe, [updatedCreator])?.displayName, 'Jordan Blake');
  assert.equal(resolveLiveProfile(staleOther, updatedMe, [updatedCreator])?.displayName, 'Maya Lin Studio');
  assert.equal(resolveLiveProfile(null, updatedMe, [updatedCreator]), null);
});

test('enrichNotificationWithAuthor and enrichVerificationRequestWithUser propagate updated or cleared profile pictures', () => {
  const me: UserProfile = {
    uid: 'u_me',
    displayName: 'Jordan Blake',
    handle: 'jordan.blake',
    bio: '',
    avatarUrl: '/api/storage/file/uploads/u_me/avatars/new-me.png',
    location: 'Kyoto',
    interests: [],
    followersCount: 1,
    followingCount: 1,
    isVerified: true,
    onboardingCompleted: true,
    createdAtMs: 1000,
    updatedAtMs: 5000,
  };
  const creator: UserProfile = {
    ...me,
    uid: 'u_creator',
    displayName: 'Maya Lin Studio',
    handle: 'maya.studio',
    avatarUrl: '/api/storage/file/uploads/u_creator/avatars/new-maya.jpg',
  };

  const staleOtherNotif = {
    id: 'n_1',
    recipientId: 'u_me',
    actorId: 'u_creator',
    actorName: 'Maya Lin',
    actorAvatar: '/images/old-maya.jpg',
    type: 'like' as const,
    title: 'New like',
    body: 'Liked your post',
    targetPostId: 'p_1',
    read: false,
    createdAtMs: 2000,
  };
  const enrichedOther = enrichNotificationWithAuthor(staleOtherNotif, [creator], me);
  assert.equal(enrichedOther.actorName, 'Maya Lin Studio');
  assert.equal(
    enrichedOther.actorAvatar,
    '/api/storage/file/uploads/u_creator/avatars/new-maya.jpg'
  );

  // Branded Looma system notification keeps 'Looma' name while updating avatar
  const staleSystemNotif = {
    id: 'n_sys',
    recipientId: 'u_me',
    actorId: 'u_me',
    actorName: 'Looma',
    actorAvatar: '/images/old-me.jpg',
    type: 'system' as const,
    title: 'Browser Push Enabled',
    body: 'Alerts enabled',
    targetPostId: '',
    read: false,
    createdAtMs: 2100,
  };
  const enrichedSystem = enrichNotificationWithAuthor(staleSystemNotif, [creator], me);
  assert.equal(enrichedSystem.actorName, 'Looma');
  assert.equal(
    enrichedSystem.actorAvatar,
    '/api/storage/file/uploads/u_me/avatars/new-me.png'
  );

  // Verification requests also reflect live avatar, displayName, and handle
  const staleReq = {
    id: 'vr_1',
    uid: 'u_creator',
    displayName: 'Maya Lin',
    handle: 'maya.lin',
    avatarUrl: '/images/old-maya.jpg',
    reason: 'Creator profile',
    links: [],
    status: 'pending' as const,
    reviewerUid: '',
    reviewerNote: '',
    createdAtMs: 3000,
    updatedAtMs: 3000,
  };
  const enrichedReq = enrichVerificationRequestWithUser(staleReq, [creator], me);
  assert.equal(enrichedReq.displayName, 'Maya Lin Studio');
  assert.equal(enrichedReq.handle, 'maya.studio');
  assert.equal(
    enrichedReq.avatarUrl,
    '/api/storage/file/uploads/u_creator/avatars/new-maya.jpg'
  );

  // Explicitly cleared avatar ('') clears stale avatars across notifications, requests, posts, and group threads
  const clearedCreator: UserProfile = { ...creator, avatarUrl: '' };
  assert.equal(
    enrichNotificationWithAuthor(staleOtherNotif, [clearedCreator], me).actorAvatar,
    ''
  );
  assert.equal(
    enrichVerificationRequestWithUser(staleReq, [clearedCreator], me).avatarUrl,
    ''
  );
  const resolvedGroup = resolveChatThreadForViewer(
    {
      id: 'chat_grp',
      isGroup: true,
      title: 'Design Team',
      partnerAvatar: '/images/stale-group-lead.jpg',
      partnerHandle: '2 members',
      memberIds: ['u_me', 'u_creator'],
      lastMessageText: 'hi',
      lastMessageSenderId: 'u_me',
      createdAtMs: 1000,
      updatedAtMs: 2000,
    },
    'u_me',
    [clearedCreator],
    me
  );
  assert.equal(resolvedGroup.partnerAvatar, '');
});





