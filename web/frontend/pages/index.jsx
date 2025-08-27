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
  const [selectedTab, setSelectedTab] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [shop, setShop] = useState(null);
  const [host, setHost] = useState(null);
  const fetch = useAuthenticatedFetch();

  // Get URL params
  const urlParams = new URLSearchParams(window.location.search);
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

  const navigationMarkup = (
    <Navigation location="/">
      <Navigation.Section
        items={[
          {
            label: 'Size Recommendations',
            icon: ImageMajor,
            selected: selectedTab === 0,
            onClick: () => setSelectedTab(0),
          },
          {
            label: 'Analytics',
            icon: ReportMinor,
            selected: selectedTab === 1,
            onClick: () => setSelectedTab(1),
          },
        ]}
      />
    </Navigation>
  );

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
    <Frame navigation={navigationMarkup}>
      <Page fullWidth>
        <TitleBar title="Size Buddy" />
        <Layout>
          <Layout.Section>
            <Box paddingBlockEnd="4">
              <LegacyCard roundedAbove="sm">
                <LegacyCard.Section>
                  <Text as="h2" variant="headingLg">
                    Welcome to Size Buddy
                  </Text>
                  <Box paddingBlockStart="3">
                    <Text as="p" variant="bodyMd">
                      Help your customers find their perfect size with our smart size recommendation system.
                      Get started by creating size recommendations for your products.
                    </Text>
                  </Box>
                </LegacyCard.Section>
              </LegacyCard>
            </Box>

            <Tabs tabs={tabs} selected={selectedTab} onSelect={handleTabChange} fitted />

            <LegacyCard.Section>
              {selectedTab === 0 && <SizeRecommendation shop={shop} host={host} />}
              {selectedTab === 1 && <Analytics shop={shop} host={host} />}
              {selectedTab === 2 && <Plans />}
            </LegacyCard.Section>
          </Layout.Section>
        </Layout>
      </Page>
    </Frame>
  );
}
