import {
  Banner,
  Box,
  Button,
  LegacyCard,
  LegacyStack,
  Modal,
  Select,
  Spinner,
  Text,
  TextField,
} from '@shopify/polaris';
import { useAuthenticatedFetch } from '@shopify/app-bridge-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

const MIN_INSIGHT_RECOMMENDATIONS = 10;
const DEFAULT_INSIGHT_ITEMS = 5;
const WINNER_ATC_LIFT_THRESHOLD = 10;
const WINNER_PURCHASE_LIFT_THRESHOLD = 2.5;
const WINNER_REVENUE_THRESHOLD = 75;
const FRICTION_ATC_GAP_THRESHOLD = 10;
const FRICTION_PURCHASE_GAP_THRESHOLD = 2.5;
const FRICTION_SOLD_OUT_RATE_THRESHOLD = 20;
const FRICTION_UNAVAILABLE_RATE_THRESHOLD = 12;

const BADGE_STYLES = {
  'Top performer': { background: '#e9f9ef', color: '#137333' },
  'ATC winner': { background: '#e9f9ef', color: '#137333' },
  'Purchase winner': { background: '#eaf3ff', color: '#0b57d0' },
  'Revenue driver': { background: '#f3ecff', color: '#6f42c1' },
  'Sold-out sizes': { background: '#fff4e8', color: '#9a4d00' },
  'Unavailable sizes': { background: '#fff1f0', color: '#c5221f' },
  'Low add-to-cart': { background: '#fff7d6', color: '#8a5b00' },
  'Low purchase conversion': { background: '#ffe9e7', color: '#b42318' },
  'Needs attention': { background: '#f6f6f7', color: '#5c5f62' },
  'Winning product': { background: '#e9f9ef', color: '#137333' },
};

const INSIGHT_SUGGESTIONS = {
  'Top performer': 'Use this product as a benchmark for fit guidance and merchandising on similar styles.',
  'ATC winner': "Review what is working on this product's sizing experience and apply it to similar products.",
  'Purchase winner': "Mirror this product's fit messaging and buying journey on similar products.",
  'Revenue driver': 'Feature this product in campaigns and use its sizing setup as a model for related products.',
  'Sold-out sizes': 'Review inventory planning for the recommended sizes customers want most.',
  'Unavailable sizes': 'Check whether the size chart is recommending sizes this product does not carry.',
  'Low add-to-cart': 'Review size chart clarity, fit copy, and product page sizing confidence.',
  'Low purchase conversion': 'Review fit trust, shipping, price, and checkout friction after the recommendation.',
  'Needs attention': "Review this product's sizing setup and customer journey to find the source of friction.",
  'Winning product': 'Use this product as a benchmark for fit guidance and merchandising on similar styles.',
};
const productPerformanceColumns = 'minmax(220px, 1.3fr) minmax(140px, 0.75fr) minmax(220px, 1fr) minmax(190px, 0.9fr) minmax(200px, 0.9fr)';

const metricCellStyle = {
  textAlign: 'center',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 4,
  padding: '18px 12px',
};

function formatCurrency(value, currency = 'USD') {
  const amount = Number(value || 0);
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch (_error) {
    return `$${amount.toFixed(2)}`;
  }
}

function formatPercent(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function formatPointDifference(value, directionLabel) {
  return `${Math.abs(Number(value || 0)).toFixed(1)} pts ${directionLabel} store average`;
}

function SummaryCard({ title, value, subtitle }) {
  return (
    <div
      style={{
        background: '#ffffff',
        border: '1px solid #e1e3e5',
        borderRadius: 16,
        padding: 20,
        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
        minHeight: 132,
      }}
    >
      <Text as="h3" variant="bodyMd" tone="subdued">
        {title}
      </Text>
      <div style={{ marginTop: 14 }}>
        <Text as="p" variant="heading2xl">
          {value}
        </Text>
      </div>
      <div style={{ marginTop: 10 }}>
        <Text as="p" variant="bodySm" tone="subdued">
          {subtitle}
        </Text>
      </div>
    </div>
  );
}

function InsightPanel({ title, subtitle, items, emptyMessage, showAll, onToggleShowAll, onItemClick }) {
  const visibleItems = showAll ? items : items.slice(0, DEFAULT_INSIGHT_ITEMS);
  const hasMore = items.length > DEFAULT_INSIGHT_ITEMS;
  const [activeItemId, setActiveItemId] = useState(null);

  return (
    <div
      style={{
        background: '#ffffff',
        border: '1px solid #e1e3e5',
        borderRadius: 16,
        padding: 20,
        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
      }}
    >
      <Text as="h3" variant="headingMd">
        {title}
      </Text>
      <div style={{ marginTop: 6 }}>
        <Text as="p" variant="bodySm" tone="subdued">
          {subtitle}
        </Text>
      </div>

      <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
        {visibleItems.length ? visibleItems.map((item) => {
          const badgeStyle = BADGE_STYLES[item.badge] || BADGE_STYLES['Needs attention'];
          const suggestion = INSIGHT_SUGGESTIONS[item.badge] || INSIGHT_SUGGESTIONS['Needs attention'];
          const isInteractive = Boolean(onItemClick);
          const isActive = activeItemId === String(item.product_id);
          return (
            <div
              key={item.product_id}
              role="button"
              tabIndex={0}
              onClick={() => onItemClick && onItemClick(item)}
              onMouseEnter={() => isInteractive && setActiveItemId(String(item.product_id))}
              onMouseLeave={() => isInteractive && setActiveItemId(null)}
              onFocus={() => isInteractive && setActiveItemId(String(item.product_id))}
              onBlur={() => isInteractive && setActiveItemId(null)}
              onKeyDown={(event) => {
                if (!onItemClick) return;
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onItemClick(item);
                }
              }}
              style={{
                border: '1px solid #e9eaeb',
                borderRadius: 14,
                padding: 14,
                background: isActive ? '#f8fbff' : '#ffffff',
                borderColor: isActive ? '#0b57d0' : '#e9eaeb',
                cursor: onItemClick ? 'pointer' : 'default',
                boxShadow: isActive ? '0 8px 24px rgba(11, 87, 208, 0.12)' : '0 1px 2px rgba(0, 0, 0, 0.03)',
                transform: isActive ? 'translateY(-1px)' : 'translateY(0)',
                transition: 'background-color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease',
                outline: 'none',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: 12,
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  <Text as="p" variant="bodyMd" fontWeight="semibold">
                    {item.product_title}
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    {item.product_handle ? `/${item.product_handle}` : 'No handle'}
                  </Text>
                </div>

                <div
                  style={{
                    padding: '4px 10px',
                    borderRadius: 999,
                    background: badgeStyle.background,
                    color: badgeStyle.color,
                    fontSize: 12,
                    fontWeight: 600,
                    lineHeight: 1.2,
                  }}
                >
                  {item.badge}
                </div>
              </div>

              <div style={{ marginTop: 12, display: 'grid', gap: 6 }}>
                {item.reasons.map((reason) => (
                  <Text key={`${item.product_id}-${reason}`} as="p" variant="bodySm" tone="subdued">
                    {reason}
                  </Text>
                ))}
              </div>

              <div
                style={{
                  marginTop: 12,
                  paddingTop: 12,
                  borderTop: '1px solid #f1f2f4',
                }}
              >
                <Text as="p" variant="bodySm" tone="subdued">
                  <span style={{ fontWeight: 600, color: '#202223' }}>Suggestion:</span>{' '}
                  {suggestion}
                </Text>
              </div>
            </div>
          );
        }) : (
          <div
            style={{
              border: '1px dashed #d2d5d8',
              borderRadius: 14,
              padding: 16,
              background: '#fafbfb',
            }}
          >
            <Text as="p" variant="bodySm" tone="subdued">
              {emptyMessage}
            </Text>
          </div>
        )}
      </div>

      {hasMore ? (
        <div style={{ marginTop: 16 }}>
          <Button onClick={onToggleShowAll}>{showAll ? 'See less' : 'See more'}</Button>
        </div>
      ) : null}
    </div>
  );
}

export function Analytics({ shop, host }) {
  const fetch = useAuthenticatedFetch();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedDateRange, setSelectedDateRange] = useState('last7days');
  const [searchValue, setSearchValue] = useState('');
  const [showAllProducts, setShowAllProducts] = useState(false);
  const [showAllWinners, setShowAllWinners] = useState(false);
  const [showAllFriction, setShowAllFriction] = useState(false);
  const [jumpTargetProductId, setJumpTargetProductId] = useState(null);
  const [highlightedProductId, setHighlightedProductId] = useState(null);
  const [analyticsData, setAnalyticsData] = useState({
    totalViews: 0,
    summary: {
      totalRevenue: 0,
      totalRecommendations: 0,
      recommendationToAddToCartRate: 0,
      recommendationToPurchaseRate: 0,
      currency: 'USD',
    },
    productPerformance: [],
  });
  const [soldOutModalProduct, setSoldOutModalProduct] = useState(null);

  const dateRangeOptions = useMemo(() => ([
    { label: 'Past 7 Days', value: 'last7days' },
    { label: 'Past 30 Days', value: 'last30days' },
    { label: 'Past 90 Days', value: 'last90days' },
    { label: 'Past 365 Days', value: 'last365days' },
    { label: 'All Time', value: 'all' },
  ]), []);

  const fetchAnalyticsData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetch(
        `/api/analytics?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host || '')}&range=${encodeURIComponent(selectedDateRange)}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch analytics data');
      }

      const data = await response.json();
      setAnalyticsData({
        totalViews: Number(data?.totalViews || 0),
        summary: {
          totalRevenue: Number(data?.summary?.totalRevenue || 0),
          totalRecommendations: Number(data?.summary?.totalRecommendations || 0),
          recommendationToAddToCartRate: Number(data?.summary?.recommendationToAddToCartRate || 0),
          recommendationToPurchaseRate: Number(data?.summary?.recommendationToPurchaseRate || 0),
          currency: data?.summary?.currency || 'USD',
        },
        productPerformance: Array.isArray(data?.productPerformance) ? data.productPerformance : [],
      });
    } catch (err) {
      console.error('Error fetching analytics:', err);
      setError(err.message || 'Failed to fetch analytics data');
    } finally {
      setIsLoading(false);
    }
  }, [fetch, host, selectedDateRange, shop]);

  useEffect(() => {
    if (shop && host) {
      fetchAnalyticsData();
    }
  }, [fetchAnalyticsData, host, shop]);

  const summaryCards = useMemo(() => ([
    {
      title: 'Revenue Generated by Size Buddy',
      value: formatCurrency(analyticsData.summary.totalRevenue, analyticsData.summary.currency),
      subtitle: 'Attributed revenue from purchased Size Buddy recommendations.',
    },
    {
      title: 'Total Recommendations',
      value: String(analyticsData.summary.totalRecommendations || 0),
      subtitle: 'Total number of size recommendations across all products.',
    },
    {
      title: 'Store Average: Rec -> Add-to-Cart %',
      value: formatPercent(analyticsData.summary.recommendationToAddToCartRate),
      subtitle: 'Tracked available recommendations only. Historical pre-attribution recommendations are excluded.',
    },
    {
      title: 'Store Average: Rec -> Purchase %',
      value: formatPercent(analyticsData.summary.recommendationToPurchaseRate),
      subtitle: 'Tracked available recommendations only, using matched recommendation tokens from attributed purchases.',
    },
  ]), [analyticsData.summary]);

  const insightData = useMemo(() => {
    const storeAddToCartAverage = Number(analyticsData.summary.recommendationToAddToCartRate || 0);
    const storePurchaseAverage = Number(analyticsData.summary.recommendationToPurchaseRate || 0);
    const currency = analyticsData.summary.currency || 'USD';

    const eligibleProducts = analyticsData.productPerformance.filter((product) => Number(product?.available_recommendations || 0) >= MIN_INSIGHT_RECOMMENDATIONS);

    const winners = [];
    const friction = [];

    eligibleProducts.forEach((product) => {
      const totalRecommendations = Number(product?.total_recommendations || 0);
      const trackedTotalRecommendations = Number(product?.tracked_total_recommendations || 0);
      const availableRecommendations = Number(product?.available_recommendations || 0);
      const addToCartRate = Number(product?.rec_to_add_to_cart_rate || 0);
      const purchaseRate = Number(product?.rec_to_purchase_rate || 0);
      const soldOutRecommendations = Number(product?.sold_out_recommendations || 0);
      const unavailableRecommendations = Number(product?.unavailable_recommendations || 0);
      const soldOutRate = totalRecommendations ? (soldOutRecommendations / totalRecommendations) * 100 : 0;
      const unavailableRate = totalRecommendations ? (unavailableRecommendations / totalRecommendations) * 100 : 0;
      const addToCartLift = addToCartRate - storeAddToCartAverage;
      const purchaseLift = purchaseRate - storePurchaseAverage;
      const confidence = Math.max(0.75, Math.min(1, Math.max(availableRecommendations, trackedTotalRecommendations) / 20));

      const winnerReasons = [];
      const winnerSignals = [];
      const revenueGenerated = Number(product?.revenue_generated || 0);
      if (addToCartLift >= WINNER_ATC_LIFT_THRESHOLD) {
        winnerReasons.push(`${formatPointDifference(addToCartLift, 'above')} add-to-cart`);
        winnerSignals.push({ label: 'ATC winner', strength: addToCartLift / WINNER_ATC_LIFT_THRESHOLD });
      }
      if (purchaseLift >= WINNER_PURCHASE_LIFT_THRESHOLD) {
        winnerReasons.push(`${formatPointDifference(purchaseLift, 'above')} purchase rate`);
        winnerSignals.push({ label: 'Purchase winner', strength: purchaseLift / WINNER_PURCHASE_LIFT_THRESHOLD });
      }
      if (revenueGenerated >= WINNER_REVENUE_THRESHOLD && (purchaseLift >= 0.5 || product.purchase_total >= 1)) {
        winnerReasons.push(`${formatCurrency(revenueGenerated, currency)} attributed revenue`);
        winnerSignals.push({ label: 'Revenue driver', strength: Math.max(1, Math.min(4, revenueGenerated / WINNER_REVENUE_THRESHOLD)) });
      }

      let winnerCandidate = null;
      if (availableRecommendations >= MIN_INSIGHT_RECOMMENDATIONS && winnerSignals.length > 0) {
        const winnerScore = (((Math.max(0, addToCartLift) / WINNER_ATC_LIFT_THRESHOLD) * 0.5) + ((Math.max(0, purchaseLift) / WINNER_PURCHASE_LIFT_THRESHOLD) * 0.35) + ((revenueGenerated >= WINNER_REVENUE_THRESHOLD ? Math.min(2, revenueGenerated / WINNER_REVENUE_THRESHOLD) : 0) * 0.15)) * confidence;
        if (winnerScore >= 0.65) {
          winnerSignals.sort((left, right) => right.strength - left.strength);
          winnerCandidate = {
            ...product,
            badge: winnerSignals[0]?.label || 'Winning product',
            reasons: winnerReasons.slice(0, 3),
            score: winnerScore,
          };
        }
      }

      const frictionReasons = [];
      const frictionSignals = [];
      if (soldOutRecommendations >= 2 && soldOutRate >= FRICTION_SOLD_OUT_RATE_THRESHOLD) {
        frictionReasons.push(`${soldOutRate.toFixed(1)}% of recommendations were sold out`);
        frictionSignals.push({ label: 'Sold-out sizes', strength: soldOutRate / FRICTION_SOLD_OUT_RATE_THRESHOLD });
      }
      if (unavailableRecommendations >= 2 && unavailableRate >= FRICTION_UNAVAILABLE_RATE_THRESHOLD) {
        frictionReasons.push(`${unavailableRate.toFixed(1)}% of recommendations were unavailable`);
        frictionSignals.push({ label: 'Unavailable sizes', strength: unavailableRate / FRICTION_UNAVAILABLE_RATE_THRESHOLD });
      }
      if (availableRecommendations >= MIN_INSIGHT_RECOMMENDATIONS && storeAddToCartAverage - addToCartRate >= FRICTION_ATC_GAP_THRESHOLD) {
        frictionReasons.push(`${formatPointDifference(storeAddToCartAverage - addToCartRate, 'below')} add-to-cart`);
        frictionSignals.push({ label: 'Low add-to-cart', strength: (storeAddToCartAverage - addToCartRate) / FRICTION_ATC_GAP_THRESHOLD });
      }
      if (availableRecommendations >= MIN_INSIGHT_RECOMMENDATIONS && storePurchaseAverage - purchaseRate >= FRICTION_PURCHASE_GAP_THRESHOLD) {
        frictionReasons.push(`${formatPointDifference(storePurchaseAverage - purchaseRate, 'below')} purchase rate`);
        frictionSignals.push({ label: 'Low purchase conversion', strength: (storePurchaseAverage - purchaseRate) / FRICTION_PURCHASE_GAP_THRESHOLD });
      }

      let frictionCandidate = null;
      if (frictionSignals.length > 0) {
        const frictionScore = (((Math.max(0, storeAddToCartAverage - addToCartRate) / FRICTION_ATC_GAP_THRESHOLD) * 0.35) + ((Math.max(0, storePurchaseAverage - purchaseRate) / FRICTION_PURCHASE_GAP_THRESHOLD) * 0.3) + ((soldOutRate / FRICTION_SOLD_OUT_RATE_THRESHOLD) * 0.25) + ((unavailableRate / FRICTION_UNAVAILABLE_RATE_THRESHOLD) * 0.1)) * confidence;
        if (frictionScore >= 0.65) {
          frictionSignals.sort((left, right) => right.strength - left.strength);
          frictionCandidate = {
            ...product,
            badge: frictionSignals[0]?.label || 'Needs attention',
            reasons: frictionReasons.slice(0, 3),
            score: frictionScore,
          };
        }
      }

      if (winnerCandidate && frictionCandidate) {
        if (winnerCandidate.score >= frictionCandidate.score) {
          winners.push(winnerCandidate);
        } else {
          friction.push(frictionCandidate);
        }
        return;
      }

      if (winnerCandidate) {
        winners.push(winnerCandidate);
      }

      if (frictionCandidate) {
        friction.push(frictionCandidate);
      }
    });

    winners.sort((left, right) => right.score - left.score || right.available_recommendations - left.available_recommendations);
    friction.sort((left, right) => right.score - left.score || right.available_recommendations - left.available_recommendations);

    return {
      winners,
      friction,
    };
  }, [analyticsData.productPerformance, analyticsData.summary]);

  const filteredProducts = useMemo(() => {
    const query = searchValue.trim().toLowerCase();
    if (!query) return analyticsData.productPerformance;

    return analyticsData.productPerformance.filter((product) => {
      const title = String(product?.product_title || '').toLowerCase();
      const handle = String(product?.product_handle || '').toLowerCase();
      return title.includes(query) || handle.includes(query);
    });
  }, [analyticsData.productPerformance, searchValue]);

  const visibleProducts = useMemo(() => {
    return showAllProducts ? filteredProducts : filteredProducts.slice(0, 5);
  }, [filteredProducts, showAllProducts]);

  const handleInsightProductClick = useCallback((product) => {
    if (!product?.product_id) return;
    setSearchValue('');
    setShowAllProducts(true);
    setJumpTargetProductId(String(product.product_id));
  }, []);

  useEffect(() => {
    if (!jumpTargetProductId) return undefined;

    const targetId = String(jumpTargetProductId);
    const tableSection = document.getElementById('product-performance-section');
    const row = document.getElementById(`product-performance-row-${targetId}`);
    if (!row) return undefined;

    tableSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const scrollTimer = window.setTimeout(() => {
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedProductId(targetId);
      setJumpTargetProductId(null);
    }, 180);

    const highlightTimer = window.setTimeout(() => {
      setHighlightedProductId((current) => (current === targetId ? null : current));
    }, 2600);

    return () => {
      window.clearTimeout(scrollTimer);
      window.clearTimeout(highlightTimer);
    };
  }, [jumpTargetProductId, visibleProducts]);

  const hasMoreProducts = filteredProducts.length > 5;

  if (isLoading) {
    return (
      <Box padding="4">
        <LegacyCard>
          <Box padding="6">
            <LegacyStack distribution="center">
              <Spinner accessibilityLabel="Loading analytics" size="large" />
            </LegacyStack>
          </Box>
        </LegacyCard>
      </Box>
    );
  }

  return (
    <>
      {error ? (
        <Box paddingBlockEnd="4">
          <Banner tone="critical">
            <p>{error}</p>
          </Banner>
        </Box>
      ) : null}

      <div style={{ marginBottom: 16 }}>
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e1e3e5',
            borderRadius: 16,
            padding: 20,
            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
              flexWrap: 'wrap',
            }}
          >
            <div>
              <Text as="h2" variant="headingLg">
                Analytics & Insights
              </Text>
              <div style={{ marginTop: 6 }}>
                <Text as="p" variant="bodyMd" tone="subdued">
                  See how Size Buddy is impacting your revenue and conversions.
                </Text>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 180 }}>
                <Select
                  label="Date Range"
                  labelHidden
                  options={dateRangeOptions}
                  value={selectedDateRange}
                  onChange={setSelectedDateRange}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 16,
          marginBottom: 20,
        }}
      >
        {summaryCards.map((card) => (
          <SummaryCard key={card.title} {...card} />
        ))}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 16,
          marginBottom: 20,
        }}
      >
        <InsightPanel
          title="Winning Products"
          subtitle={`Products with at least ${MIN_INSIGHT_RECOMMENDATIONS} tracked recommendations that are clearly outperforming store averages.`}
          items={insightData.winners}
          emptyMessage={`No products with ${MIN_INSIGHT_RECOMMENDATIONS}+ tracked recommendations are clearly outperforming the store average yet.`}
          showAll={showAllWinners}
          onToggleShowAll={() => setShowAllWinners((current) => !current)}
          onItemClick={handleInsightProductClick}
        />

        <InsightPanel
          title="Friction Detected"
          subtitle={`Products with at least ${MIN_INSIGHT_RECOMMENDATIONS} tracked recommendations that clearly show stock or conversion friction.`}
          items={insightData.friction}
          emptyMessage={`No products with ${MIN_INSIGHT_RECOMMENDATIONS}+ tracked recommendations are showing meaningful friction right now.`}
          showAll={showAllFriction}
          onToggleShowAll={() => setShowAllFriction((current) => !current)}
          onItemClick={handleInsightProductClick}
        />
      </div>

      <LegacyCard>
        <LegacyCard.Section>
          <div id="product-performance-section" />
          <Text as="h3" variant="headingMd">
            Product Performance
          </Text>
          <div style={{ marginTop: 6 }}>
            <Text as="p" variant="bodyMd" tone="subdued">
              Recommendation-to-cart and recommendation-to-purchase percentages use tracked available recommendations only, so older pre-attribution recommendations do not dilute the conversion rates.
            </Text>
          </div>
        </LegacyCard.Section>

        <LegacyCard.Section>
          <div style={{ maxWidth: 360, marginBottom: 16 }}>
            <TextField
              label="Search products"
              labelHidden
              value={searchValue}
              onChange={(value) => {
                setSearchValue(value);
                setShowAllProducts(false);
              }}
              autoComplete="off"
              placeholder="Search products"
              clearButton
              onClearButtonClick={() => {
                setSearchValue('');
                setShowAllProducts(false);
              }}
            />
          </div>

          {visibleProducts.length ? (
            <>
              <div style={{ overflowX: 'auto' }}>
                <div style={{ minWidth: 980 }}>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: productPerformanceColumns,
                      columnGap: 24,
                      alignItems: 'center',
                      padding: '0 12px 12px',
                      borderBottom: '1px solid #e1e3e5',
                    }}
                  >
                    <Text as="span" variant="bodySm" fontWeight="medium">
                      Product
                    </Text>
                    <div style={{ textAlign: 'center' }}>
                      <Text as="span" variant="bodySm" fontWeight="medium">
                        Total Recommendations
                      </Text>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <Text as="span" variant="bodySm" fontWeight="medium">
                        Recommendation -&gt; Add to Cart %
                      </Text>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <Text as="span" variant="bodySm" fontWeight="medium">
                        Recommendations to Sold Out Size
                      </Text>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <Text as="span" variant="bodySm" fontWeight="medium">
                        Recommendation -&gt; Purchase %
                      </Text>
                    </div>
                  </div>

                  {visibleProducts.map((product) => {
                    const soldOutCount = Number(product?.sold_out_recommendations || 0);

                    return (
                      <div
                        id={`product-performance-row-${product.product_id}`}
                        key={product.product_id}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: productPerformanceColumns,
                          columnGap: 24,
                          alignItems: 'center',
                          padding: '0 12px',
                          borderBottom: '1px solid #f1f2f4',
                          background: highlightedProductId === String(product.product_id) ? '#f0f7ff' : '#ffffff',
                          boxShadow: highlightedProductId === String(product.product_id) ? 'inset 0 0 0 1px #0b57d0' : 'none',
                          borderRadius: highlightedProductId === String(product.product_id) ? 12 : 0,
                          scrollMarginTop: 24,
                          transition: 'background-color 0.25s ease, box-shadow 0.25s ease',
                        }}
                      >
                        <div style={{ padding: '18px 0' }}>
                          <Text as="p" variant="bodyMd" fontWeight="semibold">
                            {product.product_title || 'Unknown Product'}
                          </Text>
                          <Text as="p" variant="bodySm" tone="subdued">
                            {product.product_handle ? `/${product.product_handle}` : 'No handle'}
                          </Text>
                        </div>

                        <div style={metricCellStyle}>
                          <Text as="span" variant="bodyMd" fontWeight="medium">
                            {String(product.total_recommendations || 0)}
                          </Text>
                        </div>

                        <div style={metricCellStyle}>
                          <Text as="p" variant="bodyMd" fontWeight="medium">
                            {formatPercent(product.rec_to_add_to_cart_rate)}
                          </Text>
                          <Text as="p" variant="bodySm" tone="subdued">
                            {`${product.add_to_cart_total || 0} of ${product.available_recommendations || 0} tracked recommendations`}
                          </Text>
                        </div>

                        <div style={metricCellStyle}>
                          {soldOutCount > 0 ? (
                            <Button plain onClick={() => setSoldOutModalProduct(product)}>
                              {soldOutCount}
                            </Button>
                          ) : (
                            <Text as="span" variant="bodyMd" tone="subdued">
                              0
                            </Text>
                          )}
                        </div>

                        <div style={metricCellStyle}>
                          <Text as="p" variant="bodyMd" fontWeight="medium">
                            {formatPercent(product.rec_to_purchase_rate)}
                          </Text>
                          <Text as="p" variant="bodySm" tone="subdued">
                            {`${product.purchase_total || 0} purchases from ${product.available_recommendations || 0} tracked recommendations`}
                          </Text>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {hasMoreProducts ? (
                <Box paddingBlockStart="4">
                  <Button onClick={() => setShowAllProducts((current) => !current)}>
                    {showAllProducts ? 'See less' : 'See more'}
                  </Button>
                </Box>
              ) : null}
            </>
          ) : (
            <Banner tone="info">
              <p>
                {filteredProducts.length === 0 && searchValue.trim()
                  ? 'No products match your search.'
                  : 'No analytics data is available for this time range yet.'}
              </p>
            </Banner>
          )}
        </LegacyCard.Section>
      </LegacyCard>

      <Modal
        open={Boolean(soldOutModalProduct)}
        onClose={() => setSoldOutModalProduct(null)}
        title={soldOutModalProduct ? `${soldOutModalProduct.product_title} sold-out recommendations` : 'Sold-out recommendations'}
        primaryAction={{
          content: 'Close',
          onAction: () => setSoldOutModalProduct(null),
        }}
      >
        <Modal.Section>
          {soldOutModalProduct && soldOutModalProduct.sold_out_breakdown?.length ? (
            <div style={{ display: 'grid', gap: 12 }}>
              {soldOutModalProduct.sold_out_breakdown.map((item) => (
                <div
                  key={`${soldOutModalProduct.product_id}-${item.size}`}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '12px 14px',
                    borderRadius: 12,
                    background: '#f6f6f7',
                  }}
                >
                  <Text as="span" variant="bodyMd" fontWeight="medium">
                    Size {item.size}
                  </Text>
                  <Text as="span" variant="bodyMd" tone="subdued">
                    {item.count}
                  </Text>
                </div>
              ))}
            </div>
          ) : (
            <Text as="p" variant="bodyMd" tone="subdued">
              No sold-out recommendation breakdown is available for this product.
            </Text>
          )}
        </Modal.Section>
      </Modal>
    </>
  );
}
