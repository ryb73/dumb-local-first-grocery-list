import { HashRouter, Route, Router, useParams } from "@solidjs/router";
import { DatabaseRebuild } from "./components/DatabaseRebuild";
import { LandingPage } from "./components/LandingPage";
import { ListLoader } from "./components/ListLoader";
import { MigrationManager } from "./components/MigrationManager";
import { OpfsViewer } from "./components/OpfsViewer";
import { SqliteBrowser } from "./components/SqliteBrowser";
import { ToastProvider } from "./components/Toast";

/**
 * Wrapper component for the /list/:listId route.
 * Extracts the listId from the route params and passes it to ListLoader.
 */
function ListRoute() {
  const params = useParams<{ listId: string }>();
  return <ListLoader listId={params.listId} />;
}

function App() {
  const RouterComponent =
    import.meta.env[`VITE_ROUTER`] === `hash` ? HashRouter : Router;

  // Unless we're using the hash router, we need to respect the base path
  const basePath =
    import.meta.env[`VITE_ROUTER`] === `hash`
      ? `/`
      : import.meta.env[`VITE_BASE_PATH`] ?? `/`;

  return (
    <ToastProvider>
      <RouterComponent base={basePath}>
        <Route component={LandingPage} path="/" />
        <Route component={ListRoute} path="/list/:listId" />
        <Route component={SqliteBrowser} path="/browser" />
        <Route component={MigrationManager} path="/migrations" />
        <Route component={DatabaseRebuild} path="/rebuild" />
        <Route component={OpfsViewer} path="/debug/opfs" />
      </RouterComponent>
    </ToastProvider>
  );
}

export default App;
