type PageProps = {
  params: Promise<{ roomId: string }>;
};

export function generateStaticParams() {
  return [{ roomId: "private-room" }];
}

export default async function RoomPage({ params }: PageProps) {
  const { roomId } = await params;
  const target = `/?room=${encodeURIComponent(roomId)}`;
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <meta httpEquiv="refresh" content={`0;url=${target}`} />
      <a href={target} className="rounded-md bg-ink px-5 py-3 text-sm font-bold text-white">
        Open chat in dashboard
      </a>
    </main>
  );
}
