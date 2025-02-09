In this workspace is a newly bootstrapped SolidJS project. I would like to make a simple grocery list. The app will be only a single page: it will show the list of items you have in your list, and provide the ability to add or remove items to/from the list.
For the start, let's hold this list in memory. In the future, we will be storing the data in a database.
When adding to the list, suggestions should autocomplete from the list of items that have been removed.
Next to each item should be a checkbox. The checkbox, by default, is checked. Unchecking the box moves that item below all the checked items. Re-checking an item moves it above any unchecked items that may have been above it.
After 24 hours, unchecked items are removed from the list. (Note, though, that they're still included in the list of removed items used for the aforementioned autocomplete).

Here are some guidelines:
* Prefer a functional style over an OO style
* There should be no duplicates in the list. If the user attempts to add an item already on the list, then it will check the box for that item (or if already checked, leave it checked.)

Are you able to start on this project? Feel free to ask any questions you have before doing so.
