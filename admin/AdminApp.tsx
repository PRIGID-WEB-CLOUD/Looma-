import { useState, useEffect } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { collection, doc, getDoc, onSnapshot, deleteDoc } from 'firebase/firestore';
import { AdminView } from './AdminView';
import { useAdminRole } from './useAdminRole';
import { auth, db } from '../src/services/firebase';
import { readStoredThemePreference } from '../src/app/initialization/initialization-config';
import type { Post, StoryGroup, ThemeMode, UserProfile } from '../src/types/social';
import {
  readAdminAccessInquiries,
  readAdminModerationState,
  saveAdminAccessInquiries,
  saveAdminModerationState,
  type AdminAccessInquiry,
  type AdminModerationState,
} from './adminLogic';

export default function AdminApp() {
  const [theme, setTheme] = useState<ThemeMode>(() => readStoredThemePreference());
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [currentProfile, setCurrentProfile] = useState<UserProfile>({
    uid: '',
    displayName: 'Admin User',
    handle: 'admin',
    avatarUrl: '',
    bio: '',
    location: '',
    interests: [],
    followersCount: 0,
    followingCount: 0,
    createdAtMs: Date.now(),
    updatedAtMs: Date.now(),
    onboardingCompleted: true,
  });
  const [communityUsers, setCommunityUsers] = useState<UserProfile[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [storyGroups] = useState<StoryGroup[]>([]);
  const [onlineUserIds] = useState<string[]>([]);
  const [moderation, setModeration] = useState<AdminModerationState>(() => readAdminModerationState());
  const [inquiries, setInquiries] = useState<AdminAccessInquiry[]>(() => readAdminAccessInquiries());

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (u) => {
      setFirebaseUser(u);
      if (u) {
        try {
          const userDoc = await getDoc(doc(db, 'users', u.uid));
          if (userDoc.exists()) {
            const data = userDoc.data() as UserProfile;
            setCurrentProfile({
              ...data,
              uid: u.uid,
            });
          } else {
            setCurrentProfile({
              uid: u.uid,
              displayName: u.displayName || 'Admin Member',
              handle: u.email?.split('@')[0] || 'admin',
              avatarUrl: u.photoURL || '',
              bio: '',
              location: '',
              interests: [],
              followersCount: 0,
              followingCount: 0,
              createdAtMs: Date.now(),
              updatedAtMs: Date.now(),
              onboardingCompleted: true,
            });
          }
        } catch {
          // Fallback
        }
      }
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      const list: UserProfile[] = [];
      snap.forEach((d) => list.push(d.data() as UserProfile));
      setCommunityUsers(list);
    });

    const unsubPosts = onSnapshot(collection(db, 'posts'), (snap) => {
      const list: Post[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() } as Post));
      setPosts(list);
    });

    return () => {
      unsubUsers();
      unsubPosts();
    };
  }, []);

  const adminAuth = useAdminRole({
    isAuthorized: Boolean(firebaseUser),
    firebaseUser,
    isLocalAutostart: false,
  });

  const handleToggleHidePost = (postId: string) => {
    setModeration((prev) => {
      const exists = prev.hiddenPostIds.includes(postId);
      const nextHidden = exists
        ? prev.hiddenPostIds.filter((id) => id !== postId)
        : [...prev.hiddenPostIds, postId];
      const nextState = { ...prev, hiddenPostIds: nextHidden };
      saveAdminModerationState(nextState);
      return nextState;
    });
  };

  const handleDeletePost = async (postId: string) => {
    try {
      await deleteDoc(doc(db, 'posts', postId));
      setPosts((prev) => prev.filter((p) => p.id !== postId));
    } catch {
      setPosts((prev) => prev.filter((p) => p.id !== postId));
    }
  };

  const handleToggleRestrictMember = (uid: string) => {
    setModeration((prev) => {
      const exists = prev.restrictedUids.includes(uid);
      const nextRestricted = exists
        ? prev.restrictedUids.filter((id) => id !== uid)
        : [...prev.restrictedUids, uid];
      const nextState = { ...prev, restrictedUids: nextRestricted };
      saveAdminModerationState(nextState);
      return nextState;
    });
  };

  const handleUpdateInquiryStatus = (id: string, status: AdminAccessInquiry['status']) => {
    setInquiries((prev) => {
      const next = prev.map((inq) => (inq.id === id ? { ...inq, status } : inq));
      saveAdminAccessInquiries(next);
      return next;
    });
  };

  return (
    <AdminView
      theme={theme}
      adminAuth={adminAuth}
      currentProfile={currentProfile}
      accountEmail={firebaseUser?.email || null}
      isLocalAutostart={false}
      communityUsers={communityUsers}
      posts={posts}
      storyGroups={storyGroups}
      onlineUserIds={onlineUserIds}
      moderation={moderation}
      inquiries={inquiries}
      onSetTheme={setTheme}
      onBackToWorkspace={() => {
        window.location.href = 'https://looma.prigidcollection.workers.dev/feed';
      }}
      onOpenAuth={() => {
        window.location.href = 'https://looma.prigidcollection.workers.dev/auth';
      }}
      onOpenPublicProfile={(uid) => {
        window.location.href = `https://looma.prigidcollection.workers.dev/feed?profile=${uid}`;
      }}
      onToggleHidePost={handleToggleHidePost}
      onDeletePost={handleDeletePost}
      onToggleRestrictMember={handleToggleRestrictMember}
      onUpdateInquiryStatus={handleUpdateInquiryStatus}
    />
  );
}
