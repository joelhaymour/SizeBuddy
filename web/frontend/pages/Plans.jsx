import { Card, Page, Layout, Text, Button, LegacyCard, Box } from "@shopify/polaris";
import { useAppBridge } from "@shopify/app-bridge-react";
import { Redirect } from '@shopify/app-bridge/actions';

export default function Plans() {
  const app = useAppBridge();
  const APP_HANDLE = 'size-buddy-dev';
  return (
    <Page title="Plans">
      <Layout>
        <Layout.Section>
          <LegacyCard sectioned>
            <Text as="p" variant="bodyMd">
              Manage your subscription in Shopify’s plan selection page.
            </Text>
            <Box paddingBlockStart="3"/>
            <Button primary onClick={() => {
              const redirect = Redirect.create(app);
              // Open Shopify's plan page in a new admin tab so the app stays open
              redirect.dispatch(
                Redirect.Action.ADMIN_PATH,
                `/charges/${APP_HANDLE}/pricing_plans`,
                { newContext: true }
              );
            }}>Manage plan</Button>
          </LegacyCard>
        </Layout.Section>
      </Layout>
    </Page>
  );
}


