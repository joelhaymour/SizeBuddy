import { Card, Page, Layout, Text, Button, LegacyCard, Box, Banner } from "@shopify/polaris";
import { useEffect, useState } from 'react';
import { useAuthenticatedFetch, useAppBridge } from "@shopify/app-bridge-react";
import { Redirect } from '@shopify/app-bridge/actions';

export default function Plans() {
  const [status, setStatus] = useState(null);
  const fetch = useAuthenticatedFetch();
  const app = useAppBridge();
  const APP_HANDLE = 'size-buddy-v6-testing';
  useEffect(() => {
    fetch('/api/billing/status').then(r => r.json()).then(setStatus).catch(()=>{});
  }, []);
  const onSelect = async () => {
    try {
      const redirect = Redirect.create(app);
      // Managed pricing plan selection page hosted by Shopify
      redirect.dispatch(Redirect.Action.ADMIN_PATH, `/charges/${APP_HANDLE}/pricing_plans`);
    } catch (e) {
      console.error('Redirect to pricing plans failed:', e);
    }
  };
  const allowedByPlan = {
    Free: 2,
    Pro: 4,
    Premium: Infinity,
  };
  const allowedLabel = (plan) => {
    const allowed = allowedByPlan[plan] ?? null;
    if (allowed === null) return null;
    return allowed === Infinity ? 'Unlimited charts' : `${allowed} size charts`;
  };
  return (
    <Page title="Plans">
      <Layout>
        <Layout.Section>
          <LegacyCard sectioned>
            <Text as="h2" variant="headingMd">Current plan: {status?.plan ?? '...'}</Text>
            <Box paddingBlockStart="2">
              <Text as="p" variant="bodyMd">Size charts used: {status?.usage?.charts ?? 0}</Text>
              {status?.plan && (
                <Text as="p" variant="bodyMd" tone="subdued">
                  Allowed: {allowedLabel(status.plan) ?? '—'}
                </Text>
              )}
            </Box>
            <Box paddingBlockStart="4">
              <Button primary onClick={onSelect}>Change plan</Button>
            </Box>
          </LegacyCard>
        </Layout.Section>
      </Layout>
    </Page>
  );
}


