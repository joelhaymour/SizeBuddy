import { Card, Page, Layout, Text, Button, LegacyCard, Box, Banner } from "@shopify/polaris";
import { useEffect, useState } from 'react';
import { useAuthenticatedFetch, useAppBridge } from "@shopify/app-bridge-react";
import { Redirect } from '@shopify/app-bridge/actions';

export default function Plans() {
  const [status, setStatus] = useState(null);
  const fetch = useAuthenticatedFetch();
  const app = useAppBridge();
  useEffect(() => {
    fetch('/api/billing/status').then(r => r.json()).then(setStatus).catch(()=>{});
  }, []);
  const tiers = [
    { name: 'Free', price: '$0', desc: '2 size charts', plan: 'Free' },
    { name: 'Pro', price: '$12.99', desc: '4 size charts', plan: 'Pro' },
    { name: 'Premium', price: '$24.99', desc: 'Unlimited charts', plan: 'Premium' },
  ];
  const onSelect = async (plan) => {
    try {
      const resp = await fetch(`/api/billing/redirect?plan=${encodeURIComponent(plan)}`, { method: 'POST' });
      if (resp.status === 401) {
        const reauthUrl = resp.headers.get('X-Shopify-API-Request-Failure-Reauthorize-Url');
        if (reauthUrl) {
          const redirect = Redirect.create(app);
          redirect.dispatch(Redirect.Action.REMOTE, reauthUrl);
          return;
        }
      }
      if (resp.status === 401) {
        // kick back to auth to re-establish session
        const params = new URLSearchParams(window.location.search);
        const shop = params.get('shop');
        if (shop) window.location.href = `/api/auth?shop=${encodeURIComponent(shop)}`;
        return;
      }
      const data = await resp.json().catch(() => null);
      if (data && data.url) {
        try {
          const redirect = Redirect.create(app);
          redirect.dispatch(Redirect.Action.REMOTE, data.url);
        } catch {
          // Fallback
          window.top.location.href = data.url;
        }
      } else {
        // Fallback to server redirect by navigating directly (GET)
        window.location.href = `/api/billing/redirect?plan=${encodeURIComponent(plan)}`;
      }
    } catch (e) {
      console.error('Plan select failed:', e);
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


