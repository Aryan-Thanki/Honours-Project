import fs from 'fs';
import gplay from 'google-play-scraper';

const categories = Object.values(gplay.category);

const collections = [
    gplay.collection.TOP_FREE,
    gplay.collection.TOP_PAID,
];

const getAllAppIDs = async (categories, collections, numPerCategory = 100) => {
    const allAppIds = new Set();

    for (const category of categories) {
        for (const collection of collections) {
            try {
                const apps = await gplay.list({
                    category,
                    collection,
                    num: numPerCategory
                });
                apps.forEach(app => allAppIds.add(app.appId));
                if (apps.length < numPerCategory) {
                    console.log(`Only got ${apps.length} apps for ${category} - ${collection}.`);
                } else {
                    console.log(`${apps.length} apps from ${category} - ${collection}`);
                }
            } catch (err) {
                console.log(`Failed ${category} - ${collection}: ${err.message}`);
            }
        }
    }
    return [...allAppIds];
}

const scrapApps = async () => {
    const results = {}; // This will hold: { category: { collection: [apps] } }

    for (const category of categories) {
        results[category] = {};

        for (const collection of collections) {
            try {
                const apps = await gplay.list({ category, collection, num: 100 });

                results[category][collection] = [];

                for (const app of apps) {
                    try {
                        const appDetails = await gplay.app({ appId: app.appId });

                        results[category][collection].push({
                            appId: appDetails.appId,
                            title: appDetails.title,
                            updated: new Date(appDetails.updated),
                            version: appDetails.version,
                            score: appDetails.score,
                            ratings: appDetails.ratings,
                            reviews: appDetails.reviews,
                            minInstalls: appDetails.minInstalls,
                            maxInstalls: appDetails.maxInstalls,
                            adSupported: appDetails.adSupported,
                            containsAds: appDetails.containsAds,
                            offersIAP: appDetails.offersIAP,
                            price: appDetails.price,
                            free: appDetails.free,
                            developer: appDetails.developer,
                            developerId: appDetails.developerId,
                            genre: appDetails.genre,
                            contentRating: appDetails.contentRating,
                            size: appDetails.size,
                        });
                    } catch (err) {
                        console.error(`Failed to fetch ${app.appId}: ${err.message}`);
                    }
                }

                const appCount = results[category][collection].length;
                console.log(`Fetched ${appCount} apps for ${category} - ${collection}`);
            } catch (err) {
                console.log(`Failed ${category} - ${collection}: ${err.message}`);
            }
        }
    }

    fs.writeFileSync('results.json', JSON.stringify(results, null, 2));
    console.log('Data saved to results.json');
};

scrapApps();
