import {
  LegacyCard,
  Button,
  Text,
  Box,
  Modal,
  TextField,
  LegacyStack,
  ResourceList,
  ResourceItem,
  Badge,
  Icon,
  Banner,
  Frame,
  Loading,
  Toast,
  SkeletonBodyText,
  Layout,
  EmptyState,
  ButtonGroup,
  Card,
  Grid,
  DataTable,
  Spinner,
  RangeSlider
} from "@shopify/polaris";
import { ResourcePicker } from "@shopify/app-bridge-react";
import {
  CircleTickMajor,
  CirclePlusMajor,
  CircleInformationMajor
} from '@shopify/polaris-icons';
import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useAuthenticatedFetch } from '@shopify/app-bridge-react';
import { defaultSizeCharts } from '../templates/default-size-charts';
import { useNavigate } from 'react-router-dom';
import { useAppBridge } from '@shopify/app-bridge-react';
import { useTranslation } from 'react-i18next';

export function calculateScoreRange(height, weight, fitType) {
  if (!height || !weight) return null;
  
  // Parse height and weight ranges
  const heightRange = height.includes('-') 
    ? height.split('-').map(h => parseFloat(h))
    : [parseFloat(height), parseFloat(height)];
    
  const weightRange = weight.includes('-')
    ? weight.split('-').map(w => parseFloat(w))
    : [parseFloat(weight), parseFloat(weight)];
    
  if (heightRange.some(isNaN) || weightRange.some(isNaN)) return null;
  
  // Get minimum and maximum scores
  const minScore = heightRange[0] + weightRange[0];
  const maxScore = heightRange[1] + weightRange[1];
  
  // Apply fit type adjustments
  let adjustedMinScore = minScore;
  let adjustedMaxScore = maxScore;
  
  if (fitType === 'slim') {
    // Slim fit has scores 10 points lower than regular
    adjustedMinScore = minScore - 10;
    adjustedMaxScore = maxScore - 10;
  } else if (fitType === 'loose') {
    // Loose fit has scores 10 points higher than regular
    adjustedMinScore = minScore + 10;
    adjustedMaxScore = maxScore + 10;
  }
  
  return `${Math.round(adjustedMinScore)}-${Math.round(adjustedMaxScore)}`;
}

export function SizeRecommendation({ shop, host }) {
  const navigate = useNavigate();
  const app = useAppBridge();
  const { t } = useTranslation();
  const fetch = useAuthenticatedFetch();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [step, setStep] = useState('category'); // 'category', 'details', 'chart'
  const [chartName, setChartName] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedFitType, setSelectedFitType] = useState('');
  const [sizeCharts, setSizeCharts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [toastProps, setToastProps] = useState({ content: '', error: false });
  const [showToast, setShowToast] = useState(false);
  const [currentSizeChart, setCurrentSizeChart] = useState(null);
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [isProductPickerOpen, setIsProductPickerOpen] = useState(false);
  const isMounted = useRef(true);
  const [editingChartId, setEditingChartId] = useState(null);

  // Add custom styles for the modal
  useEffect(() => {
    // Create a style element
    const styleEl = document.createElement('style');
    
    // Add CSS rules to override Polaris modal width
    styleEl.innerHTML = `
      .Polaris-Modal-Dialog__Modal {
        display: flex !important;
        flex-direction: column !important;
        max-width: 95vw !important;
        width: 1000px !important;
      }
      
      .Polaris-Modal-Dialog__Container, 
      .Polaris-Modal-Dialog__Modal,
      .Polaris-Modal__Container,
      .Polaris-Modal-Section {
        max-width: 95vw !important;
        width: auto !important;
      }
      
      .Polaris-Modal-Dialog__Container {
        display: flex;
        justify-content: center;
      }
    `;
    
    // Add the style element to the document head
    document.head.appendChild(styleEl);
    
    // Clean up when component unmounts
    return () => {
      document.head.removeChild(styleEl);
    };
  }, []);

  // Fetch existing size charts
  const fetchSizeCharts = useCallback(async () => {
    try {
      const response = await fetch(`/api/size-charts?shop=${shop}&host=${host}`);
      if (!response.ok) throw new Error('Failed to fetch size charts');
      const data = await response.json();
      if (isMounted.current) setSizeCharts(data);
    } catch (error) {
      console.error('Error fetching size charts:', error);
      setToastProps({
        content: 'Failed to load size charts',
        error: true
      });
      setShowToast(true);
    } finally {
      if (isMounted.current) setIsLoading(false);
    }
  }, [fetch, shop, host]);

  useEffect(() => {
    fetchSizeCharts();
    return () => {
      isMounted.current = false;
    };
  }, [fetchSizeCharts]);

  const handleCategorySelect = (category) => {
    console.log('Category selected:', category);
    setSelectedCategory(category);
  };

  const handleProductSelect = useCallback(({ selection }) => {
    // Log the selection to understand its structure
    console.log('Product Selection:', selection);
    
    // Format selected products to store only necessary information
    const formattedProducts = selection.map(product => {
      // Get the image URL from the product
      let imageUrl = null;
      
      // Log the product image data for debugging
      console.log('Product image data:', {
        title: product.title,
        hasImages: product.images && product.images.length > 0,
        hasFeaturedImage: !!product.featuredImage,
        images: product.images,
        featuredImage: product.featuredImage
      });
      
      if (product.images && product.images.length > 0) {
        imageUrl = product.images[0].originalSrc;
      } else if (product.featuredImage) {
        imageUrl = product.featuredImage.originalSrc;
      }
      
      // Ensure the image URL is valid
      if (!imageUrl) {
        console.log(`No image found for product: ${product.title}`);
      } else {
        console.log(`Found image for ${product.title}: ${imageUrl}`);
      }
      
      return {
        id: product.id.replace('gid://shopify/Product/', ''), // Extract numeric ID
        title: product.title,
        handle: product.handle,
        image: imageUrl
      };
    });
    
    console.log('Formatted Products:', formattedProducts);
    setSelectedProducts(formattedProducts);
    setIsProductPickerOpen(false);
    setStep('chart');
  }, []);

  const handleFitTypeSelect = (fitType) => {
    setSelectedFitType(fitType);
    
    // Get default chart based on selections
    let defaultChart;
    
    console.log('Selecting fit type:', {
      category: selectedCategory,
      fitType
    });
    
    try {
      defaultChart = defaultSizeCharts[selectedCategory][fitType];
      console.log('Selected regular chart:', defaultChart);
      
      if (!defaultChart) {
        console.error('Could not find default chart for:', {
          category: selectedCategory,
          fitType
        });
        return;
      }
      
      // Ensure the measurements are in the correct format
      const formattedChart = {
        ...defaultChart,
        sizes: defaultChart.sizes.map(size => {
          const formattedSize = { ...size };
          
          // Only process properties that exist
          if (size.height) {
            formattedSize.height = size.height.includes('-') ? size.height : `${size.height}-${size.height}`;
          }
          
          if (size.weight) {
            formattedSize.weight = size.weight.includes('-') ? size.weight : `${size.weight}-${size.weight}`;
          }
          
          if (size.waist) {
            formattedSize.waist = size.waist.includes('-') ? size.waist : `${size.waist}-${size.waist}`;
          }
          
          if (size.dress_size) {
            formattedSize.dress_size = size.dress_size.includes('-') ? size.dress_size : `${size.dress_size}-${size.dress_size}`;
          }
          
          if (size.cup_size) {
            formattedSize.cup_size = size.cup_size;
          }
          
          return formattedSize;
        })
      };
      
      setCurrentSizeChart(formattedChart);
      setIsProductPickerOpen(true);
    } catch (error) {
      console.error('Error in handleFitTypeSelect:', error);
    }
  };

  // Debug function to help diagnose image issues
  const debugProductImages = (products) => {
    if (!products || products.length === 0) {
      console.log('No products to debug');
      return;
    }
    
    console.log('=== PRODUCT IMAGE DEBUG ===');
    products.forEach((product, index) => {
      console.log(`Product ${index}: ${product.title}`);
      console.log(`- ID: ${product.id}`);
      console.log(`- Handle: ${product.handle}`);
      console.log(`- Image URL: ${product.image || 'None'}`);
      
      // Check if image URL is valid
      if (product.image) {
        const img = new Image();
        img.onload = () => console.log(`- Image loaded successfully for ${product.title}`);
        img.onerror = () => console.log(`- Image failed to load for ${product.title}`);
        img.src = product.image;
      }
    });
    console.log('=== END DEBUG ===');
  };

  const handleEdit = async (chart) => {
    console.log('Editing chart:', chart);
    
    setEditingChartId(chart.id);
    setChartName(chart.name);
    setSelectedCategory(chart.category);
    setSelectedFitType(chart.fit_type);
    
    // Handle chart_data properly whether it's a string or an object
    try {
      let parsedChartData;
      
      if (typeof chart.chart_data === 'string') {
        try {
          parsedChartData = JSON.parse(chart.chart_data);
        } catch (error) {
          console.error('Error parsing chart_data as JSON:', error);
          console.log('Raw chart_data:', chart.chart_data);
          // If parsing fails, try to use it as is
          parsedChartData = chart.chart_data;
        }
      } else {
        // If it's already an object, use it directly
        parsedChartData = chart.chart_data;
      }
      
      console.log('Parsed chart data:', parsedChartData);
      setCurrentSizeChart(parsedChartData);
    } catch (error) {
      console.error('Error processing chart data:', error);
      // Show an error toast
      setToastProps({
        content: `Error processing chart data: ${error.message}`,
        error: true
      });
      setShowToast(true);
      return;
    }
    
    // Debug the raw products data from the chart
    console.log('Raw products data from chart:', chart.products);
    
    // Format products for ResourcePicker, using the same approach as handleProductSelect
    const formattedProducts = chart.products ? chart.products.map(product => {
      console.log('Processing product for edit:', product);
      
      // Use the same image URL handling as in handleProductSelect
      let imageUrl = product.product_image;
      
      // If we don't have an image URL, use a default one that we know works
      if (!imageUrl) {
        imageUrl = 'https://cdn.shopify.com/s/files/1/0685/6065/0425/files/sizebuddy_app_pic.png?v=1740975922';
        console.log(`No image found for product: ${product.product_title}, using default`);
      } else {
        console.log(`Found image for ${product.product_title}: ${imageUrl}`);
      }
      
      return {
        id: product.product_id,
        title: product.product_title,
        handle: product.product_handle,
        image: imageUrl
      };
    }) : [];
    
    console.log('Editing chart products:', formattedProducts);
    // Run debug function
    debugProductImages(formattedProducts);
    
    setSelectedProducts(formattedProducts);
    setStep('chart');
    setIsModalOpen(true);
  };

  const handleModalClose = () => {
    console.log('Modal closing');
    setIsModalOpen(false);
    setStep('category');
    setChartName('');
    setSelectedCategory('');
    setSelectedFitType('');
    setCurrentSizeChart(null);
    setSelectedProducts([]);
    setEditingChartId(null);
  };

  const handleSave = async () => {
    console.log('Attempting to save size chart');
    try {
      if (!chartName || !selectedCategory || !selectedFitType || !currentSizeChart || selectedProducts.length === 0) {
        setToastProps({
          content: 'Please fill in all required fields and select at least one product',
          error: true
        });
        setShowToast(true);
        return;
      }

      // Debug product images before saving
      console.log('=== PRODUCTS BEFORE SAVING ===');
      debugProductImages(selectedProducts);

      // *** CRITICAL FIX: Calculate scores for all sizes before saving (for tops) ***
      let chartDataToSave = { ...currentSizeChart };
      if (selectedCategory === 'tops' && chartDataToSave.sizes) {
        chartDataToSave.sizes = chartDataToSave.sizes.map(size => {
          const updatedSize = { ...size };
          // Calculate score if height and weight are present but score is missing
          if (updatedSize.height && updatedSize.weight && !updatedSize.score) {
            const scoreRange = calculateScoreRange(updatedSize.height, updatedSize.weight, selectedFitType);
            if (scoreRange) {
              updatedSize.score = scoreRange;
              console.log(`Calculated score for size ${updatedSize.size}: ${scoreRange}`);
            }
          }
          return updatedSize;
        });
      }

      const requestData = {
        shop,
        chart_name: chartName,
        category: selectedCategory,
        fit_type: selectedFitType,
        chart_data: chartDataToSave,
        products: selectedProducts.map(product => ({
          id: product.id,
          title: product.title,
          handle: product.handle,
          image: product.image
        }))
      };

      // Log the data being sent
      console.log('Sending data:', requestData);

      const url = editingChartId 
        ? `/api/size-charts/${editingChartId}?shop=${shop}` 
        : '/api/size-charts';

      const method = editingChartId ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to ${editingChartId ? 'update' : 'create'} size chart`);
      }

      const responseData = await response.json();
      
      setToastProps({
        content: `Size chart ${editingChartId ? 'updated' : 'created'} successfully`,
        error: false
      });
      setShowToast(true);
      handleModalClose();
      fetchSizeCharts();
    } catch (error) {
      console.error('Error saving size chart:', error);
      setToastProps({
        content: `Error saving size chart: ${error.message}`,
        error: true
      });
      setShowToast(true);
    }
  };

  const handleDelete = async (chartId) => {
    try {
      const response = await fetch(`/api/size-charts/${chartId}?shop=${shop}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete size chart');
      }

      setToastProps({
        content: 'Size chart deleted successfully',
        error: false
      });
      setShowToast(true);
      fetchSizeCharts();
    } catch (error) {
      console.error('Error deleting size chart:', error);
      setToastProps({
        content: `Error deleting size chart: ${error.message}`,
        error: true
      });
      setShowToast(true);
    }
  };

  const renderCategorySelection = () => (
    <Grid>
      <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3 }}>
        <Card sectioned>
          <Button fullWidth onClick={() => handleCategorySelect('tops')}>
            <Box padding="4" alignment="center">
              <div style={{ width: '70px', height: '70px', marginBottom: '8px', color: 'var(--p-icon)' }}>
                <img
                  src={`${window.location.origin}/images/categories/tops.svg`}
                  alt="Tops"
                  style={{ width: '100%', height: '100%' }}
                />
              </div>
              <Text variant="headingMd" as="h3">Tops</Text>
            </Box>
          </Button>
        </Card>
      </Grid.Cell>
      <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3 }}>
        <Card sectioned>
          <Button fullWidth onClick={() => handleCategorySelect('bottoms')}>
            <Box padding="4" alignment="center">
              <div style={{ width: '70px', height: '70px', marginBottom: '8px', color: 'var(--p-icon)' }}>
                <img
                  src={`${window.location.origin}/images/categories/bottoms.svg`}
                  alt="Bottoms"
                  style={{ width: '100%', height: '100%' }}
                />
              </div>
              <Text variant="headingMd" as="h3">Bottoms</Text>
            </Box>
          </Button>
        </Card>
      </Grid.Cell>
      <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3 }}>
        <Card sectioned>
          <Button fullWidth onClick={() => handleCategorySelect('dresses')}>
            <Box padding="4" alignment="center">
              <div style={{ width: '70px', height: '70px', marginBottom: '8px', color: 'var(--p-icon)' }}>
                <img
                  src={`${window.location.origin}/images/categories/dress.svg`}
                  alt="Dresses"
                  style={{ width: '100%', height: '100%' }}
                />
              </div>
              <Text variant="headingMd" as="h3">Dresses</Text>
            </Box>
          </Button>
        </Card>
      </Grid.Cell>
      <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3 }}>
        <Card sectioned>
          <Button fullWidth onClick={() => handleCategorySelect('Bikini Tops / Bras')}>
            <Box padding="4" alignment="center">
              <div style={{ width: '70px', height: '70px', marginBottom: '8px', color: 'var(--p-icon)' }}>
                <img
                  src={`${window.location.origin}/images/categories/bikini.svg`}
                  alt="Bikini Tops / Bras"
                  style={{ width: '100%', height: '100%' }}
                />
              </div>
              <Text variant="headingMd" as="h3">Bikini Tops / Bras</Text>
            </Box>
          </Button>
        </Card>
      </Grid.Cell>
    </Grid>
  );

  const renderFitTypeSelection = () => (
    <>
      <TextField
        label="Chart Name"
        value={chartName}
        onChange={setChartName}
        autoComplete="off"
        helpText="Give your size chart a descriptive name"
      />
      <Box paddingBlockStart="4">
        <Text variant="headingMd" as="h3">Select Fit Type</Text>
        <ButtonGroup fullWidth>
          <Button onClick={() => handleFitTypeSelect('slim')}>Slim Fit</Button>
          <Button onClick={() => handleFitTypeSelect('regular')}>Regular Fit</Button>
          <Button onClick={() => handleFitTypeSelect('loose')}>Loose Fit</Button>
        </ButtonGroup>
      </Box>
    </>
  );

  const handleMeasurementChange = (sizeIndex, field, value) => {
    const updatedSizeChart = { ...currentSizeChart };
    const updatedSizes = [...updatedSizeChart.sizes];
    updatedSizes[sizeIndex] = { ...updatedSizes[sizeIndex], [field]: value };
    
    // Automatically calculate score for tops when height or weight changes
    if (selectedCategory === 'tops' && (field === 'height' || field === 'weight')) {
      const size = updatedSizes[sizeIndex];
      if (size.height && size.weight) {
        // Calculate the score based on height and weight
        const scoreRange = calculateScoreRange(size.height, size.weight, selectedFitType);
        if (scoreRange) {
          updatedSizes[sizeIndex].score = scoreRange;
        }
      }
    }
    
    updatedSizeChart.sizes = updatedSizes;
    setCurrentSizeChart(updatedSizeChart);
  };

  const renderMeasurementSlider = (sizeIndex, field, value, label, min, max, step = 1) => {
    const parseValue = (val) => {
      if (!val) return field === 'cup_size' ? min : [min, min + (max - min) / 4];
      
      if (field === 'cup_size') {
        const cupSizes = ['A', 'B', 'C', 'D', 'DD/E', 'DDD/F', 'G', 'H'];
        return cupSizes.indexOf(val);
      }
      
      if (typeof val === 'string') {
        if (field === 'height') {
          const parts = val.split('-');
          let startValue, endValue;
          
          // Try to parse as feet'inches" format first
          const feetInchesRegex = /(\d+)'(\d+)"/;
          const startMatch = parts[0].trim().match(feetInchesRegex);
          
          if (startMatch) {
            // Convert feet and inches to total inches
            startValue = (parseInt(startMatch[1]) * 12) + parseInt(startMatch[2]);
          } else {
            // If not in feet'inches" format, try parsing as plain number
            startValue = parseInt(parts[0].trim()) || min;
          }
          
          if (parts.length > 1) {
            const endMatch = parts[1].trim().match(feetInchesRegex);
            if (endMatch) {
              endValue = (parseInt(endMatch[1]) * 12) + parseInt(endMatch[2]);
            } else {
              endValue = parseInt(parts[1].trim()) || (startValue + 3);
            }
          } else {
            endValue = startValue + 3;
          }
          
          return [startValue, endValue];
        }
        
        if (field === 'weight') {
          const parts = val.split('-');
          const start = parseInt(parts[0].replace(/\s?lbs?/g, '').trim(), 10);
          
          if (parts.length > 1) {
            const end = parseInt(parts[1].replace(/\s?lbs?/g, '').trim(), 10);
            return [start, end];
          }
          return [start, start + 15];
        }
        
        const [start, end] = val.split('-').map(v => parseFloat(v));
        if (!isNaN(start) && !isNaN(end)) return [start, end];
        
        const numVal = parseFloat(val);
        if (!isNaN(numVal)) {
          if (field === 'waist') return [numVal, numVal + 2];
          if (field === 'dress_size') return [numVal, numVal + 2];
          return [numVal, numVal + (max - min) / 8];
        }
      }
      return field === 'cup_size' ? min : [min, min + (max - min) / 4];
    };

    const value_parsed = parseValue(value);
    const isCupSize = field === 'cup_size';
    const currentValue = isCupSize ? value_parsed : value_parsed[0];
    const endValue = isCupSize ? value_parsed : value_parsed[1];

    const formatDisplayValue = (val) => {
      if (field === 'height') {
        const feet = Math.floor(val / 12);
        const inches = Math.round(val % 12);
        return `${feet}'${inches}"`;
      }
      if (field === 'cup_size') {
        const cupSizes = ['A', 'B', 'C', 'D', 'DD/E', 'DDD/F', 'G', 'H'];
        return cupSizes[Math.round(val)];
      }
      return field === 'weight' ? `${val} lbs`
        : field === 'dress_size' ? val.toString()
        : `${val}"`;
    };

    const handleChange = (newValue) => {
      let formattedValue;
      
      if (field === 'cup_size') {
        const cupSizes = ['A', 'B', 'C', 'D', 'DD/E', 'DDD/F', 'G', 'H'];
        formattedValue = cupSizes[Math.round(newValue)];
      } else {
        if (!Array.isArray(newValue)) {
          newValue = [newValue, newValue];
        }
        
        if (field === 'height') {
          // Convert start value to feet and inches
          const startFeet = Math.floor(newValue[0] / 12);
          const startInches = Math.round(newValue[0] % 12);
          
          // Convert end value to feet and inches
          const endFeet = Math.floor(newValue[1] / 12);
          const endInches = Math.round(newValue[1] % 12);
          
          // Format as feet'inches" - feet'inches"
          formattedValue = `${startFeet}'${startInches}"-${endFeet}'${endInches}"`;
        } else if (field === 'weight') {
          const start = Math.round(newValue[0] / 5) * 5;
          const end = Math.round(newValue[1] / 5) * 5;
          formattedValue = `${start}-${end}`;
        } else {
          formattedValue = `${newValue[0]}-${newValue[1]}`;
        }
      }
      
      handleMeasurementChange(sizeIndex, field, formattedValue);
    };

    return (
      <Box padding="2" background="bg-surface-secondary" borderRadius="2">
        <LegacyStack vertical spacing="2" distribution="fill">
          {/* Current value display - updated styling to match customer widget */}
          <div style={{ 
            display: 'flex', 
            justifyContent: 'center', 
            marginBottom: '12px' 
          }}>
            <div style={{ 
              background: '#f1f8fe',
              padding: '6px 16px', 
              borderRadius: '8px',
              fontSize: '15px',
              fontWeight: '600',
              color: '#4A90E2',
              minWidth: '120px',
              textAlign: 'center',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
            }}>
              {isCupSize ? formatDisplayValue(currentValue) : `${formatDisplayValue(currentValue)} - ${formatDisplayValue(endValue)}`}
            </div>
          </div>

          {/* Label - updated styling */}
          <Text variant="bodyMd" as="h3" alignment="center" style={{
            fontWeight: '500',
            color: '#333',
            fontSize: '15px',
            marginBottom: '8px'
          }}>{label}</Text>

          {/* Min-Max labels - updated styling */}
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between',
            padding: '0 4px',
            marginBottom: '8px',
            width: '100%'
          }}>
            <div style={{
              color: '#666',
              fontSize: '12px'
            }}>
              <Text variant="bodySm">{formatDisplayValue(min)}</Text>
            </div>
            <div style={{
              color: '#666',
              fontSize: '12px'
            }}>
              <Text variant="bodySm">{formatDisplayValue(max)}</Text>
            </div>
          </div>

          {/* Slider Container - updated styling */}
          <div style={{ 
            background: '#f9f9f9',
            padding: '8px 12px',
            borderRadius: '8px',
            border: '1px solid #e0e0e0',
            width: '100%',
            boxSizing: 'border-box'
          }}>
            <RangeSlider
              label={label}
              labelHidden
              value={isCupSize ? currentValue : [currentValue, endValue]}
              min={min}
              max={max}
              step={field === 'weight' ? 5 : 1}
              output={false}
              onChange={handleChange}
              allowOverlap={false}
            />
          </div>
        </LegacyStack>
      </Box>
    );
  };

  const renderSizeChart = () => {
    if (!currentSizeChart) return null;

    const rows = currentSizeChart.sizes.map((size, sizeIndex) => {
      let measurementRows = [];
      
      if (selectedCategory === 'tops') {
        const scoreValue = size.score || 
          (size.height && size.weight ? calculateScoreRange(size.height, size.weight, selectedFitType) : '');
        
        measurementRows = [
          [
            <Box key={`height-${sizeIndex}`} width="50%" paddingInlineEnd="2">
              {renderMeasurementSlider(sizeIndex, 'height', size.height, 'Height', 60, 80)}
            </Box>,
            <Box key={`weight-${sizeIndex}`} width="50%" paddingInlineStart="2">
              {renderMeasurementSlider(sizeIndex, 'weight', size.weight, 'Weight (lbs)', 90, 300, 5)}
            </Box>
          ],
          [
            <Box key={`score-${sizeIndex}`} width="100%" paddingBlockStart="2">
              <div style={{
                background: '#f8f9fa',
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid #e0e0e0'
              }}>
                <Text as="p" style={{
                  fontWeight: '600',
                  color: '#2C3E50',
                  fontSize: '14px',
                  marginBottom: '4px'
                }}>
                  Calculated Score (height + weight): {scoreValue}
                </Text>
                <Text as="p" style={{
                  color: '#666',
                  fontSize: '12px'
                }}>
                  This score is automatically calculated based on the height and weight values
                </Text>
              </div>
            </Box>
          ]
        ];
      } else if (selectedCategory === 'bottoms') {
        measurementRows = [
          [
            <Box key={`waist-${sizeIndex}`} width="50%" paddingInlineEnd="2">
              {renderMeasurementSlider(sizeIndex, 'waist', size.waist, 'Waist (in)', 24, 48)}
            </Box>,
            <Box key={`hip-${sizeIndex}`} width="50%" paddingInlineStart="2">
              {renderMeasurementSlider(sizeIndex, 'hip', size.hip, 'Hip (in)', 32, 54)}
            </Box>
          ]
        ];
      } else if (selectedCategory === 'dresses') {
        measurementRows = [
          [
            <Box key={`bust-${sizeIndex}`} width="33%" paddingInlineEnd="2">
              {renderMeasurementSlider(sizeIndex, 'bust', size.bust, 'Bust (in)', 30, 50)}
            </Box>,
            <Box key={`waist-${sizeIndex}`} width="33%" paddingInlineStart="2" paddingInlineEnd="2">
              {renderMeasurementSlider(sizeIndex, 'waist', size.waist, 'Waist (in)', 24, 44)}
            </Box>,
            <Box key={`hip-${sizeIndex}`} width="33%" paddingInlineStart="2">
              {renderMeasurementSlider(sizeIndex, 'hip', size.hip, 'Hip (in)', 34, 54)}
            </Box>
          ]
        ];
      }
      
      return {
        size: size.size,
        measurements: measurementRows
      };
    });

    return (
      <div style={{ width: '100%' }}>
        <TextField
          label="Chart Name"
          value={chartName}
          onChange={setChartName}
          autoComplete="off"
        />
        <Box padding="4" style={{ overflowX: 'visible', width: '100%' }}>
          <div style={{ width: '100%', margin: '0 auto' }}>
            <LegacyCard>
              <Box paddingBlockStart="4" paddingInlineStart="4" paddingInlineEnd="4">
                <Text variant="bodyMd" as="p" style={{
                  color: '#666',
                  fontSize: '14px',
                  marginBottom: '16px'
                }}>
                  Drag the sliders to adjust measurements for each size:
                </Text>
                <Box paddingBlockStart="4">
                  {rows.map((sizeData, sizeIndex) => (
                    <div key={`size-section-${sizeIndex}`} style={{
                      background: '#ffffff',
                      border: '1px solid #e0e0e0',
                      borderRadius: '12px',
                      padding: '16px',
                      marginBottom: '20px',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                    }}>
                      <Box padding="2" style={{
                        marginBottom: '16px',
                        borderBottom: '1px solid #f0f0f0'
                      }}>
                        <Text variant="headingMd" as="h3" style={{
                          fontWeight: '600',
                          color: '#2C3E50',
                          fontSize: '18px',
                          textAlign: 'center'
                        }}>
                          {sizeData.size}
                        </Text>
                      </Box>
                      
                      <div style={{ width: '100%' }}>
                        {sizeData.measurements.map((measurementRow, rowIndex) => (
                          <div key={`measurement-row-${sizeIndex}-${rowIndex}`} 
                               style={{ width: '100%', marginBottom: '16px', display: 'flex' }}>
                            {measurementRow}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </Box>
              </Box>
            </LegacyCard>
          </div>
        </Box>
        
        {/* Product selection section */}
        <Box padding="4">
          <LegacyCard>
            <LegacyCard.Section>
              <Box paddingBlockStart="2" paddingBlockEnd="2">
                <LegacyStack distribution="equalSpacing" alignment="center">
                  <Text variant="headingMd" as="h3">Selected Products</Text>
                  <Button onClick={() => setIsProductPickerOpen(true)}>
                    {selectedProducts.length > 0 ? 'Edit Products' : 'Select Products'}
                  </Button>
                </LegacyStack>
              </Box>
            </LegacyCard.Section>
            <LegacyCard.Section>
              {renderSelectedProducts()}
            </LegacyCard.Section>
          </LegacyCard>
        </Box>
      </div>
    );
  };

  const renderSelectedProducts = () => {
    if (!selectedProducts || selectedProducts.length === 0) {
      return (
        <Banner status="info">
          <p>No products selected. Please select products to associate with this size chart.</p>
        </Banner>
      );
    }

    console.log('Rendering selected products:', selectedProducts);
    
    // Default image that we know works
    const defaultImage = 'https://cdn.shopify.com/s/files/1/0685/6065/0425/files/sizebuddy_app_pic.png?v=1740975922';
    
    return (
      <LegacyStack>
        <div style={{ width: '100%' }}>
          <LegacyStack vertical>
            {selectedProducts.map((item, index) => {
              console.log(`Product ${index}:`, item.title, 'Image URL:', item.image);
              
              return (
                <LegacyStack alignment="center" key={index} distribution="fillEvenly">
                  <div style={{ 
                    width: '50px', 
                    height: '50px', 
                    overflow: 'hidden', 
                    marginRight: '10px', 
                    position: 'relative', 
                    border: '1px solid rgba(0,0,0,0.1)', 
                    borderRadius: '4px',
                    background: '#f4f6f8'
                  }}>
                    <img
                      src={item.image || defaultImage}
                      alt={item.title}
                      style={{ 
                        width: '100%', 
                        height: '100%', 
                        objectFit: 'cover'
                      }}
                      onError={(e) => {
                        console.log(`Image error for ${item.title}, using default`);
                        e.target.src = defaultImage;
                      }}
                    />
                  </div>
                  <Text variant="bodyMd" fontWeight="bold">
                    {item.title}
                  </Text>
                </LegacyStack>
              );
            })}
          </LegacyStack>
        </div>
      </LegacyStack>
    );
  };

  const modalContent = () => {
    console.log('Rendering modal content, step:', step);
    return (
      <div style={{ 
        width: '100%', 
        maxWidth: '100%', 
        margin: '0 auto', 
        overflowX: 'visible',
        boxSizing: 'border-box',
        padding: '0'
      }}>
        {step === 'category' && renderCategorySelection()}
        {step === 'details' && renderFitTypeSelection()}
        {step === 'chart' && renderSizeChart()}
        {step === 'products' && renderSelectedProducts()}
      </div>
    );
  };

  if (isLoading) {
    return (
      <Frame>
        <LegacyCard>
          <Box padding="4">
            <SkeletonBodyText lines={3} />
          </Box>
        </LegacyCard>
      </Frame>
    );
  }

  return (
    <>
      <Modal
        open={isModalOpen}
        onClose={handleModalClose}
        title="Create Size Chart"
        size="large"
        footer={
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            width: '100%', 
            padding: '16px',
            borderTop: '1px solid var(--p-divider)'
          }}>
            <div>
              {step !== 'category' && (
                <Button
                  onClick={() => {
                    console.log('Back button clicked, current step:', step);
                    if (step === 'details') setStep('category');
                    else if (step === 'chart') setStep('details');
                  }}
                >
                  Back
                </Button>
              )}
            </div>
            <div>
              {step === 'chart' && (
                <Button
                  primary
                  onClick={handleSave}
                  disabled={!chartName || selectedProducts.length === 0}
                >
                  Save Size Chart
                </Button>
              )}
            </div>
          </div>
        }
      >
        <Modal.Section>
          <div style={{ width: '100%', maxWidth: '900px', margin: '0 auto' }}>
            {modalContent()}
          </div>
        </Modal.Section>
      </Modal>

      <ResourcePicker
        resourceType="Product"
        open={isProductPickerOpen}
        onCancel={() => setIsProductPickerOpen(false)}
        onSelection={handleProductSelect}
        showVariants={false}
        initialSelectionIds={selectedProducts.map(p => ({ id: `gid://shopify/Product/${p.id}` }))}
      />

      {showToast && (
        <Toast
          content={toastProps.content}
          error={toastProps.error}
          onDismiss={() => setShowToast(false)}
        />
      )}

      <Layout>
        <Layout.Section>
          <LegacyCard>
            <Box padding="4">
              {sizeCharts.length === 0 ? (
                <EmptyState
                  heading="Create your first size chart"
                  action={{
                    content: 'Create Size Chart',
                    onAction: () => {
                      console.log('Create Size Chart clicked from EmptyState');
                      setIsModalOpen(true);
                    }
                  }}
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <p>Start by creating a size chart for your products.</p>
                </EmptyState>
              ) : (
                <>
                  <Box paddingBlockEnd="4">
                    <LegacyStack distribution="equalSpacing" alignment="center">
                      <Text variant="headingMd" as="h3">Your Size Charts</Text>
                      <Button primary onClick={() => {
                        console.log('Create Size Chart clicked from header');
                        setIsModalOpen(true);
                      }}>
                        Create Size Chart
                      </Button>
                    </LegacyStack>
                  </Box>
                  <ResourceList
                    items={sizeCharts}
                    renderItem={(item) => (
                      <ResourceItem id={item.id}>
                        <LegacyStack distribution="equalSpacing" alignment="center">
                          <LegacyStack vertical>
                            <Text variant="bodyMd" as="h3" fontWeight="bold">
                              {item.name}
                            </Text>
                            <LegacyStack>
                              <Badge status="info">{item.category}</Badge>
                              <Badge status="success">{item.fit_type} Fit</Badge>
                            </LegacyStack>
                          </LegacyStack>
                          <ButtonGroup>
                            <Button onClick={() => handleEdit(item)}>Edit</Button>
                            <Button destructive onClick={() => handleDelete(item.id)}>Delete</Button>
                          </ButtonGroup>
                        </LegacyStack>
                      </ResourceItem>
                    )}
                  />
                </>
              )}
            </Box>
          </LegacyCard>
        </Layout.Section>

        <Layout.Section secondary>
          <LegacyCard>
            <LegacyCard.Section>
              <Text variant="headingMd" as="h3">
                About Size Charts
              </Text>
              <Box paddingBlockStart="3">
                <Text as="p" variant="bodyMd">
                  Size charts help your customers find their perfect fit. Each chart is automatically generated based on the category
                  and fit type you select.
                </Text>
              </Box>
            </LegacyCard.Section>
            <LegacyCard.Section>
              <Text variant="headingMd" as="h3">
                How it works
              </Text>
              <Box paddingBlockStart="3">
                <LegacyStack vertical spacing="3">
                  <Text as="p" variant="bodyMd">
                    1. Choose a category (Tops, Bottoms, Dresses, or Bikinis)
                  </Text>
                  <Text as="p" variant="bodyMd">
                    2. Name your size chart
                  </Text>
                  <Text as="p" variant="bodyMd">
                    3. Select the fit type (Slim, Regular, or Loose)
                  </Text>
                  <Text as="p" variant="bodyMd">
                    4. Review and customize the measurements
                  </Text>
                </LegacyStack>
              </Box>
            </LegacyCard.Section>
          </LegacyCard>
        </Layout.Section>
      </Layout>

      {/* Add CSS to ensure modal content takes full width */}
      <style>
        {`
        .Polaris-Modal-Dialog__Modal {
          display: flex !important;
          flex-direction: column !important;
          max-width: 95vw !important;
          width: 1000px !important;
        }
        .Polaris-Modal__BodyWrapper {
          flex: 1 1 auto !important;
          width: 100% !important;
          padding: 0 !important;
        }
        .Polaris-Modal__Body {
          width: 100% !important;
          padding: 0 !important;
        }
        .Polaris-Modal-Section {
          width: 100% !important;
          padding: 0 !important;
        }
        .Polaris-Box {
          max-width: 100%;
          width: 100%;
        }
        .Polaris-LegacyCard {
          width: 100%;
          margin: 0;
          box-shadow: none;
          padding: 0;
        }
        .Polaris-RangeSlider {
          width: 100%;
        }
        .Polaris-RangeSlider-SingleThumb {
          width: 100%;
        }
        .Polaris-RangeSlider__Backdrop {
          width: 100% !important;
        }
        .Polaris-TextField {
          max-width: 100%;
          width: 100%;
        }
        .Polaris-LegacyStack {
          width: 100%;
        }
        .Polaris-Modal-CloseButton {
          margin-right: 16px;
        }
        /* Position Save button to the far right and Back button to the left */
        .Polaris-Modal-Footer {
          display: flex !important;
          flex-direction: row-reverse !important; /* This reverses the order of elements */
          padding: 16px !important;
          width: 100% !important;
        }
        /* Target both primary and secondary action buttons directly */
        .Polaris-Modal-Footer .Polaris-Button--primary {
          margin-left: 0 !important;
          margin-right: 16px !important;
          order: 1 !important;
          float: right !important;
        }
        .Polaris-Modal-Footer .Polaris-Button:not(.Polaris-Button--primary) {
          margin-right: auto !important;
          order: 2 !important;
          margin-left: 16px !important;
          float: left !important;
        }
        /* Clear all other positioning that might interfere */
        .Polaris-Modal-Footer div, 
        .Polaris-Modal-Footer section {
          display: contents !important;
        }
        /* Force the direct parent of the primary button to the right */
        .Polaris-Modal-Footer .Polaris-Modal-Footer__PrimaryButton,
        .Polaris-Modal-Footer .Polaris-Button-group--primary {
          margin-left: auto !important;
          display: flex !important;
          justify-content: flex-end !important;
        }
        /* Force the direct parent of the secondary button to the left */
        .Polaris-Modal-Footer .Polaris-Modal-Footer__SecondaryActions {
          margin-right: auto !important;
          display: flex !important;
          justify-content: flex-start !important;
        }
        /* Add CSS to optimize slider heights */
        .Polaris-RangeSlider-SingleThumb, .Polaris-RangeSlider-DualThumb {
          height: 24px !important;
        }
        .Polaris-RangeSlider__Output {
          margin-top: 0px !important;
        }
        .Polaris-RangeSlider__Input {
          height: 24px !important;
        }
        `}
      </style>
    </>
  );
} 