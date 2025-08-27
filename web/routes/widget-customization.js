import { Router } from 'express';
import { validateAuthenticatedSession } from "../shopify.js";

const router = Router();

// All routes in this file should be authenticated
router.use('/api/widget-customization', validateAuthenticatedSession);

// Get widget customization settings
router.get('/api/widget-customization', async (req, res) => {
  try {
    const { shop } = req.query;

    if (!shop) {
      return res.status(400).json({ error: "Missing shop parameter" });
    }

    const settings = await req.app.locals.db.get(
      `SELECT settings FROM widget_customization WHERE shop_id = ?`,
      [shop]
    );

    // If no settings exist, return default settings
    if (!settings) {
      const defaultSettings = {
        appearance: {
          primaryColor: "#4CAF50",
          secondaryColor: "#ffffff",
          buttonStyle: "rounded",
          fontFamily: "system-ui",
          fontSize: "16px"
        },
        behavior: {
          position: "inline",
          showOnLoad: true,
          displayDelay: 0,
          animationStyle: "slide",
          persistUserData: true
        },
        content: {
          buttonText: "Find My Size",
          headerText: "Size Calculator",
          descriptionText: "Get your perfect fit with our size calculator",
          successMessage: "Recommended Size: {size}"
        }
      };

      // Insert default settings
      await req.app.locals.db.run(
        `INSERT INTO widget_customization (shop_id, settings) VALUES (?, ?)`,
        [shop, JSON.stringify(defaultSettings)]
      );

      return res.status(200).json(defaultSettings);
    }

    res.status(200).json(JSON.parse(settings.settings));
  } catch (error) {
    console.error('Error fetching widget customization:', error);
    res.status(500).json({ 
      error: "Failed to fetch widget customization",
      details: error.message 
    });
  }
});

// Update widget customization settings
router.put('/api/widget-customization', async (req, res) => {
  try {
    const { shop } = req.query;
    const { settings } = req.body;
    
    if (!shop) {
      return res.status(400).json({ error: "Missing shop parameter" });
    }

    if (!settings) {
      return res.status(400).json({ error: "Missing settings in request body" });
    }
    
    await req.app.locals.db.run(
      `INSERT INTO widget_customization (shop_id, settings) 
       VALUES (?, ?)
       ON CONFLICT(shop_id) DO UPDATE SET 
       settings = ?,
       updated_at = CURRENT_TIMESTAMP`,
      [shop, JSON.stringify(settings), JSON.stringify(settings)]
    );

    res.status(200).json({ 
      success: true,
      message: "Widget customization updated successfully" 
    });
  } catch (error) {
    console.error('Error updating widget customization:', error);
    res.status(500).json({ 
      error: "Failed to update widget customization",
      details: error.message 
    });
  }
});

export default router; 