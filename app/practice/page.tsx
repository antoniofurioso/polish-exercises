import { Suspense } from "react";
import { PracticePage } from "./PracticeClient";

export default function Practice() {
  return (
    <Suspense>
      <PracticePage />
    </Suspense>
  );
}
