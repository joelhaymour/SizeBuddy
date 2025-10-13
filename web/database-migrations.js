// Database migrations script
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Get current file directory with ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runMigrations() {
  // Open the database
  const dbFile = join(__dirname, "database.sqlite");
  console.log(`Opening database at ${dbFile}`);
  
  const db = await open({
    filename: dbFile,
    driver: sqlite3.Database,
  });

  console.log('Running migrations...');

  // Add the score column to chart_sizes table if it doesn't exist
  try {
    // Core app tables and indexes for production readiness
    await db.exec(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        shop TEXT PRIMARY KEY,
        plan TEXT NOT NULL,
        status TEXT NOT NULL,
        subscription_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME
      );
      CREATE INDEX IF NOT EXISTS idx_analytics_events_shop ON analytics_events(shop);
    `);

    // Ensure size_recommendation_analytics has a shop column for multi-tenant filtering
    const recoInfo = await db.all(`PRAGMA table_info(size_recommendation_analytics)`);
    const hasRecoShop = recoInfo.some(c => c.name === 'shop');
    if (!hasRecoShop) {
      try {
        await db.run(`ALTER TABLE size_recommendation_analytics ADD COLUMN shop TEXT`);
        // Backfill shop from related size_charts by chart_id
        await db.run(`UPDATE size_recommendation_analytics SET shop = (
          SELECT shop_domain FROM size_charts WHERE size_charts.id = size_recommendation_analytics.chart_id
        ) WHERE shop IS NULL`);
      } catch (e) {
        console.error('Failed to add/backfill shop column on size_recommendation_analytics:', e);
      }
      await db.run(`CREATE INDEX IF NOT EXISTS idx_reco_shop ON size_recommendation_analytics(shop)`);
    }

    // Check if the columns exist
    const tableInfo = await db.all(`PRAGMA table_info(chart_sizes)`);
    const scoreColumnExists = tableInfo.some(column => column.name === 'score');
    const heightColumnExists = tableInfo.some(column => column.name === 'height');
    const weightColumnExists = tableInfo.some(column => column.name === 'weight');
    
    // Add score column if it doesn't exist
    if (!scoreColumnExists) {
      console.log('Adding score column to chart_sizes table...');
      await db.run(`ALTER TABLE chart_sizes ADD COLUMN score TEXT;`);
      console.log('Score column added successfully.');
    } else {
      console.log('Score column already exists in chart_sizes table.');
    }

    // Add height column if it doesn't exist
    if (!heightColumnExists) {
      console.log('Adding height column to chart_sizes table...');
      await db.run(`ALTER TABLE chart_sizes ADD COLUMN height TEXT;`);
      console.log('Height column added successfully.');
    }
    
    // Add weight column if it doesn't exist
    if (!weightColumnExists) {
      console.log('Adding weight column to chart_sizes table...');
      await db.run(`ALTER TABLE chart_sizes ADD COLUMN weight TEXT;`);
      console.log('Weight column added successfully.');
    }

    // Check if optional_measurements column exists in size_charts table
    const sizeChartsInfo = await db.all(`PRAGMA table_info(size_charts)`);
    const optionalMeasurementsExists = sizeChartsInfo.some(column => column.name === 'optional_measurements');

    // Add optional_measurements column if it doesn't exist
    if (!optionalMeasurementsExists) {
      console.log('Adding optional_measurements column to size_charts table...');
      await db.run(`ALTER TABLE size_charts ADD COLUMN optional_measurements TEXT;`);
      console.log('Optional measurements column added successfully.');
    } else {
      console.log('Optional measurements column already exists in size_charts table.');
    }

    // Add locked column to size_charts for plan limit enforcement
    const lockedExists = sizeChartsInfo.some(column => column.name === 'locked');
    if (!lockedExists) {
      console.log('Adding locked column to size_charts table...');
      await db.run(`ALTER TABLE size_charts ADD COLUMN locked INTEGER DEFAULT 0;`);
      console.log('Locked column added successfully.');
    } else {
      console.log('Locked column already exists in size_charts table.');
    }

    console.log('Migrations completed successfully.');
  } catch (error) {
    console.error('Error running migrations:', error);
  } finally {
    await db.close();
  }
}

// Run migrations when this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations().catch(console.error);
}

export default runMigrations; 