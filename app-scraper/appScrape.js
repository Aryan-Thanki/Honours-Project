import store from 'app-store-scraper';
import fs from 'fs';

const categories = [
  store.category.TOOLS,
  store.category.EDUCATION,
  store.category.HEALTH_AND_FITNESS,
  store.category.FINANCE,
  store.category.GAME_ACTION,
  store.category.PRODUCTIVITY,
];

const collections = [
  store.collection.TOP_FREE,
  store.collection.TOP_PAID,
  store.collection.NEW_FREE,
  store.collection.NEW_PAID
];

const getAllAppIDs = async (categories, collections, numPerCategory = 100) => {
    const allAppIds = new Set();


    for(const category of categories){
        for(const collection of collections){
            try {
                const apps = await store.list({
                    category,
                    collection, 
                    num: numPerCategory
                });
                apps.forEach(app => allAppIds.add(app.appId));
                console.log(`${apps.length} apps from ${category} - ${collection}`);
            } catch (err) {
                console.log(`Failed ${category} - ${collection}: ${err.message}`);
            }
        }
    }
    return [...allAppIds];
}

const scrapApps = async () => {
    const appIds = await getAllAppIDs(categories, collections, 100);
    const results = [];

    for (const appId of appIds) {
        try {
            const app = await store.app({appId});
            results.push({
                appId: app.appId,
                title: app.title,
                updated: new Date(app.updated),
                score: app.score,
                appVersion: app.version,
                adSupported: app.adSupported,
                developer: app.developer,
            })
        } catch (err) {
            console.error(`Failed to fetch ${appID}: ${err.message} `)

        }
    }

    fs.writeFileSync('results.json', JSON.stringify(results, null, 2));
    console.log('Data saved to results.json');
};

scrapApps();
