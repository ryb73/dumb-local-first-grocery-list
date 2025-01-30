import { GroceryList } from "./components/GroceryList";
import styles from "./App.module.css";

function App() {
  return (
    <div class={styles.app}>
      <GroceryList />
    </div>
  );
}

export default App;
