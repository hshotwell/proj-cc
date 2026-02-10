import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <main className="text-center px-4">
        {/* Logo / Title */}
        <div className="mb-8">
          <h1 className="text-5xl md:text-7xl font-bold text-gray-900 mb-2">
            STERNHALMA
          </h1>
          <p className="text-xl md:text-2xl italic text-gray-600">
            Chinese Checkers
          </p>
        </div>

        {/* 6-pointed star decoration */}
        <div className="mb-12">
          <svg
            viewBox="-100 -100 200 200"
            className="w-48 h-48 mx-auto"
            aria-hidden="true"
          >
            {/* 6-pointed star - two overlapping triangles */}
            <polygon
              points="0,-70 60.6,35 -60.6,35"
              fill="#3b82f6"
              opacity="0.2"
            />
            <polygon
              points="0,70 60.6,-35 -60.6,-35"
              fill="#3b82f6"
              opacity="0.2"
            />
            {/* Center hexagon */}
            <polygon
              points="0,-35 30.3,-17.5 30.3,17.5 0,35 -30.3,17.5 -30.3,-17.5"
              fill="#3b82f6"
              opacity="0.4"
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
            href="/replays"
            className="w-full inline-block px-12 py-4 text-xl font-semibold text-white bg-amber-500 rounded-full hover:bg-amber-400 transition-colors shadow-lg hover:shadow-xl"
          >
            Past Games
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
