import { LoveRoom } from "@/components/love-room";

type PageProps = {
  params: Promise<{ roomId: string }>;
};

export function generateStaticParams() {
  return [{ roomId: "dibya-biswajit" }];
}

export default async function RoomPage({ params }: PageProps) {
  const { roomId } = await params;
  return <LoveRoom roomId={roomId} />;
}
