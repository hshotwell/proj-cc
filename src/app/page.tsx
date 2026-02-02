import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center">
      <main className="text-center px-4">
        {/* Logo / Title */}
        <div className="mb-8">
          <h1 className="text-5xl md:text-7xl font-bold text-white mb-4">
            Chinese Checkers
          </h1>
          <p className="text-xl text-gray-300 max-w-md mx-auto">
            The classic strategy game for 2-6 players
          </p>
        </div>

        {/* Star decoration */}
        <div className="mb-12">
          <svg
            viewBox="-100 -100 200 200"
            className="w-48 h-48 mx-auto"
            aria-hidden="true"
          >
            {/* Simple star shape */}
            <polygon
              points="0,-90 20,-30 85,-30 30,10 50,80 0,40 -50,80 -30,10 -85,-30 -20,-30"
              fill="none"
              stroke="#60a5fa"
              strokeWidth="3"
              opacity="0.6"
            />
            {/* Inner star */}
            <polygon
              points="0,-50 12,-18 48,-18 18,5 28,45 0,22 -28,45 -18,5 -48,-18 -12,-18"
              fill="#3b82f6"
              opacity="0.3"
            />
            {/* Center circle */}
            <circle cx="0" cy="0" r="20" fill="#3b82f6" opacity="0.5" />
          </svg>
        </div>

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/play"
            className="inline-block px-12 py-4 text-xl font-semibold text-white bg-blue-600 rounded-full hover:bg-blue-500 transition-colors shadow-lg hover:shadow-xl"
          >
            Play Now
          </Link>
          <Link
            href="/editor"
            className="inline-block px-12 py-4 text-xl font-semibold text-white bg-purple-600 rounded-full hover:bg-purple-500 transition-colors shadow-lg hover:shadow-xl"
          >
            Board Editor
          </Link>
          <Link
            href="/replays"
            className="inline-block px-12 py-4 text-xl font-semibold text-white bg-amber-500 rounded-full hover:bg-amber-400 transition-colors shadow-lg hover:shadow-xl"
          >
            Past Games
          </Link>
          <Link
            href="/training"
            className="inline-block px-12 py-4 text-xl font-semibold text-white bg-green-600 rounded-full hover:bg-green-500 transition-colors shadow-lg hover:shadow-xl"
          >
            AI Training
          </Link>
        </div>

        {/* Features */}
        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8 max-w-3xl mx-auto text-gray-300">
          <div>
            <div className="text-3xl mb-2">2-6</div>
            <div className="text-sm">Players</div>
          </div>
          <div>
            <div className="text-3xl mb-2">Local</div>
            <div className="text-sm">Hotseat Multiplayer</div>
          </div>
          <div>
            <div className="text-3xl mb-2">Free</div>
            <div className="text-sm">No Sign-up Required</div>
          </div>
        </div>
      </main>
    </div>
  );
}
