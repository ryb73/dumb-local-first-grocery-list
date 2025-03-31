import { Route, Router } from "@solidjs/router";
import { ParallelGroceryLists } from "./components/ParallelGroceryLists";
import { SqliteBrowser } from "./components/SqliteBrowser";

function App() {
  return (
    <Router>
      <Route component={ParallelGroceryLists} path="/" />
      <Route component={SqliteBrowser} path="/browser" />
    </Router>
  );
}

export default App;
