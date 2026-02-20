'use client';

import { useRouter } from 'next/navigation';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useAuthStore } from '@/store/authStore';

export function InviteNotification() {
  const { isAuthenticated } = useAuthStore();
  const router = useRouter();

  const invites = useQuery(
    api.gameInvites.listPendingInvites,
    isAuthenticated ? {} : "skip"
  );
  const acceptInvite = useMutation(api.gameInvites.acceptInvite);
  const declineInvite = useMutation(api.gameInvites.declineInvite);

  if (!invites || invites.length === 0) return null;

  const handleAccept = async (inviteId: (typeof invites)[0]['inviteId'], gameId: (typeof invites)[0]['gameId']) => {
    try {
      await acceptInvite({ inviteId });
      router.push(`/lobby/${gameId}`);
    } catch (e) {
      console.error('Failed to accept invite:', e);
    }
  };

  const handleDecline = async (inviteId: (typeof invites)[0]['inviteId']) => {
    try {
      await declineInvite({ inviteId });
    } catch (e) {
      console.error('Failed to decline invite:', e);
    }
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-50 pointer-events-none">
      <div className="max-w-lg mx-auto p-2 space-y-2">
        {invites.map((invite) => (
          <div
            key={invite.inviteId}
            className="pointer-events-auto bg-white border border-blue-200 rounded-lg shadow-lg p-4 flex items-center justify-between gap-3 animate-in slide-in-from-top"
          >
            <div className="flex items-center gap-3 min-w-0">
              {invite.senderImage ? (
                <img
                  src={invite.senderImage}
                  alt=""
                  className="w-8 h-8 rounded-full flex-shrink-0"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-medium flex-shrink-0">
                  {invite.senderUsername[0]?.toUpperCase() || '?'}
                </div>
              )}
              <p className="text-sm text-gray-900 truncate">
                <span className="font-semibold">{invite.senderUsername}</span>
                {' '}invited you to play!
              </p>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <button
                onClick={() => void handleAccept(invite.inviteId, invite.gameId)}
                className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-500 transition-colors"
              >
                Accept
              </button>
              <button
                onClick={() => void handleDecline(invite.inviteId)}
                className="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
              >
                Decline
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
