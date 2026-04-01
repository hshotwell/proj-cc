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
import { getSavedGamesList, deleteSavedGame } from '@/game/persistence';
import { getPlayerColor, getPlayerDisplayName } from '@/game/colors';
import { EXTRA_COLORS_NO_GEMS, ROW3_DISPLAY_ORDER, ROW4_DISPLAY_ORDER, ROW5_DISPLAY_ORDER, GEM_COLORS, NEUTRAL_COLORS, getMetallicSwatchStyle, getGemSwatchStyle, getGemSimpleBackground, COLOR_DISPLAY_ORDER, getColorName } from '@/game/constants';
import { FlowerSwatch, EggSwatch, ColorSwatch, MetallicGemTwinkle } from '@/components/ui/SpecialSwatch';
import { ColorPicker } from '@/components/ui/ColorPicker';
import type { SavedGameSummary } from '@/types/replay';
import type { Id } from '../../../convex/_generated/dataModel';

type Tab = 'profile' | 'friends' | 'match-history';

function ProfileContent() {
  const { user } = useAuthStore();
  const { signOut } = useAuthActions();
  const router = useRouter();
  const { darkMode, toggleDarkMode, favoriteColor, setFavoriteColor } = useSettingsStore();

  const [activeTab, setActiveTab] = useState<Tab>('profile');

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
          {(['profile', 'friends', 'match-history'] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === tab
                  ? 'bg-white text-gray-900 shadow'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab === 'match-history' ? 'Match History' : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {activeTab === 'profile' && (
          <div className="space-y-6">
            {/* Profile Info */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="flex items-center gap-6">
                {user?.image ? (
                  <img
                    src={user.image}
                    alt="Profile"
                    className="w-20 h-20 rounded-full"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-blue-600 flex items-center justify-center text-white text-2xl font-bold">
                    {(user?.username || user?.name || user?.email)?.[0]?.toUpperCase() || '?'}
                  </div>
                )}

                <div className="flex-1">
                  <p className="text-xl font-semibold text-gray-900">
                    {user?.username || user?.name || 'User'}
                  </p>
                  {user?.email && (
                    <p className="text-sm text-gray-500 mt-1">{user.email}</p>
                  )}
                </div>
              </div>
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

              {/* Favorite Color */}
              <div className="mt-6 pt-4 border-t border-gray-100">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    {favoriteColor && (
                      <ColorSwatch color={favoriteColor} className="w-5 h-5 flex-shrink-0" />
                    )}
                    <div>
                      <div className="text-sm font-medium text-gray-700">Favorite Color</div>
                      <div className="text-xs text-gray-500">
                        {favoriteColor ? 'Auto-applied when joining games' : 'None selected'}
                      </div>
                    </div>
                  </div>
                  {favoriteColor && (
                    <button
                      onClick={() => setFavoriteColor(null)}
                      className="text-xs text-gray-500 hover:text-gray-700"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className="flex gap-2 flex-wrap items-center">
                  {COLOR_DISPLAY_ORDER.map((color) => (
                    <button
                      key={color}
                      onClick={() => setFavoriteColor(color)}
                      className={`w-7 h-7 rounded-full border-2 transition-all ${
                        favoriteColor?.toLowerCase() === color.toLowerCase()
                          ? 'border-gray-800 ring-2 ring-offset-1 ring-gray-400'
                          : 'border-white shadow hover:scale-110'
                      }`}
                      style={{ backgroundColor: color }}
                      title={`Select: ${getColorName(color)}`}
                    />
                  ))}
                  {NEUTRAL_COLORS.map((color) => (
                    <button
                      key={color}
                      onClick={() => setFavoriteColor(color)}
                      className={`w-7 h-7 rounded-full border-2 transition-all ${
                        favoriteColor?.toLowerCase() === color.toLowerCase()
                          ? 'border-gray-800 ring-2 ring-offset-1 ring-gray-400'
                          : color === '#ffffff'
                            ? 'border-gray-400 shadow hover:scale-110'
                            : 'border-white shadow hover:scale-110'
                      }`}
                      style={{ backgroundColor: color }}
                      title={`Select: ${getColorName(color)}`}
                    />
                  ))}
                  <ColorPicker
                    value={favoriteColor ?? '#888888'}
                    onChange={(color) => setFavoriteColor(color)}
                  />
                </div>
                <div className="flex gap-2 flex-wrap items-center mt-2">
                  {ROW3_DISPLAY_ORDER.map((color, idx) => {
                    if (color === null) return <div key={`blank-${idx}`} className="w-7 h-7 flex-shrink-0" />;
                    const metallicStyle = getMetallicSwatchStyle(color);
                    const isRainbow = color === 'rainbow';
                    const bgStyle = isRainbow
                      ? { background: 'conic-gradient(from 0deg, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)' }
                      : { backgroundColor: color, ...metallicStyle };
                    return (
                      <button
                        key={color}
                        onClick={() => setFavoriteColor(color)}
                        className={`w-7 h-7 rounded-full transition-all${metallicStyle ? ' metallic-swatch' : ''}${isRainbow ? ' rainbow-swatch' : ''} ${
                          favoriteColor?.toLowerCase() === color.toLowerCase()
                            ? 'border-2 border-gray-800 ring-2 ring-offset-1 ring-gray-400'
                            : 'shadow hover:scale-110'
                        }`}
                        style={bgStyle}
                        title={`Select: ${getColorName(color)}`}
                      >
                        {metallicStyle && <MetallicGemTwinkle swStyle={metallicStyle} />}
                      </button>
                    );
                  })}
                </div>
                <div className="flex gap-2 flex-wrap items-center mt-2">
                  {GEM_COLORS.map((color) => {
                    const gemStyle = getGemSwatchStyle(color);
                    const isSelected = favoriteColor?.toLowerCase() === color.toLowerCase();
                    const isOpal = color === 'opal';
                    const opalBg = isOpal ? { background: 'conic-gradient(from 0deg, #ef4444 0deg 60deg, #facc15 60deg 120deg, #22c55e 120deg 180deg, #22d3ee 180deg 240deg, #3b82f6 240deg 300deg, #a855f7 300deg 360deg)' } : undefined;
                    return (
                      <div
                        key={color}
                        className={`relative w-7 h-7 flex items-center justify-center flex-shrink-0 transition-all ${!isSelected ? 'hover:scale-110' : ''}`}
                      >
                        <div
                          className="absolute"
                          style={{
                            width: '32px', height: '32px', top: '-2px', left: '-2px',
                            clipPath: 'polygon(50% 4%, 93% 27%, 93% 73%, 50% 96%, 7% 73%, 7% 27%)',
                            backgroundColor: isSelected ? '#9ca3af' : 'transparent',
                          }}
                        />
                        <div
                          className="absolute"
                          style={{
                            inset: '1px',
                            clipPath: 'polygon(50% 4%, 93% 27%, 93% 73%, 50% 96%, 7% 73%, 7% 27%)',
                            backgroundColor: isSelected ? 'white' : 'transparent',
                          }}
                        />
                        <button
                          onClick={() => setFavoriteColor(color)}
                          className={`relative z-10 w-6 h-6 gem-swatch${isOpal ? ' opal-swatch' : ''}`}
                          style={isOpal ? { ...opalBg, ...gemStyle } : { background: getGemSimpleBackground(color) ?? color, ...gemStyle }}
                          title={`Select: ${getColorName(color)}`}
                        >
                          {gemStyle && <MetallicGemTwinkle swStyle={gemStyle} />}
                        </button>
                      </div>
                    );
                  })}
                </div>
                {/* Row 4: flowers */}
                <div className="flex gap-2 flex-wrap items-center mt-2">
                  {ROW4_DISPLAY_ORDER.map((color) => (
                    <button
                      key={color}
                      onClick={() => setFavoriteColor(color)}
                      className={`w-7 h-7 transition-all flex items-center justify-center ${
                        favoriteColor?.toLowerCase() === color.toLowerCase()
                          ? 'ring-2 ring-gray-400 rounded-full'
                          : 'hover:scale-110'
                      }`}
                      title={`Select: ${getColorName(color)}`}
                    >
                      <FlowerSwatch color={color} className="w-full h-full" />
                    </button>
                  ))}
                </div>
                {/* Row 5: eggs */}
                <div className="flex gap-2 flex-wrap items-center mt-2">
                  {ROW5_DISPLAY_ORDER.map((color) => (
                    <button
                      key={color}
                      onClick={() => setFavoriteColor(color)}
                      className={`w-7 h-7 transition-all flex items-center justify-center ${
                        favoriteColor?.toLowerCase() === color.toLowerCase()
                          ? 'ring-2 ring-gray-400 rounded-full'
                          : 'hover:scale-110'
                      }`}
                      title={`Select: ${getColorName(color)}`}
                    >
                      <EggSwatch color={color} className="w-full h-full" />
                    </button>
                  ))}
                </div>
              </div>
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
        {activeTab === 'match-history' && <MatchHistoryTab />}
      </div>
    </div>
  );
}

function MatchHistoryTab() {
  const router = useRouter();
  const [games, setGames] = useState<SavedGameSummary[]>([]);

  useEffect(() => {
    setGames(getSavedGamesList());
  }, []);

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteSavedGame(id);
    setGames(getSavedGamesList());
  };

  if (games.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Match History</h2>
        <p className="text-sm text-gray-500">No saved games yet. Play a game to see it here!</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {games.map((game) => {
        const winnerColor = getPlayerColor(game.winner, game.playerColors);
        const winnerName = getPlayerDisplayName(game.winner, game.activePlayers);
        const dateStr = new Date(game.dateSaved).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });

        return (
          <div
            key={game.id}
            onClick={() => router.push(`/replay/${game.id}`)}
            className="bg-white rounded-lg shadow p-4 cursor-pointer hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="w-5 h-5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: winnerColor }}
                />
                <div>
                  <div className="font-medium text-gray-900">
                    <span style={{ color: winnerColor }}>{winnerName}</span> won
                  </div>
                  <div className="text-xs text-gray-500">
                    {game.playerCount} players &middot; {game.totalMoves} moves &middot; {dateStr}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {game.longestHop > 0 && (
                  <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">
                    {game.longestHop}-jump hop
                  </span>
                )}
                <button
                  onClick={(e) => handleDelete(game.id, e)}
                  className="text-gray-400 hover:text-red-500 transition-colors p-1"
                  title="Delete"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        );
      })}
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
            <div key={user.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-100">
              <div className="flex items-center gap-3">
                <UserAvatar name={user.username} image={null} size="sm" />
                <p className="text-sm font-medium text-black">{user.username}</p>
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
            <div key={req.friendshipId} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-100">
              <div className="flex items-center gap-3">
                <UserAvatar name={req.username} image={req.image} size="sm" />
                <p className="text-sm font-medium text-black">{req.username}</p>
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
            <div key={req.friendshipId} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-100">
              <div className="flex items-center gap-3">
                <UserAvatar name={req.username} image={req.image} size="sm" />
                <p className="text-sm font-medium text-black">{req.username}</p>
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
  const createLobby = useMutation(api.onlineGames.createLobby);
  const router = useRouter();

  const handleChallenge = useCallback(async (friendId: Id<"users">) => {
    try {
      const gameId = await createLobby({ playerCount: 2, receiverId: friendId });
      router.push(`/lobby/${gameId}`);
    } catch (e) {
      console.error('Failed to create lobby:', e);
    }
  }, [createLobby, router]);

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
          <div key={friend.friendshipId} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-100">
            <div className="flex items-center gap-3">
              <div className="relative">
                <UserAvatar name={friend.username} image={friend.image} size="sm" />
                <div
                  className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${
                    friend.online ? 'bg-green-500' : 'bg-gray-300'
                  }`}
                />
              </div>
              <p className="text-sm font-medium text-black">{friend.username}</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => void handleChallenge(friend.id)}
                className="px-3 py-1 text-xs font-medium text-blue-600 border border-blue-300 rounded-lg hover:bg-blue-50 transition-colors"
              >
                Challenge
              </button>
              <button
                onClick={() => void removeFriend({ friendshipId: friend.friendshipId })}
                className="px-3 py-1 text-xs font-medium text-red-600 border border-red-300 rounded-lg hover:bg-red-50 transition-colors"
              >
                Remove
              </button>
            </div>
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
