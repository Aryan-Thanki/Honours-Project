import gplay from 'google-play-scraper';
import fs from 'fs';

const categories = [
  gplay.category.TOOLS,
  gplay.category.EDUCATION,
  gplay.category.HEALTH_AND_FITNESS,
  gplay.category.FINANCE,
  gplay.category.GAME_ACTION,
  gplay.category.PRODUCTIVITY,
];

const collections = [
  gplay.collection.TOP_FREE,
  gplay.collection.TOP_PAID,
  gplay.collection.NEW_FREE,
  gplay.collection.NEW_PAID
];

const getAllAppIDs = async (categories, collections, numPerCategory = 100) => {
    const allAppIds = new Set();


    for(const category of categories){
        for(const collection of collections){
            try {
                const apps = await gplay.list({
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
            const app = await gplay.app({appId});
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
