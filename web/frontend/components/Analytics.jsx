import {
  LegacyCard,
  Text,
  Box,
  LegacyStack,
  Button,
  DataTable,
  Spinner,
  Banner,
  Select,
} from "@shopify/polaris";
import { useState, useCallback, useEffect } from "react";
import { useAuthenticatedFetch } from '@shopify/app-bridge-react';
import { Button as PButton } from "@shopify/polaris";

export function Analytics({ shop, host }) {
  const fetch = useAuthenticatedFetch();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [analyticsData, setAnalyticsData] = useState({
    totalViews: 0,
    totalRecommendations: 0,
    topProductsByRecommendations: [],
    topProductsByViews: []
  });
  const [selectedDateRange, setSelectedDateRange] = useState('last7days');
  const [showAllViews, setShowAllViews] = useState(false);
  const [showAllRecommendations, setShowAllRecommendations] = useState(false);

  const dateRangeOptions = [
    { label: 'Last 7 Days', value: 'last7days' },
    { label: 'Last 30 Days', value: 'last30days' },
    { label: 'Last 90 Days', value: 'last90days' },
  ];

  const fetchAnalyticsData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetch(`/api/analytics?shop=${shop}&host=${host}&range=${selectedDateRange}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch analytics data');
      }
      
      const data = await response.json();
      setAnalyticsData(data);
    } catch (err) {
      console.error('Error fetching analytics:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [fetch, shop, host, selectedDateRange]);

  useEffect(() => {
    if (shop && host) {
      fetchAnalyticsData();
    }
  }, [fetchAnalyticsData, shop, host, selectedDateRange]);

  const rows = [
    ['Total Views', analyticsData.totalViews],
    ['Total Recommendations', analyticsData.totalRecommendations],
  ];

  const handleUpgrade = async (plan) => {
    try {
      window.location.href = `/api/billing/redirect?plan=${encodeURIComponent(plan)}`;
    } catch (e) {}
  };

  const renderProductRow = (product, index) => {
    return [
      <Box key={`product-${index}`}>
        <Text variant="bodyMd" fontWeight="semibold">
          {product.product_title || 'Unknown Product'}
        </Text>
        <Text variant="bodySm" color="subdued">
          {product.product_handle || 'No handle'}
        </Text>
      </Box>
    ];
  };

  const renderTopProductsByViews = () => {
    if (analyticsData.topProductsByViews.length === 0) {
      return (
        <Banner status="info">
          <p>No product views data available yet. Start using the widget to see which products get the most views!</p>
        </Banner>
      );
    }
    const displayProducts = showAllViews ? analyticsData.topProductsByViews : analyticsData.topProductsByViews.slice(0, 5);
    const productRows = displayProducts.map((product, index) => [
      ...renderProductRow(product, index),
      product.view_count
    ]);
    return (
      <>
        <DataTable
          columnContentTypes={['text', 'numeric']}
          headings={['Product', 'Views']}
          rows={productRows}
        />
        {analyticsData.topProductsByViews.length > 5 && !showAllViews && (
          <Box paddingBlockStart="2">
            <Button onClick={() => setShowAllViews(true)} fullWidth>
              See More
            </Button>
          </Box>
        )}
        {showAllViews && (
          <Box paddingBlockStart="2">
            <Button onClick={() => setShowAllViews(false)} fullWidth>
              See Less
            </Button>
          </Box>
        )}
      </>
    );
  };

  const renderTopProductsByRecommendations = () => {
    if (analyticsData.topProductsByRecommendations.length === 0) {
      return (
        <Banner status="info">
          <p>No recommendations data available yet. Start using the widget to see which products get the most recommendations!</p>
        </Banner>
      );
    }
    const displayProducts = showAllRecommendations ? analyticsData.topProductsByRecommendations : analyticsData.topProductsByRecommendations.slice(0, 5);
    const productRows = displayProducts.map((product, index) => [
      ...renderProductRow(product, index),
      product.recommendation_count
    ]);
    return (
      <>
        <DataTable
          columnContentTypes={['text', 'numeric']}
          headings={['Product', 'Recommendations']}
          rows={productRows}
        />
        {analyticsData.topProductsByRecommendations.length > 5 && !showAllRecommendations && (
          <Box paddingBlockStart="2">
            <Button onClick={() => setShowAllRecommendations(true)} fullWidth>
              See More
            </Button>
          </Box>
        )}
        {showAllRecommendations && (
          <Box paddingBlockStart="2">
            <Button onClick={() => setShowAllRecommendations(false)} fullWidth>
              See Less
            </Button>
          </Box>
        )}
      </>
    );
  };

  if (isLoading) {
    return (
      <Box padding="4">
        <LegacyCard>
          <Box padding="4">
            <LegacyStack distribution="center">
              <Spinner accessibilityLabel="Loading analytics" size="large" />
            </LegacyStack>
          </Box>
        </LegacyCard>
      </Box>
    );
  }

  if (error) {
    return (
      <Box padding="4">
        <Banner status="critical">
          <p>{error}</p>
        </Banner>
      </Box>
    );
  }

  return (
    <Box padding="4">
      <LegacyCard>
        <LegacyCard.Section>
          <LegacyStack distribution="equalSpacing" alignment="center">
            <Text variant="headingMd" as="h2">
              Analytics Overview
            </Text>
            <Select
              label="Date Range"
              options={dateRangeOptions}
              value={selectedDateRange}
              onChange={setSelectedDateRange}
              labelInline
            />
          </LegacyStack>
        </LegacyCard.Section>

        <LegacyCard.Section>
          <DataTable
            columnContentTypes={['text', 'numeric']}
            headings={['Metric', 'Value']}
            rows={rows}
          />
        </LegacyCard.Section>

        <LegacyCard.Section>
          <Text variant="headingMd" as="h3">
            Top Products by Recommendations
          </Text>
          <Box paddingBlockStart="2">
            <PButton onClick={() => handleUpgrade('Pro')}>Upgrade to Pro</PButton>
          </Box>
          <Box paddingBlockStart="4">
            {renderTopProductsByRecommendations()}
          </Box>
        </LegacyCard.Section>

        <LegacyCard.Section>
          <Text variant="headingMd" as="h3">
            Top Products by Views
          </Text>
          <Box paddingBlockStart="4">
            {renderTopProductsByViews()}
          </Box>
        </LegacyCard.Section>
      </LegacyCard>
    </Box>
  );
} 