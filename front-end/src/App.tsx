import { SqliteBrowser } from "./components/SqliteBrowser";
import { Router, Route } from "@solidjs/router";
import { ParallelGroceryLists } from "./components/ParallelGroceryLists";

function App() {
  return (
    <Router>
      <Route path="/" component={ParallelGroceryLists} />
      <Route path="/browser" component={SqliteBrowser} />
    </Router>
  );
}

export default App;
