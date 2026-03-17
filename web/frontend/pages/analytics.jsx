import {
  Page,
  Layout,
  LegacyCard,
  Text,
  Frame,
  Box,
  SkeletonBodyText,
  Loading,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Analytics } from "../components/Analytics";

export default function AnalyticsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [shop, setShop] = useState(null);
  const [host, setHost] = useState(null);
  const location = useLocation();

  useEffect(() => {
    const urlParams = new URLSearchParams(location.search);
    const shopFromUrl = urlParams.get('shop');
    const hostFromUrl = urlParams.get('host');

    if (!shopFromUrl || !hostFromUrl) {
      console.error('Missing required parameters:', { shop: shopFromUrl, host: hostFromUrl });
      setHasError(true);
      setIsLoading(false);
      return;
    }

    setHasError(false);
    setShop(shopFromUrl);
    setHost(hostFromUrl);
    setIsLoading(false);
  }, [location.search]);

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
            <Analytics shop={shop} host={host} />
          </Layout.Section>
        </Layout>
      </Page>
    </Frame>
  );
}
