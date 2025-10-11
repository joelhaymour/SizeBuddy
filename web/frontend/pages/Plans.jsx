import { Card, Page, Layout, Text, Button, LegacyCard, Box } from "@shopify/polaris";
import { useEffect } from 'react';
import { useAppBridge } from "@shopify/app-bridge-react";
import { Redirect } from '@shopify/app-bridge/actions';

export default function Plans() {
  const app = useAppBridge();
  const APP_HANDLE = 'size-buddy-v6-testing';
  useEffect(() => {
    try {
      const redirect = Redirect.create(app);
      redirect.dispatch(Redirect.Action.ADMIN_PATH, `/charges/${APP_HANDLE}/pricing_plans`);
    } catch (e) {
      console.error('Redirect to pricing plans failed:', e);
    }
  }, [app]);
  return (
    <Page title="Plans">
      <Layout>
        <Layout.Section>
          <LegacyCard sectioned>
            <Text as="p" variant="bodyMd">Opening Shopify plan selection…</Text>
            <Box paddingBlockStart="3">
              <Button primary onClick={() => {
                const redirect = Redirect.create(app);
                redirect.dispatch(Redirect.Action.ADMIN_PATH, `/charges/${APP_HANDLE}/pricing_plans`);
              }}>Open plan selection</Button>
            </Box>
          </LegacyCard>
        </Layout.Section>
      </Layout>
    </Page>
  );
}


