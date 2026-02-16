'use client';

import { useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import Link from 'next/link';
import { AuthGuard } from '@/components/auth';
import { useAuthStore } from '@/store/authStore';

function AccountContent() {
  const { user } = useAuthStore();
  const updateProfile = useMutation(api.users.updateProfile);
  const [displayName, setDisplayName] = useState(user?.name || '');
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setMessage(null);

    try {
      await updateProfile({ displayName });
      setMessage({ type: 'success', text: 'Profile updated successfully!' });
    } catch {
      setMessage({ type: 'error', text: 'Failed to update profile. Please try again.' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="mb-6">
          <Link href="/" className="text-blue-600 hover:underline text-sm">
            &larr; Back to Home
          </Link>
        </div>

        <h1 className="text-3xl font-bold text-gray-900 mb-8">Account Settings</h1>

        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Profile</h2>

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

        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Sync Status</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between py-2 border-b border-gray-100">
              <span className="text-gray-600">Settings</span>
              <span className="text-green-600 font-medium">Synced</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-gray-100">
              <span className="text-gray-600">Custom Boards</span>
              <span className="text-green-600 font-medium">Synced</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-gray-600">Game History</span>
              <span className="text-green-600 font-medium">Synced</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Data Management</h2>
          <p className="text-gray-600 mb-4">
            Export your data or delete your account.
          </p>
          <div className="flex gap-4">
            <button className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
              Export Data
            </button>
            <button className="px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors">
              Delete Account
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AccountPage() {
  return (
    <AuthGuard>
      <AccountContent />
    </AuthGuard>
  );
}
