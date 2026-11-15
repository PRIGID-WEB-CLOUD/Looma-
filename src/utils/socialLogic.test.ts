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
  extractFirstUrl,
  filterUsersByQuery,
  findAccountByHandle,
  formatRelativeTime,
  getThreadOnlineStatus,
  groupStoriesByAuthor,
  isAuthorizedSession,
  isUserOnline,
  normalizeAssetUrl,
  paginateFeed,
  parseRichUrl,
  resolveAppStage,
  resolvePublicProfile,
  sanitizeHandle,
  toggleFollowState,
  togglePostLikeState,
  validateAuthForm,
  validateCommentInput,
  validatePostInput,
  validateProfileInput,
  extractHashtags,
  extractMentions,
  parseTextWithTagsAndMentions,
  getMentionQueryAtCursor,
  getHashtagQueryAtCursor,
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
} from './socialLogic';
import type {
  AppNotification,
  ChatMessage,
  ChatThread,
  CallSession,
  Post,
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

