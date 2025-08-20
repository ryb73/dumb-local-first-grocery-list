import { Route, Router } from "@solidjs/router";
import { DatabaseRebuild } from "./components/DatabaseRebuild";
import { MigrationManager } from "./components/MigrationManager";
import { ParallelGroceryLists } from "./components/ParallelGroceryLists";
import { SqliteBrowser } from "./components/SqliteBrowser";

function App() {
  return (
    <Router>
      <Route component={ParallelGroceryLists} path="/" />
      <Route component={SqliteBrowser} path="/browser" />
      <Route component={MigrationManager} path="/migrations" />
      <Route component={DatabaseRebuild} path="/rebuild" />
    </Router>
  );
}

export default App;
