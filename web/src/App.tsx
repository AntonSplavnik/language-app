import { Navigate, Route, Routes } from "react-router";
import { DoneScreen } from "./screens/DoneScreen";
import { EditWordScreen } from "./screens/EditWordScreen";
import { FlashcardsScreen } from "./screens/FlashcardsScreen";
import { Home } from "./screens/Home";
import { ImportScreen } from "./screens/ImportScreen";
import { MyWordsScreen } from "./screens/MyWordsScreen";
import { PracticeSetupScreen } from "./screens/PracticeSetupScreen";
import { ReviewScreen } from "./screens/ReviewScreen";
import { SummaryScreen } from "./screens/SummaryScreen";
import { WordDetailScreen } from "./screens/WordDetailScreen";

// Screens and flow: docs/design.md §10.
export function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      {/* "new" until the first photo creates the import; the same route keeps the photos in memory. */}
      <Route path="/imports/:id" element={<ImportScreen />} />
      <Route path="/imports/:id/review" element={<ReviewScreen />} />
      <Route path="/imports/:id/done" element={<DoneScreen />} />
      <Route path="/practice" element={<PracticeSetupScreen />} />
      <Route path="/practice/:id" element={<FlashcardsScreen />} />
      <Route path="/practice/:id/summary" element={<SummaryScreen />} />
      {/* The tab and search live in the query: /words?status=learned&q=tisch */}
      <Route path="/words" element={<MyWordsScreen />} />
      <Route path="/words/:id" element={<WordDetailScreen />} />
      {/* A screen, not a modal: a swipe back closes it and leaves the word open. */}
      <Route path="/words/:id/edit" element={<EditWordScreen />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
