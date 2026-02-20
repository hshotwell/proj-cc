'use client';

import Link from 'next/link';
import { useAuthStore } from '@/store/authStore';

// Player colors for the animated star points
const STAR_COLORS = [
  '#ef4444', // red
  '#22c55e', // green
  '#3b82f6', // blue
  '#eab308', // yellow
  '#a855f7', // purple
  '#f97316', // orange
];

// 6 triangle points of the star, each defined by 3 vertices
// Triangles radiate outward from a central hexagon
const STAR_TRIANGLES = [
  { points: '-17.5,-30.3 17.5,-30.3 0,-70', index: 0 },    // top
  { points: '17.5,-30.3 35,0 60.6,-35', index: 1 },        // upper-right
  { points: '35,0 17.5,30.3 60.6,35', index: 2 },          // lower-right
  { points: '17.5,30.3 -17.5,30.3 0,70', index: 3 },       // bottom
  { points: '-17.5,30.3 -35,0 -60.6,35', index: 4 },       // lower-left
  { points: '-35,0 -17.5,-30.3 -60.6,-35', index: 5 },     // upper-left
];

export default function HomePage() {
  const { user, isAuthenticated, isLoading } = useAuthStore();

  // Check if guest
  const isGuest = typeof window !== 'undefined' && localStorage.getItem('sternhalma-guest') === 'true';

  return (
    <div className="min-h-screen bg-white flex items-center justify-center relative">
      {/* User header */}
      <div className="absolute top-4 right-4 flex items-center gap-3">
        {isLoading ? (
          <div className="w-6 h-6 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
        ) : isAuthenticated && user ? (
          <Link
            href="/profile"
            className="text-base font-semibold text-gray-700 hover:underline"
          >
            {user.username || user.name || user.email}
          </Link>
        ) : isGuest ? (
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">Playing as Guest</span>
            <Link
              href="/auth/signin"
              className="px-3 py-1.5 text-sm text-blue-600 hover:text-blue-700 border border-blue-300 rounded-lg hover:bg-blue-50 transition-colors"
            >
              Create Account
            </Link>
          </div>
        ) : (
          <Link
            href="/auth/signin"
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-500 transition-colors"
          >
            Sign In
          </Link>
        )}
      </div>

      <style>{`
        @keyframes colorCycle {
          0%, 100% { fill: ${STAR_COLORS[0]}; }
          16.67% { fill: ${STAR_COLORS[1]}; }
          33.33% { fill: ${STAR_COLORS[2]}; }
          50% { fill: ${STAR_COLORS[3]}; }
          66.67% { fill: ${STAR_COLORS[4]}; }
          83.33% { fill: ${STAR_COLORS[5]}; }
        }
      `}</style>

      <main className="text-center px-4">
        {/* Logo / Title */}
        <div className="mb-4">
          <h1 className="text-5xl md:text-7xl font-bold text-gray-900 mb-2">
            STERNHALMA
          </h1>
          <p className="text-xl md:text-2xl italic text-gray-600">
            Chinese Checkers
          </p>
        </div>

        {/* 6-pointed star decoration with animated colors */}
        <div className="mb-6">
          <svg
            viewBox="-100 -100 200 200"
            className="w-56 h-56 mx-auto"
            aria-hidden="true"
          >
            {/* 6 triangle points with cycling colors */}
            {STAR_TRIANGLES.map((triangle) => (
              <polygon
                key={triangle.index}
                points={triangle.points}
                style={{
                  fill: STAR_COLORS[triangle.index],
                  animation: 'colorCycle 12s ease-in-out infinite',
                  animationDelay: `${triangle.index * 2}s`,
                }}
              />
            ))}
            {/* Center hexagon - grey */}
            <polygon
              points="-17.5,-30.3 17.5,-30.3 35,0 17.5,30.3 -17.5,30.3 -35,0"
              fill="#9ca3af"
            />
          </svg>
        </div>

        {/* Action buttons - stacked vertically */}
        <div className="flex flex-col gap-4 justify-center items-center max-w-xs mx-auto mb-16">
          <Link
            href="/play"
            className="w-full inline-block px-12 py-4 text-xl font-semibold text-white bg-blue-600 rounded-full hover:bg-blue-500 transition-colors shadow-lg hover:shadow-xl"
          >
            Play Now
          </Link>
          <Link
            href="/editor"
            className="w-full inline-block px-12 py-4 text-xl font-semibold text-white bg-purple-600 rounded-full hover:bg-purple-500 transition-colors shadow-lg hover:shadow-xl"
          >
            Board Editor
          </Link>
          <Link
            href="/training"
            className="w-full inline-block px-12 py-4 text-xl font-semibold text-white bg-green-600 rounded-full hover:bg-green-500 transition-colors shadow-lg hover:shadow-xl"
          >
            AI Training
          </Link>
        </div>

      </main>
    </div>
  );
}
