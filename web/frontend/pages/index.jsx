import {
  Page,
  Layout,
  LegacyCard,
  Button,
  Text,
  Icon,
  Navigation,
  Frame,
  Box,
  SkeletonBodyText,
  Loading,
  Tabs,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import Plans from "./Plans.jsx";
import {
  ImageMajor,
  EditMinor,
  ReportMinor
} from '@shopify/polaris-icons';

// Debug: Log available icons
console.log('Available Polaris icons:', {
  ImageMajor,
  EditMinor,
  ReportMinor
});

import { useState, useEffect, useCallback } from "react";
import { SizeRecommendation } from "../components/SizeRecommendation";
import { WidgetCustomization } from "../components/WidgetCustomization";
import { Analytics } from "../components/Analytics";
import { useAuthenticatedFetch } from "@shopify/app-bridge-react";

export default function HomePage() {
  const urlParams = new URLSearchParams(window.location.search);
  const tabFromUrl = parseInt(urlParams.get('tab') || '0', 10);
  const [selectedTab, setSelectedTab] = useState(tabFromUrl);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [shop, setShop] = useState(null);
  const [host, setHost] = useState(null);
  const fetch = useAuthenticatedFetch();

  // Get URL params
  const shopFromUrl = urlParams.get('shop');
  const hostFromUrl = urlParams.get('host');

  useEffect(() => {
    if (!shopFromUrl || !hostFromUrl) {
      console.error('Missing required parameters:', { shop: shopFromUrl, host: hostFromUrl });
      setHasError(true);
      setIsLoading(false);
      return;
    }
    setShop(shopFromUrl);
    setHost(hostFromUrl);
    setIsLoading(false);
  }, [shopFromUrl, hostFromUrl]);
  
  // Update tab when URL changes
  useEffect(() => {
    const tabParam = parseInt(urlParams.get('tab') || '0', 10);
    setSelectedTab(tabParam);
  }, [window.location.search]);

  const tabs = [
    {
      id: 'size-recommendations',
      content: 'Size Recommendations',
      accessibilityLabel: 'Size recommendations tab',
      panelID: 'size-recommendations-content',
    },
    {
      id: 'analytics',
      content: 'Analytics',
      accessibilityLabel: 'Analytics tab',
      panelID: 'analytics-content',
    },
    {
      id: 'plans',
      content: 'Plans',
      accessibilityLabel: 'Plans tab',
      panelID: 'plans-content',
    }
  ];

  const handleTabChange = useCallback((selectedTabIndex) => {
    setSelectedTab(selectedTabIndex);
  }, []);

  // Navigation removed - using App Bridge NavigationMenu only

  if (isLoading) {
    return (
      <Frame>
        <Page>
          <TitleBar title="Size Buddy" />
          <Loading />
          <Layout>
            <Layout.Section>
              <LegacyCard sectioned>
                <SkeletonBodyText lines={10} />
              </LegacyCard>
            </Layout.Section>
          </Layout>
        </Page>
      </Frame>
    );
  }

  if (hasError) {
    return (
      <Frame>
        <Page>
          <TitleBar title="Size Buddy" />
          <Layout>
            <Layout.Section>
              <LegacyCard sectioned>
                <Text variant="headingMd" as="h2" color="critical">
                  Error Loading App
                </Text>
                <Box paddingBlockStart="4">
                  <Text>
                    There was an error loading the application. Please try refreshing the page.
                  </Text>
                </Box>
              </LegacyCard>
            </Layout.Section>
          </Layout>
        </Page>
      </Frame>
    );
  }

  return (
    <Frame>
      <Page fullWidth>
        <TitleBar title="Size Buddy" />
        <Layout>
          <Layout.Section>
            {selectedTab === 0 && <SizeRecommendation shop={shop} host={host} />}
            {selectedTab === 1 && <Analytics shop={shop} host={host} />}
            {selectedTab === 2 && <Plans />}
          </Layout.Section>
        </Layout>
      </Page>
    </Frame>
  );
}
