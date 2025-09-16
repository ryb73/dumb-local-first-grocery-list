import type { Kysely, Migrator } from "kysely";

export async function migrationScript(db: Kysely<any>, migrator: Migrator) {
  try {
    const { error, results } = await migrator.migrateToLatest();

    if (error != null) {
      console.error(`Migration failed:`, error);
      process.exit(1);
    }

    if (results != null) {
      console.log(`Migration results:`, results);
    }

    await db.destroy();
  } catch (error) {
    console.error(`Error during migration:`, error);
    process.exit(1);
  }
}
