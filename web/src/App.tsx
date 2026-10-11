import { Navigate, Route, Routes } from "react-router";
import { DoneScreen } from "./screens/DoneScreen";
import { Home } from "./screens/Home";
import { ImportScreen } from "./screens/ImportScreen";
import { ReviewScreen } from "./screens/ReviewScreen";

// Screens and flow: docs/design.md §10.
export function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      {/* "new" until the first photo creates the import; the same route keeps the photos in memory. */}
      <Route path="/imports/:id" element={<ImportScreen />} />
      <Route path="/imports/:id/review" element={<ReviewScreen />} />
      <Route path="/imports/:id/done" element={<DoneScreen />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
