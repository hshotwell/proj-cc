'use client';

import { useState, useRef, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation } from 'convex/react';
import Link from 'next/link';
import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';
import { AuthGuard } from '@/components/auth';
import { useAuthStore } from '@/store/authStore';
import { PLAYER_COLORS } from '@/game/constants';
import { ColorPicker } from '@/components/ui/ColorPicker';

const AVAILABLE_COLORS = Object.values(PLAYER_COLORS);

const PLAYER_COUNT_OPTIONS = [
  { count: 2, label: '2 Players' },
  { count: 3, label: '3 Players' },
  { count: 4, label: '4 Players' },
  { count: 6, label: '6 Players' },
];

function FriendPicker({ friends, onSelect, onClose }: {
  friends: { id: Id<"users">; username: string | null; online: boolean }[];
  onSelect: (friendId: Id<"users">) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  if (friends.length === 0) {
    return (
      <div ref={ref} className="absolute right-0 top-full mt-1 z-10 bg-white border border-gray-200 rounded-lg shadow-lg p-3 w-56">
        <p className="text-xs text-gray-400">No friends available to invite</p>
      </div>
    );
  }

  return (
    <div ref={ref} className="absolute right-0 top-full mt-1 z-10 bg-white border border-gray-200 rounded-lg shadow-lg py-1 w-56 max-h-48 overflow-y-auto">
      {friends.map((friend) => (
        <button
          key={friend.id}
          onClick={() => onSelect(friend.id)}
          className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
        >
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${friend.online ? 'bg-green-500' : 'bg-gray-300'}`} />
          <span className="text-gray-900 truncate">{friend.username || 'Unknown'}</span>
        </button>
      ))}
    </div>
  );
}

function LobbyContent() {
  const params = useParams();
  const router = useRouter();
  const gameId = params.id as Id<"onlineGames">;
  const { user } = useAuthStore();

  const game = useQuery(api.onlineGames.getLobby, { gameId });
  const updateConfig = useMutation(api.onlineGames.updateBoardConfig);
  const selectColor = useMutation(api.onlineGames.selectColor);
  const configureAI = useMutation(api.onlineGames.configureAI);
  const removeAIMutation = useMutation(api.onlineGames.removeAI);
  const toggleReady = useMutation(api.onlineGames.toggleReady);
  const leaveLobby = useMutation(api.onlineGames.leaveLobby);
  const inviteToLobbyMutation = useMutation(api.onlineGames.inviteToLobby);
  const cancelSlotInviteMutation = useMutation(api.onlineGames.cancelSlotInvite);

  const [aiDifficulty, setAiDifficulty] = useState<string>('medium');
  const [aiPersonality, setAiPersonality] = useState<string>('generalist');
  const [inviteSlot, setInviteSlot] = useState<number | null>(null);

  // Redirect when game starts
  if (game?.status === 'playing') {
    router.replace(`/online/${gameId}`);
    return null;
  }

  if (game?.status === 'abandoned') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 mb-4">This lobby has been closed.</p>
          <Link href="/profile" className="text-blue-600 hover:underline">Back to Profile</Link>
        </div>
      </div>
    );
  }

  if (!game) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  const isHost = game.hostId === user?.id;
  const players = game.players as any[];
  const mySlot = players.find((p: any) => p.userId === user?.id);
  const hasEmptySlots = players.some((p: any) => p.type === 'empty');

  // Friends list for inviting (only query when host)
  const friends = useQuery(api.friends.listFriends, isHost ? {} : "skip");
  const playerUserIds = new Set(players.filter((p: any) => p.userId).map((p: any) => p.userId));
  const availableFriends = (friends ?? []).filter((f) => !playerUserIds.has(f.id));

  // Colors already taken by other players
  const takenColors = players
    .filter((p: any) => p.userId !== user?.id)
    .map((p: any) => p.color);

  const handlePlayerCountChange = async (count: number) => {
    try {
      await updateConfig({
        gameId,
        boardType: game.boardType as 'standard' | 'custom',
        playerCount: count,
      });
    } catch (e) {
      console.error('Failed to update config:', e);
    }
  };

  const handleColorSelect = async (color: string) => {
    try {
      await selectColor({ gameId, color });
    } catch (e) {
      console.error('Failed to select color:', e);
    }
  };

  const handleAddAI = async (slot: number) => {
    try {
      await configureAI({
        gameId,
        slot,
        aiConfig: { difficulty: aiDifficulty, personality: aiPersonality },
      });
    } catch (e) {
      console.error('Failed to add AI:', e);
    }
  };

  const handleRemoveAI = async (slot: number) => {
    try {
      await removeAIMutation({ gameId, slot });
    } catch (e) {
      console.error('Failed to remove AI:', e);
    }
  };

  const handleToggleReady = async () => {
    try {
      await toggleReady({ gameId });
    } catch (e) {
      console.error('Failed to toggle ready:', e);
    }
  };

  const handleInviteFriend = async (friendId: Id<"users">, slot: number) => {
    try {
      await inviteToLobbyMutation({ gameId, friendId, slot });
      setInviteSlot(null);
    } catch (e) {
      console.error('Failed to invite friend:', e);
    }
  };

  const handleCancelInvite = async (slot: number) => {
    try {
      await cancelSlotInviteMutation({ gameId, slot });
    } catch (e) {
      console.error('Failed to cancel invite:', e);
    }
  };

  const handleLeave = async () => {
    try {
      await leaveLobby({ gameId });
      router.push('/profile');
    } catch (e) {
      console.error('Failed to leave lobby:', e);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="mb-6">
          <Link href="/profile" className="text-blue-600 hover:underline text-sm">
            &larr; Back to Profile
          </Link>
        </div>

        <h1 className="text-3xl font-bold text-gray-900 mb-6">Game Lobby</h1>

        {/* Board Config (host only) */}
        {isHost && (
          <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Game Setup</h2>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Players</label>
              <div className="flex gap-2">
                {PLAYER_COUNT_OPTIONS.map(({ count, label }) => (
                  <button
                    key={count}
                    onClick={() => void handlePlayerCountChange(count)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      game.playerCount === count
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* AI Config for adding to empty slots */}
            {hasEmptySlots && (
              <div className="border-t pt-4 mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">AI Settings (for empty slots)</label>
                <div className="flex gap-4 mb-2">
                  <select
                    value={aiDifficulty}
                    onChange={(e) => setAiDifficulty(e.target.value)}
                    className="px-3 py-1.5 border rounded-lg text-sm"
                  >
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                  <select
                    value={aiPersonality}
                    onChange={(e) => setAiPersonality(e.target.value)}
                    className="px-3 py-1.5 border rounded-lg text-sm"
                  >
                    <option value="generalist">Generalist</option>
                    <option value="defensive">Defensive</option>
                    <option value="aggressive">Aggressive</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Player Slots */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Players</h2>
          <div className="space-y-3">
            {players.map((player: any, index: number) => (
              <div
                key={index}
                className="flex items-center justify-between py-3 px-4 rounded-lg border border-gray-200"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-6 h-6 rounded-full border-2 border-white shadow"
                    style={{ backgroundColor: player.color }}
                  />
                  <div>
                    {player.type === 'human' && (
                      <span className="text-sm font-medium text-gray-900">
                        {player.username}
                        {player.userId === game.hostId && (
                          <span className="ml-2 text-xs text-blue-600">(Host)</span>
                        )}
                      </span>
                    )}
                    {player.type === 'ai' && (
                      <span className="text-sm font-medium text-gray-700">
                        AI ({player.aiConfig?.difficulty}, {player.aiConfig?.personality})
                      </span>
                    )}
                    {player.type === 'empty' && (
                      <span className="text-sm text-gray-400 italic">Empty slot</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* Ready indicator */}
                  {player.type === 'human' && (
                    <span className={`text-xs font-medium px-2 py-1 rounded ${
                      player.isReady
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-500'
                    }`}>
                      {player.isReady ? 'Ready' : 'Not Ready'}
                    </span>
                  )}
                  {player.type === 'ai' && (
                    <span className="text-xs font-medium px-2 py-1 rounded bg-green-100 text-green-700">
                      Ready
                    </span>
                  )}

                  {/* Host controls for empty slots */}
                  {isHost && player.type === 'empty' && (
                    <div className="relative flex items-center gap-1">
                      <button
                        onClick={() => setInviteSlot(inviteSlot === index ? null : index)}
                        className="px-3 py-1 text-xs font-medium text-purple-600 border border-purple-300 rounded-lg hover:bg-purple-50"
                      >
                        Invite
                      </button>
                      <button
                        onClick={() => void handleAddAI(index)}
                        className="px-3 py-1 text-xs font-medium text-blue-600 border border-blue-300 rounded-lg hover:bg-blue-50"
                      >
                        Add AI
                      </button>
                      {inviteSlot === index && (
                        <FriendPicker
                          friends={availableFriends}
                          onSelect={(friendId) => void handleInviteFriend(friendId, index)}
                          onClose={() => setInviteSlot(null)}
                        />
                      )}
                    </div>
                  )}
                  {/* Host cancel button for invited (non-host) humans */}
                  {isHost && player.type === 'human' && player.userId !== game.hostId && player.userId !== user?.id && (
                    <button
                      onClick={() => void handleCancelInvite(index)}
                      className="px-3 py-1 text-xs font-medium text-red-600 border border-red-300 rounded-lg hover:bg-red-50"
                    >
                      Cancel
                    </button>
                  )}
                  {isHost && player.type === 'ai' && (
                    <button
                      onClick={() => void handleRemoveAI(index)}
                      className="px-3 py-1 text-xs font-medium text-red-600 border border-red-300 rounded-lg hover:bg-red-50"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Color Picker */}
        {mySlot && (
          <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Your Color</h2>
            <div className="flex gap-2 flex-wrap items-center">
              {AVAILABLE_COLORS.map((color) => {
                const isTaken = takenColors.includes(color);
                const isSelected = mySlot.color === color;
                return (
                  <button
                    key={color}
                    disabled={isTaken}
                    onClick={() => void handleColorSelect(color)}
                    className={`w-7 h-7 rounded-full border-2 transition-all ${
                      isSelected
                        ? 'border-gray-800 ring-2 ring-offset-1 ring-gray-400'
                        : isTaken
                          ? 'border-gray-300 opacity-40 cursor-not-allowed'
                          : 'border-white shadow hover:scale-110'
                    }`}
                    style={{ backgroundColor: color }}
                  />
                );
              })}
              <ColorPicker
                value={mySlot.color}
                onChange={(color) => void handleColorSelect(color)}
              />
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          {mySlot && (
            <button
              onClick={() => void handleToggleReady()}
              className={`flex-1 px-6 py-3 rounded-lg font-medium transition-colors ${
                mySlot.isReady
                  ? 'bg-green-600 text-white hover:bg-green-500'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              {mySlot.isReady ? 'Ready!' : 'Click to Ready Up'}
            </button>
          )}

          <button
            onClick={() => void handleLeave()}
            className="px-6 py-3 bg-red-50 text-red-600 font-medium rounded-lg hover:bg-red-100 border border-red-200 transition-colors"
          >
            Leave
          </button>
        </div>
      </div>
    </div>
  );
}

export default function LobbyPage() {
  return (
    <AuthGuard>
      <LobbyContent />
    </AuthGuard>
  );
}
