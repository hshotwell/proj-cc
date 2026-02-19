'use client';

import { useState, useEffect, useCallback } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { useAuthActions } from '@convex-dev/auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '../../../convex/_generated/api';
import { AuthGuard } from '@/components/auth';
import { useAuthStore } from '@/store/authStore';
import { useSettingsStore } from '@/store/settingsStore';
import type { Id } from '../../../convex/_generated/dataModel';

type Tab = 'profile' | 'friends';

function ProfileContent() {
  const { user } = useAuthStore();
  const { signOut } = useAuthActions();
  const router = useRouter();
  const updateProfile = useMutation(api.users.updateProfile);
  const { darkMode, toggleDarkMode } = useSettingsStore();

  const [activeTab, setActiveTab] = useState<Tab>('profile');
  const [displayName, setDisplayName] = useState(user?.name || '');
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setMessage(null);
    try {
      await updateProfile({ displayName });
      setMessage({ type: 'success', text: 'Profile updated!' });
    } catch {
      setMessage({ type: 'error', text: 'Failed to update profile.' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    router.push('/auth/signin');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="mb-6">
          <Link href="/home" className="text-blue-600 hover:underline text-sm">
            &larr; Back to Home
          </Link>
        </div>

        <h1 className="text-3xl font-bold text-gray-900 mb-6">Profile</h1>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg">
          {(['profile', 'friends'] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === tab
                  ? 'bg-white text-gray-900 shadow'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {activeTab === 'profile' && (
          <div className="space-y-6">
            {/* Profile Info */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <form onSubmit={handleSave}>
                <div className="flex items-start gap-6 mb-6">
                  {user?.image ? (
                    <img
                      src={user.image}
                      alt="Profile"
                      className="w-20 h-20 rounded-full"
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-full bg-blue-600 flex items-center justify-center text-white text-2xl font-bold">
                      {(user?.name || user?.email)?.[0]?.toUpperCase() || '?'}
                    </div>
                  )}

                  <div className="flex-1">
                    {user?.username && (
                      <div className="mb-3">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Username
                        </label>
                        <p className="text-gray-600">@{user.username}</p>
                      </div>
                    )}

                    <label htmlFor="displayName" className="block text-sm font-medium text-gray-700 mb-1">
                      Display Name
                    </label>
                    <input
                      type="text"
                      id="displayName"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Enter your display name"
                    />

                    <div className="mt-3">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Email
                      </label>
                      <p className="text-gray-600">{user?.email}</p>
                    </div>
                  </div>
                </div>

                {message && (
                  <div
                    className={`mb-4 p-3 rounded-lg ${
                      message.type === 'success'
                        ? 'bg-green-50 text-green-700 border border-green-200'
                        : 'bg-red-50 text-red-700 border border-red-200'
                    }`}
                  >
                    {message.text}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </button>
              </form>
            </div>

            {/* Preferences */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Preferences</h2>
              <label className="flex items-center gap-3 cursor-pointer group">
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={darkMode}
                    onChange={toggleDarkMode}
                    className="sr-only peer"
                  />
                  <div className="w-10 h-6 bg-gray-200 rounded-full peer-checked:bg-blue-500 transition-colors" />
                  <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4" />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-700 group-hover:text-gray-900">
                    Dark mode
                  </div>
                  <div className="text-xs text-gray-500">
                    {darkMode ? 'Dark background' : 'Light background'}
                  </div>
                </div>
              </label>
            </div>

            {/* Sign Out */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <button
                onClick={() => void handleSignOut()}
                className="w-full px-6 py-3 bg-red-50 text-red-600 font-medium rounded-lg hover:bg-red-100 border border-red-200 transition-colors"
              >
                Sign Out
              </button>
            </div>
          </div>
        )}

        {activeTab === 'friends' && <FriendsTab />}
      </div>
    </div>
  );
}

function FriendsTab() {
  return (
    <div className="space-y-6">
      <FriendSearch />
      <PendingRequests />
      <FriendsList />
    </div>
  );
}

function FriendSearch() {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const sendRequest = useMutation(api.friends.sendRequest);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const results = useQuery(
    api.friends.searchUsers,
    debouncedQuery.length >= 2 ? { query: debouncedQuery } : "skip"
  );

  const handleSendRequest = useCallback(async (receiverId: Id<"users">) => {
    try {
      await sendRequest({ receiverId });
    } catch (e) {
      console.error('Failed to send friend request:', e);
    }
  }, [sendRequest]);

  return (
    <div className="bg-white rounded-xl shadow-lg p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Add Friends</h2>
      <input
        type="text"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Search by username..."
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-3"
      />
      {results && results.length > 0 && (
        <div className="space-y-2">
          {results.map((user) => (
            <div key={user.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50">
              <div className="flex items-center gap-3">
                <UserAvatar name={user.displayName || user.username} image={null} size="sm" />
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {user.displayName || user.username}
                  </p>
                  <p className="text-xs text-gray-500">@{user.username}</p>
                </div>
              </div>
              {user.friendshipStatus === 'none' && (
                <button
                  onClick={() => void handleSendRequest(user.id)}
                  className="px-3 py-1 text-xs font-medium text-blue-600 border border-blue-300 rounded-lg hover:bg-blue-50 transition-colors"
                >
                  Add Friend
                </button>
              )}
              {user.friendshipStatus === 'pending_sent' && (
                <span className="px-3 py-1 text-xs font-medium text-gray-500">Pending</span>
              )}
              {user.friendshipStatus === 'pending_received' && (
                <span className="px-3 py-1 text-xs font-medium text-amber-600">Wants to be friends</span>
              )}
              {user.friendshipStatus === 'accepted' && (
                <span className="px-3 py-1 text-xs font-medium text-green-600">Already Friends</span>
              )}
            </div>
          ))}
        </div>
      )}
      {results && results.length === 0 && debouncedQuery.length >= 2 && (
        <p className="text-sm text-gray-500 text-center py-2">No users found</p>
      )}
    </div>
  );
}

function PendingRequests() {
  const pendingRequests = useQuery(api.friends.listPendingRequests);
  const sentRequests = useQuery(api.friends.listSentRequests);
  const acceptRequest = useMutation(api.friends.acceptRequest);
  const rejectRequest = useMutation(api.friends.rejectRequest);
  const cancelRequest = useMutation(api.friends.cancelRequest);

  const hasPending = pendingRequests && pendingRequests.length > 0;
  const hasSent = sentRequests && sentRequests.length > 0;

  if (!hasPending && !hasSent) return null;

  return (
    <div className="bg-white rounded-xl shadow-lg p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Pending Requests</h2>

      {hasPending && (
        <div className="space-y-2 mb-4">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Incoming</h3>
          {pendingRequests.map((req) => (
            <div key={req.friendshipId} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50">
              <div className="flex items-center gap-3">
                <UserAvatar name={req.displayName || req.username} image={req.image} size="sm" />
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {req.displayName || req.username}
                  </p>
                  {req.username && <p className="text-xs text-gray-500">@{req.username}</p>}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => void acceptRequest({ friendshipId: req.friendshipId })}
                  className="px-3 py-1 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-500 transition-colors"
                >
                  Accept
                </button>
                <button
                  onClick={() => void rejectRequest({ friendshipId: req.friendshipId })}
                  className="px-3 py-1 text-xs font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {hasSent && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Sent</h3>
          {sentRequests.map((req) => (
            <div key={req.friendshipId} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50">
              <div className="flex items-center gap-3">
                <UserAvatar name={req.displayName || req.username} image={req.image} size="sm" />
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {req.displayName || req.username}
                  </p>
                  {req.username && <p className="text-xs text-gray-500">@{req.username}</p>}
                </div>
              </div>
              <button
                onClick={() => void cancelRequest({ friendshipId: req.friendshipId })}
                className="px-3 py-1 text-xs font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FriendsList() {
  const friends = useQuery(api.friends.listFriends);
  const removeFriend = useMutation(api.friends.removeFriend);

  if (!friends || friends.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Friends</h2>
        <p className="text-sm text-gray-500">No friends yet. Search for users above to add friends!</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-lg p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Friends</h2>
      <div className="space-y-2">
        {friends.map((friend) => (
          <div key={friend.friendshipId} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50">
            <div className="flex items-center gap-3">
              <div className="relative">
                <UserAvatar name={friend.displayName || friend.username} image={friend.image} size="sm" />
                <div
                  className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${
                    friend.online ? 'bg-green-500' : 'bg-gray-300'
                  }`}
                />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {friend.displayName || friend.username}
                </p>
                {friend.username && <p className="text-xs text-gray-500">@{friend.username}</p>}
              </div>
            </div>
            <button
              onClick={() => void removeFriend({ friendshipId: friend.friendshipId })}
              className="px-3 py-1 text-xs font-medium text-red-600 border border-red-300 rounded-lg hover:bg-red-50 transition-colors"
            >
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function UserAvatar({ name, image, size }: { name: string | null; image: string | null; size: 'sm' | 'md' }) {
  const sizeClasses = size === 'sm' ? 'w-8 h-8 text-sm' : 'w-12 h-12 text-lg';

  if (image) {
    return <img src={image} alt={name || 'User'} className={`${sizeClasses} rounded-full`} />;
  }

  return (
    <div className={`${sizeClasses} rounded-full bg-blue-600 flex items-center justify-center text-white font-medium`}>
      {name?.[0]?.toUpperCase() || '?'}
    </div>
  );
}

export default function ProfilePage() {
  return (
    <AuthGuard>
      <ProfileContent />
    </AuthGuard>
  );
}
