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
  const tiers = [
    { name: 'Free', price: '$0', desc: '2 size charts', plan: 'Free' },
    { name: 'Pro', price: '$12.99', desc: '4 size charts', plan: 'Pro' },
    { name: 'Premium', price: '$24.99', desc: 'Unlimited charts', plan: 'Premium' },
  ];
  const onSelect = async (_plan) => {
    try {
      const redirect = Redirect.create(app);
      // Managed pricing plan selection page hosted by Shopify
      redirect.dispatch(Redirect.Action.ADMIN_PATH, `/charges/${APP_HANDLE}/pricing_plans`);
    } catch (e) {
      console.error('Redirect to pricing plans failed:', e);
    }
  };
  return (
    <Page title="Plans">
      <Layout>
        {status && (
          <Layout.Section>
            <Banner status="info" title={`Current plan: ${status.plan}`}>
              <p>Size charts used: {status.usage?.charts ?? 0}</p>
            </Banner>
          </Layout.Section>
        )}
        {tiers.map(t => (
          <Layout.Section key={t.name} oneThird>
            <LegacyCard sectioned>
              <Text as="h2" variant="headingMd">{t.name}</Text>
              <Box paddingBlockStart="2">
                <Text as="p" variant="bodyLg">{t.price} / month</Text>
                <Text as="p" variant="bodyMd" tone="subdued">{t.desc}</Text>
              </Box>
              <Box paddingBlockStart="4">
                <Button onClick={() => onSelect(t.plan)} fullWidth>Choose {t.name}</Button>
              </Box>
            </LegacyCard>
          </Layout.Section>
        ))}
      </Layout>
    </Page>
  );
}


