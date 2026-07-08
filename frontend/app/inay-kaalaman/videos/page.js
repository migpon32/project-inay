import VideoLibraryClient from "./VideoLibraryClient";

export default async function VideoLibraryPage({ searchParams }) {
  const params = await searchParams;
  const requestedMonth = Number(params?.month);
  const initialMonth = Number.isInteger(requestedMonth) && requestedMonth >= 1 && requestedMonth <= 10
    ? requestedMonth
    : 1;

  return <VideoLibraryClient initialMonth={initialMonth} />;
}
