import { Route, Router } from "@solidjs/router";
import { MigrationManager } from "./components/MigrationManager";
import { ParallelGroceryLists } from "./components/ParallelGroceryLists";
import { SqliteBrowser } from "./components/SqliteBrowser";

function App() {
  return (
    <Router>
      <Route component={ParallelGroceryLists} path="/" />
      <Route component={SqliteBrowser} path="/browser" />
      <Route component={MigrationManager} path="/migrations" />
    </Router>
  );
}

export default App;
