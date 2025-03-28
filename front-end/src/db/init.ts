import { SQLocalKysely } from "sqlocal/kysely";
import { Kysely, Migrator } from "kysely";
import { KyselySchema } from "./types";
import { migrations } from "./migrations/migrations";


// Initialize the database with migrations
export const initDatabase = async () => {
    const { dialect } = new SQLocalKysely("grocery-list.sqlite3");

    const kysely = new Kysely<KyselySchema>({ dialect });

    const migrator = new Migrator({
        db: kysely,
        provider: {
            async getMigrations() {
                return migrations;
            },
        },
    });

    const { error, results } = await migrator.migrateToLatest();

    if (error) {
        console.error('Migration failed:', error);
        throw error;
    }

    if (results?.length) {
        console.log('Migrations completed:', results);
    } else {
        console.log('No migrations were needed');
    }

    return { kysely, migrator };
};

