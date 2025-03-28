import { GroceryList } from "./components/GroceryList";
import { SqliteBrowser } from "./components/SqliteBrowser";
import { Router, Route, A } from "@solidjs/router";
import styles from "./App.module.css";


function App() {
  return (
    <Router>
      <Route path="/" component={GroceryList} />
      <Route path="/browser" component={SqliteBrowser} />
    </Router>
  );
}

export default App;
