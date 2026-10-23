import { Navigate, Route, Routes } from "react-router";
import { AddWordsScreen } from "./screens/AddWordsScreen";
import { ConfirmWordScreen } from "./screens/ConfirmWordScreen";
import { DoneScreen } from "./screens/DoneScreen";
import { EditWordScreen } from "./screens/EditWordScreen";
import { FlashcardsScreen } from "./screens/FlashcardsScreen";
import { Home } from "./screens/Home";
import { ImportScreen } from "./screens/ImportScreen";
import { MyWordsScreen } from "./screens/MyWordsScreen";
import { PastImportScreen } from "./screens/PastImportScreen";
import { PastImportsScreen } from "./screens/PastImportsScreen";
import { PdfPagesScreen } from "./screens/PdfPagesScreen";
import { PracticeSetupScreen } from "./screens/PracticeSetupScreen";
import { RenameImportScreen } from "./screens/RenameImportScreen";
import { ReviewScreen } from "./screens/ReviewScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { SummaryScreen } from "./screens/SummaryScreen";
import { WordDetailScreen } from "./screens/WordDetailScreen";

// Screens and flow: docs/design.md §10.
export function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      {/* "new" until the first photo creates the import; the same route keeps the photos in memory. */}
      <Route path="/imports/:id" element={<ImportScreen />} />
      {/* Pages of a PDF, handed to the Import screen in memory (§6.8). */}
      <Route path="/imports/new/pdf" element={<PdfPagesScreen />} />
      <Route path="/imports/:id/review" element={<ReviewScreen />} />
      <Route path="/imports/:id/done" element={<DoneScreen />} />
      <Route path="/practice" element={<PracticeSetupScreen />} />
      <Route path="/practice/:id" element={<FlashcardsScreen />} />
      <Route path="/practice/:id/summary" element={<SummaryScreen />} />
      {/* The tab, search and view live in the query: /words?status=learned&q=tisch&import=5 */}
      <Route path="/words" element={<MyWordsScreen />} />
      {/* Words typed by hand; static paths win over /words/:id. One word or ?mode=list. */}
      <Route path="/words/new" element={<AddWordsScreen />} />
      <Route path="/words/new/confirm" element={<ConfirmWordScreen />} />
      <Route path="/words/:id" element={<WordDetailScreen />} />
      {/* A screen, not a modal: a swipe back closes it and leaves the word open. */}
      <Route path="/words/:id/edit" element={<EditWordScreen />} />
      <Route path="/settings" element={<SettingsScreen />} />
      {/* The past imports; Rename import is a screen like Edit word, not a modal. */}
      <Route path="/settings/imports" element={<PastImportsScreen />} />
      <Route path="/settings/imports/:id" element={<PastImportScreen />} />
      <Route path="/settings/imports/:id/rename" element={<RenameImportScreen />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
