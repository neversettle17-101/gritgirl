import { Suspense } from "react";
import { BottomNav, NavBar } from "@/components/bottom-nav";

/** Screens with the bottom bar: home, the ledgers and the profile. */
export default function TabsLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      {children}
      <Suspense fallback={<NavBar />}>
        <BottomNav />
      </Suspense>
    </>
  );
}
