import { CardioLogPage } from "../cardio-page";

export default function LogWalkPage({ searchParams }: PageProps<"/log/walk">) {
  return <CardioLogPage type="walking" searchParams={searchParams} />;
}
