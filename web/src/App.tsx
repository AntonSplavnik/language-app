import { APP_NAME } from "@language-app/core";
import { Navigate, Route, Routes, useLocation } from "react-router";
import { withoutAiRedirect } from "./auth/aiFeatures";
import { ACCOUNT_URL, redirectFor, SIGN_IN, SIGN_UP } from "./auth/rules";
import { useAuth } from "./auth/session";
import { LoadState } from "./components/LoadState";
import { Page } from "./components/Page";
import { AccountScreen } from "./screens/AccountScreen";
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
import { SignInScreen } from "./screens/SignInScreen";
import { SignUpScreen } from "./screens/SignUpScreen";
import { SummaryScreen } from "./screens/SummaryScreen";
import { WordDetailScreen } from "./screens/WordDetailScreen";

// Screens and flow: docs/design.md §10.
export function App() {
  const { state, reload } = useAuth();
  const { pathname, search } = useLocation();

  // Who is signed in is known before any screen loads its data (§4 Accounts, §10).
  if (state.kind === "loading") return null;
  if (state.kind === "failed") {
    return (
      <Page largeTitle={APP_NAME}>
        <LoadState loading={state} onRetry={reload} />
      </Page>
    );
  }
  const redirect =
    redirectFor(
      state.kind === "signedIn"
        ? { signedIn: true }
        : { signedIn: false, byChoice: state.byChoice },
      pathname,
      search,
    ) ?? (state.kind === "signedIn" ? withoutAiRedirect(state.user.aiEnabled, pathname) : null);
  if (redirect) return <Navigate to={redirect} replace />;
  // Signed out, only Sign in and Create account open.
  if (state.kind === "signedOut") {
    return (
      <Routes>
        <Route path={SIGN_IN} element={<SignInScreen />} />
        <Route path={SIGN_UP} element={<SignUpScreen />} />
      </Routes>
    );
  }

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
      <Route path={ACCOUNT_URL} element={<AccountScreen />} />
      {/* The past imports; Rename import is a screen like Edit word, not a modal. */}
      <Route path="/settings/imports" element={<PastImportsScreen />} />
      <Route path="/settings/imports/:id" element={<PastImportScreen />} />
      <Route path="/settings/imports/:id/rename" element={<RenameImportScreen />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
