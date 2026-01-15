const { MongoClient } = require('mongodb');

// Configuration
const localUri = 'mongodb://127.0.0.1:27017/HMS';
const atlasUri = 'mongodb+srv://HMS:HMS2345@cluster0.5uheoxx.mongodb.net/HMS?retryWrites=true&w=majority';
const collectionsToMigrate = ['hostels', 'students', 'users', 'challans', 'logs'];

async function migrate() {
    const localClient = new MongoClient(localUri);
    const atlasClient = new MongoClient(atlasUri);

    try {
        console.log('Connecting to Local MongoDB...');
        await localClient.connect();
        console.log('Connected to Local MongoDB.');

        // Debug: List databases
        const adminDb = localClient.db().admin();
        const dbs = await adminDb.listDatabases();
        console.log('Available databases:', dbs.databases.map(d => d.name).join(', '));

        let dbName = 'HMS';
        // check if 'HMS' exists in the list, if not check 'hms'
        const hasHMS = dbs.databases.some(d => d.name === 'HMS');
        const hashms = dbs.databases.some(d => d.name === 'hms');

        if (!hasHMS && hashms) {
            console.log("Database 'HMS' not found, but 'hms' found using that instead.");
            dbName = 'hms';
        } else if (!hasHMS && !hashms) {
            console.log("Warning: Neither 'HMS' nor 'hms' found locally.");
        }

        const localDb = localClient.db(dbName);
        console.log(`Using database: ${dbName}`);

        console.log('Connecting to MongoDB Atlas...');
        await atlasClient.connect();
        const atlasDb = atlasClient.db('HMS'); // Target is always HMS as per request
        console.log('Connected to MongoDB Atlas.');

        const summary = [];

        for (const collectionName of collectionsToMigrate) {
            console.log(`\nProcessing collection: ${collectionName}`);

            const localCollection = localDb.collection(collectionName);
            const atlasCollection = atlasDb.collection(collectionName);

            // Fetch from Local
            const documents = await localCollection.find({}).toArray();
            const localCount = documents.length;
            console.log(`Found ${localCount} documents in local ${collectionName}.`);

            if (localCount > 0) {
                // Check existing in Atlas
                const atlasCountBefore = await atlasCollection.countDocuments();
                if (atlasCountBefore > 0) {
                    console.log(`Warning: Atlas collection ${collectionName} already has ${atlasCountBefore} documents. appending...`);
                }

                // Insert into Atlas
                try {
                    const result = await atlasCollection.insertMany(documents);
                    console.log(`Successfully inserted ${result.insertedCount} documents into Atlas ${collectionName}.`);

                    summary.push({
                        collection: collectionName,
                        local: localCount,
                        atlas: await atlasCollection.countDocuments(),
                        status: 'Success'
                    });

                } catch (e) {
                    console.error(`Error inserting into ${collectionName}:`, e);
                    summary.push({
                        collection: collectionName,
                        local: localCount,
                        atlas: await atlasCollection.countDocuments(),
                        status: 'Error: ' + e.message
                    });
                }
            } else {
                console.log(`No documents to migrate for ${collectionName}.`);
                summary.push({
                    collection: collectionName,
                    local: 0,
                    atlas: await atlasCollection.countDocuments(),
                    status: 'Skipped (Empty)'
                });
            }
        }

        console.log('\n--- Migration Summary ---');
        console.table(summary);

    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await localClient.close();
        await atlasClient.close();
        console.log('\nConnections closed.');
    }
}

migrate();
