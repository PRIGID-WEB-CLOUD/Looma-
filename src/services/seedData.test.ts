import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SEED_COMMUNITY_MEMBERS,
  SEED_CREATORS,
  stripDemoComments,
  stripDemoMessages,
  stripDemoNotifications,
  stripDemoPosts,
  stripDemoStories,
  stripDemoThreads,
  stripDemoUsers,
} from './seedData';
import type {
  AppNotification,
  ChatMessage,
  ChatThread,
  Post,
  PostComment,
  StoryItem,
  UserProfile,
} from '../types/social';

test('seed user lists are empty so no demo users ship in the app', () => {
  assert.equal(SEED_CREATORS.length, 0);
  assert.equal(SEED_COMMUNITY_MEMBERS.length, 0);
});

test('stripDemoUsers and stripDemoPosts remove demo creators and their posts while keeping real records', () => {
  const users: UserProfile[] = [
    {
      uid: 'creator_maya',
      displayName: 'Maya Lin',
      handle: 'maya.lin',
      bio: '',
      avatarUrl: '',
      location: 'Copenhagen',
      interests: [],
      followersCount: 0,
      followingCount: 0,
      onboardingCompleted: true,
      createdAtMs: 1,
      updatedAtMs: 1,
    },
    {
      uid: 'real_uid_1',
      displayName: 'Sam Lee',
      handle: 'sam.lee',
      bio: '',
      avatarUrl: '',
      location: 'Berlin',
      interests: [],
      followersCount: 0,
      followingCount: 0,
      onboardingCompleted: true,
      createdAtMs: 2,
      updatedAtMs: 2,
    },
  ];
  assert.deepEqual(
    stripDemoUsers(users).map((u) => u.uid),
    ['real_uid_1']
  );

  const posts: Post[] = [
    {
      id: 'seed_post_1',
      authorId: 'creator_maya',
      authorName: 'Maya Lin',
      authorHandle: 'maya.lin',
      authorAvatar: '',
      caption: 'Demo post',
      imageUrl: '',
      category: 'Architecture',
      likesCount: 10,
      commentsCount: 0,
      createdAtMs: 1,
      updatedAtMs: 1,
    },
    {
      id: 'post_real_1',
      authorId: 'real_uid_1',
      authorName: 'Sam Lee',
      authorHandle: 'sam.lee',
      authorAvatar: '',
      caption: 'Real user post',
      imageUrl: '',
      category: 'Journal',
      likesCount: 0,
      commentsCount: 0,
      createdAtMs: 2,
      updatedAtMs: 2,
    },
  ];
  assert.deepEqual(
    stripDemoPosts(posts).map((p) => p.id),
    ['post_real_1']
  );
});

test('stripDemoStories, stripDemoComments, stripDemoThreads, stripDemoMessages, and stripDemoNotifications clean cached demo state', () => {
  const stories: StoryItem[] = [
    {
      id: 'story_maya_1',
      authorId: 'creator_maya',
      authorName: 'Maya',
      authorHandle: 'maya.lin',
      authorAvatar: '',
      imageUrl: '',
      caption: 'Demo',
      createdAtMs: 1,
      expiresAtMs: 9999999999999,
    },
    {
      id: 'story_real_1',
      authorId: 'real_uid_1',
      authorName: 'Sam',
      authorHandle: 'sam.lee',
      authorAvatar: '',
      imageUrl: '',
      caption: 'Real',
      createdAtMs: 2,
      expiresAtMs: 9999999999999,
    },
  ];
  assert.deepEqual(
    stripDemoStories(stories).map((s) => s.id),
    ['story_real_1']
  );

  const comments: Record<string, PostComment[]> = {
    seed_post_1: [
      {
        id: 'c_1',
        postId: 'seed_post_1',
        authorId: 'creator_kenji',
        authorName: 'Kenji',
        authorHandle: 'kenji.sato',
        authorAvatar: '',
        text: 'Demo comment',
        createdAtMs: 1,
      },
    ],
    post_real_1: [
      {
        id: 'c_real',
        postId: 'post_real_1',
        authorId: 'real_uid_1',
        authorName: 'Sam',
        authorHandle: 'sam.lee',
        authorAvatar: '',
        text: 'Real comment',
        createdAtMs: 2,
      },
    ],
  };
  assert.deepEqual(Object.keys(stripDemoComments(comments)), ['post_real_1']);

  const threads: ChatThread[] = [
    {
      id: 'chat_maya',
      title: 'Maya Lin',
      isGroup: false,
      memberIds: ['real_uid_1', 'creator_maya'],
      partnerAvatar: '',
      partnerHandle: 'maya.lin',
      lastMessageText: 'Hi',
      lastMessageSenderId: 'creator_maya',
      createdAtMs: 1,
      updatedAtMs: 1,
    },
    {
      id: 'group_real',
      title: 'Team',
      isGroup: true,
      memberIds: ['real_uid_1', 'real_uid_2', 'creator_maya'],
      partnerAvatar: '',
      partnerHandle: '2 members',
      lastMessageText: 'Hello',
      lastMessageSenderId: 'real_uid_1',
      createdAtMs: 2,
      updatedAtMs: 2,
    },
  ];
  const cleanedThreads = stripDemoThreads(threads);
  assert.equal(cleanedThreads.length, 1);
  assert.deepEqual(cleanedThreads[0].memberIds, ['real_uid_1', 'real_uid_2']);

  const messages: Record<string, ChatMessage[]> = {
    chat_maya: [
      {
        id: 'm_1',
        chatId: 'chat_maya',
        senderId: 'creator_maya',
        senderName: 'Maya',
        senderAvatar: '',
        text: 'Hi',
        memberIds: ['real_uid_1', 'creator_maya'],
        createdAtMs: 1,
      },
    ],
    group_real: [
      {
        id: 'm_real',
        chatId: 'group_real',
        senderId: 'real_uid_1',
        senderName: 'Sam',
        senderAvatar: '',
        text: 'Hello',
        memberIds: ['real_uid_1', 'real_uid_2'],
        createdAtMs: 2,
      },
    ],
  };
  assert.deepEqual(Object.keys(stripDemoMessages(messages)), ['group_real']);

  const notifs: AppNotification[] = [
    {
      id: 'notif_1',
      recipientId: 'real_uid_1',
      actorId: 'creator_maya',
      actorName: 'Maya',
      actorAvatar: '',
      type: 'message',
      title: 'Demo',
      body: 'Demo',
      targetPostId: '',
      read: false,
      createdAtMs: 1,
    },
    {
      id: 'notif_real',
      recipientId: 'real_uid_1',
      actorId: 'real_uid_2',
      actorName: 'Alex',
      actorAvatar: '',
      type: 'like',
      title: 'Liked',
      body: 'Nice photo',
      targetPostId: 'post_real_1',
      read: false,
      createdAtMs: 2,
    },
  ];
  assert.deepEqual(
    stripDemoNotifications(notifs).map((n) => n.id),
    ['notif_real']
  );
});
