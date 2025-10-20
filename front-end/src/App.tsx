import { Route, Router, useParams } from "@solidjs/router";
import { DatabaseRebuild } from "./components/DatabaseRebuild";
import { LandingPage } from "./components/LandingPage";
import { ListLoader } from "./components/ListLoader";
import { MigrationManager } from "./components/MigrationManager";
import { SqliteBrowser } from "./components/SqliteBrowser";

/**
 * Wrapper component for the /list/:listId route.
 * Extracts the listId from the route params and passes it to ListLoader.
 */
function ListRoute() {
  const params = useParams<{ listId: string }>();
  return <ListLoader listId={params.listId} />;
}

function App() {
  return (
    <Router>
      <Route component={LandingPage} path="/" />
      <Route component={ListRoute} path="/list/:listId" />
      <Route component={SqliteBrowser} path="/browser" />
      <Route component={MigrationManager} path="/migrations" />
      <Route component={DatabaseRebuild} path="/rebuild" />
    </Router>
  );
}

export default App;
