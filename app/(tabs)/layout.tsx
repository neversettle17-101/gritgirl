import { Suspense } from "react";
import { BottomNav, NavLinks } from "@/components/bottom-nav";

/** Screens with the bottom navigation: home and the ledgers. */
export default function TabsLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      {children}
      <Suspense fallback={<NavLinks />}>
        <BottomNav />
      </Suspense>
    </>
  );
}
