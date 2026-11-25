import { CardioLogPage } from "../cardio-page";

export default function LogRunPage({ searchParams }: PageProps<"/log/run">) {
  return <CardioLogPage type="running" searchParams={searchParams} />;
}
