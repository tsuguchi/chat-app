// Server-Component placeholder shown by Next.js Suspense while the channel
// page's data fetching resolves. Renders the persistent shell (header
// skeleton + a couple of message skeletons) so navigation feels instant
// instead of stalling on a blank route.
export default function Loading() {
  return (
    <div className="flex h-screen flex-col">
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-baseline gap-3">
          <div className="h-5 w-40 animate-pulse rounded bg-gray-200" />
          <div className="h-3 w-20 animate-pulse rounded bg-gray-100" />
        </div>
      </header>
      <div className="flex-1 space-y-4 overflow-hidden bg-white px-6 py-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex gap-3">
            <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-gray-200" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-32 animate-pulse rounded bg-gray-200" />
              <div className="h-4 w-3/4 animate-pulse rounded bg-gray-100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
