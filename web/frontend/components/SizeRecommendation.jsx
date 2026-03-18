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
import { useSizeBuddyFetch } from '../utils/useSizeBuddyFetch';
import { defaultSizeCharts } from '../templates/default-size-charts';
import { useNavigate } from 'react-router-dom';
import { useAppBridge } from '@shopify/app-bridge-react';
import { useTranslation } from 'react-i18next';

// Helper function to calculate score range for tops
function calculateScoreRange(height, weight, fitType) {
  if (!height || !weight) return null;
  
  // Parse height and weight ranges
  const heightRange = height.includes('-') 
    ? height.split('-').map(h => {
        // Handle feet'inches" format
        const match = h.trim().match(/(\d+)'(\d+)"/);
        if (match) {
          return parseInt(match[1]) * 12 + parseInt(match[2]);
        }
        return parseFloat(h);
      })
    : (() => {
        const match = height.match(/(\d+)'(\d+)"/);
        if (match) {
          const val = parseInt(match[1]) * 12 + parseInt(match[2]);
          return [val, val];
        }
        return [parseFloat(height), parseFloat(height)];
      })();
    
  const weightRange = weight.includes('-')
    ? weight.split('-').map(w => parseFloat(w.replace(/\s?lbs?/g, '').trim()))
    : [parseFloat(weight.replace(/\s?lbs?/g, '').trim()), parseFloat(weight.replace(/\s?lbs?/g, '').trim())];
    
  if (heightRange.some(isNaN) || weightRange.some(isNaN)) return null;
  
  // Get minimum and maximum scores
  const minScore = heightRange[0] + weightRange[0];
  const maxScore = heightRange[1] + weightRange[1];
  
  // Apply fit type adjustments
  let adjustedMinScore = minScore;
  let adjustedMaxScore = maxScore;
  
  if (fitType === 'slim') {
    adjustedMinScore = minScore - 10;
    adjustedMaxScore = maxScore - 10;
  } else if (fitType === 'loose') {
    adjustedMinScore = minScore + 10;
    adjustedMaxScore = maxScore + 10;
  }
  
  return `${Math.round(adjustedMinScore)}-${Math.round(adjustedMaxScore)}`;
}

const DEFAULT_SIZE_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];

function normalizeChartSizes(sizes = []) {
  if (!Array.isArray(sizes)) return [];

  return sizes.map((size) => ({
    ...size,
    name: size.name || size.size,
    size: size.size || size.name,
    enabled: size.enabled !== false,
  }));
}

function mergeChartSizesWithDefaults(category, fitType, sizes = []) {
  const normalizedSizes = normalizeChartSizes(sizes);
  const defaultChart = defaultSizeCharts?.[category]?.[fitType];

  if (!defaultChart?.sizes?.length) {
    return normalizedSizes;
  }

  const sizeMap = new Map(normalizedSizes.map((size) => [size.size || size.name, size]));

  normalizeChartSizes(defaultChart.sizes).forEach((defaultSize) => {
    const sizeKey = defaultSize.size || defaultSize.name;
    if (!sizeMap.has(sizeKey)) {
      sizeMap.set(sizeKey, defaultSize);
    }
  });

  const mergedSizes = Array.from(sizeMap.values());

  return mergedSizes.sort((a, b) => {
    const aSize = a.size || a.name;
    const bSize = b.size || b.name;
    const aIndex = DEFAULT_SIZE_ORDER.indexOf(aSize);
    const bIndex = DEFAULT_SIZE_ORDER.indexOf(bSize);

    if (aIndex === -1 && bIndex === -1) return String(aSize).localeCompare(String(bSize));
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });
}

export function SizeRecommendation({ shop, host }) {
  const navigate = useNavigate();
  const app = useAppBridge();
  const { t } = useTranslation();
  const fetch = useSizeBuddyFetch();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [step, setStep] = useState('category'); // 'category', 'details', 'chart'
  const [chartName, setChartName] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedFitType, setSelectedFitType] = useState('');
  const [sizeRecommendations, setSizeRecommendations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [toastProps, setToastProps] = useState({ content: '', error: false });
  const [showToast, setShowToast] = useState(false);
  const [currentSizeRecommendation, setCurrentSizeRecommendation] = useState(null);
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [isResourcePickerOpen, setIsResourcePickerOpen] = useState(false);
  const isMounted = useRef(true);
  const customChartImageInputRef = useRef(null);
  const [editingRecommendationId, setEditingRecommendationId] = useState(null);
  const [limitBanner, setLimitBanner] = useState(false);
  const [customSizeChartImage, setCustomSizeChartImage] = useState('');
  const [customSizeChartImageName, setCustomSizeChartImageName] = useState('');

  const fullShopDomain = useMemo(() => {
    if (!shop) return '';
    return shop.includes('.myshopify.com') ? shop : `${shop}.myshopify.com`;
  }, [shop]);

  const isRecommendationLocked = useCallback((recommendation) => {
    const lockedValue = recommendation?.locked;
    return Boolean(lockedValue && lockedValue !== 0 && lockedValue !== '0' && lockedValue !== false);
  }, []);

  const lockedRecommendations = useMemo(
    () => sizeRecommendations.filter((recommendation) => isRecommendationLocked(recommendation)),
    [isRecommendationLocked, sizeRecommendations]
  );

  const navigateToPlans = useCallback(() => {
    if (!fullShopDomain || !host) {
      navigate('/plans');
      return;
    }

    navigate(`/plans?shop=${encodeURIComponent(fullShopDomain)}&host=${encodeURIComponent(host)}`);
  }, [fullShopDomain, host, navigate]);

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

  const resetCustomSizeChartImage = useCallback(() => {
    setCustomSizeChartImage('');
    setCustomSizeChartImageName('');
    if (customChartImageInputRef.current) {
      customChartImageInputRef.current.value = '';
    }
  }, []);

  const handleCustomSizeChartImageUpload = useCallback((event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setToastProps({
        content: 'Please upload an image file.',
        error: true
      });
      setShowToast(true);
      if (customChartImageInputRef.current) {
        customChartImageInputRef.current.value = '';
      }
      return;
    }

    if (file.size > 4 * 1024 * 1024) {
      setToastProps({
        content: 'Please upload an image smaller than 4MB.',
        error: true
      });
      setShowToast(true);
      if (customChartImageInputRef.current) {
        customChartImageInputRef.current.value = '';
      }
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        setToastProps({
          content: 'Could not read that image. Please try another file.',
          error: true
        });
        setShowToast(true);
        return;
      }

      setCustomSizeChartImage(reader.result);
      setCustomSizeChartImageName(file.name);
    };
    reader.onerror = () => {
      setToastProps({
        content: 'Could not read that image. Please try again.',
        error: true
      });
      setShowToast(true);
    };
    reader.readAsDataURL(file);
  }, []);

  // Fetch existing size charts
  const fetchSizeRecommendations = useCallback(async () => {
    if (!fullShopDomain) return;

    setIsLoading(true);
    try {
      console.log(`Fetching size recommendations for shop: ${fullShopDomain}`);
      
      // Include shop parameter in URL
      const response = await fetch(`/api/size-recommendations?shop=${fullShopDomain}`);
      
      console.log('API response:', {
        status: response.status,
        ok: response.ok,
        redirected: response.redirected,
        url: response.url
      });
      
      if (!response.ok) {
        if (response.status === 403) {
          setLimitBanner(true);
          return;
        }
        const errorText = await response.text();
        console.error('Error response:', errorText);
        throw new Error(`Server returned ${response.status}: ${errorText}`);
      }
      
      const data = await response.json();
      console.log('Received data:', data);
      if (isMounted.current) setSizeRecommendations(data);
    } catch (error) {
      console.error('Error fetching size recommendations:', error);
      setToastProps({
        content: `Failed to load size recommendations: ${error.message}`,
        error: true
      });
      setShowToast(true);
    } finally {
      if (isMounted.current) setIsLoading(false);
    }
  }, [fetch, fullShopDomain]);

  useEffect(() => {
    fetchSizeRecommendations();
    return () => {
      isMounted.current = false;
    };
  }, [fetchSizeRecommendations]);

  const handleModalOpen = () => {
    console.log('Opening modal');
    setIsModalOpen(true);
    setEditingRecommendationId(null);
    setStep('category');
    setSelectedCategory('');
    setSelectedFitType('');
    setChartName('');
    setSelectedProducts([]);
    setCurrentSizeRecommendation(null);
    resetCustomSizeChartImage();
    console.log('Modal state reset');
  };

  const handleModalClose = () => {
    console.log('Closing modal');
    setIsModalOpen(false);
    setEditingRecommendationId(null);
    setStep('category');
    setSelectedCategory('');
    setSelectedFitType('');
    setChartName('');
    setSelectedProducts([]);
    setCurrentSizeRecommendation(null);
    resetCustomSizeChartImage();
    console.log('Modal state reset');
  };

  const handleCategorySelect = (category) => {
    console.log('Category selected:', category);
    setSelectedCategory(category);
    if (category !== 'Bikini Tops / Bras') {
      console.log('Moving to details step');
      setStep('details');
    } else {
      console.log('Moving to details step');
      setStep('details');
    }
  };

  const handleProductSelect = useCallback(async ({ selection }) => {
    // Log the selection to understand its structure
    console.log('Product Selection:', selection);
    
    // Format selected products and fetch actual images from Shopify
    const formattedProducts = await Promise.all(selection.map(async (product) => {
      const productId = product.id.replace('gid://shopify/Product/', ''); // Extract numeric ID
      
      // Try to get image from the selection first
      let imageUrl = null;
      
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
      
      // If we don't have a valid image URL, try to fetch it from Shopify
      if (!imageUrl || imageUrl.includes('unsplash') || imageUrl.includes('sizebuddy_app_pic.png')) {
        try {
          console.log(`Fetching actual image for product ${productId} from Shopify...`);
          
          // Use the authenticated fetch to get product details from Shopify Admin API
          const response = await fetch(`/admin/api/2024-01/products/${productId}.json`, {
            headers: {
              'Content-Type': 'application/json',
            }
          });
          
          if (response.ok) {
            const data = await response.json();
            if (data.product?.image?.src) {
              imageUrl = data.product.image.src;
              console.log(`Successfully fetched image for ${product.title}: ${imageUrl}`);
            } else {
              console.log(`No image found for ${product.title} in Shopify`);
            }
          } else {
            console.log(`Failed to fetch image for ${product.title}: ${response.status}`);
          }
        } catch (error) {
          console.error(`Error fetching image for ${product.title}:`, error);
        }
      } else {
        console.log(`Using existing image for ${product.title}: ${imageUrl}`);
      }
      
      return {
        id: productId,
        title: product.title,
        handle: product.handle,
        image: imageUrl
      };
    }));
    
    console.log('Formatted Products with actual images:', formattedProducts);
    setSelectedProducts(formattedProducts);
    setIsResourcePickerOpen(false);
    setStep('chart');
  }, [shop, host]);

  const handleFitTypeSelect = (fitType) => {
    setSelectedFitType(fitType);
    
    // Get default chart based on selections
    let defaultChart;
    
    console.log('Selecting fit type:', {
      category: selectedCategory,
      fitType
    });
    
    try {
      if (selectedCategory === 'Bikini Tops / Bras') {
        defaultChart = defaultSizeCharts[selectedCategory][fitType];
        console.log('Selected regular chart:', defaultChart);
      } else {
        defaultChart = defaultSizeCharts[selectedCategory][fitType];
        console.log('Selected regular chart:', defaultChart);
      }
      
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
        sizes: normalizeChartSizes(defaultChart.sizes).map(size => {
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
          
          if (size.hip) {
            formattedSize.hip = size.hip.includes('-') ? size.hip : `${size.hip}-${size.hip}`;
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
      
      setCurrentSizeRecommendation(formattedChart);
      setIsResourcePickerOpen(true);
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

    if (isRecommendationLocked(chart)) {
      setToastProps({
        content: 'This size recommendation is locked on your current plan. Upgrade to edit it again.',
        error: true
      });
      setShowToast(true);
      return;
    }
    
    setEditingRecommendationId(chart.id);
    setChartName(chart.name);
    setCustomSizeChartImage(chart.custom_size_chart_image || '');
    setCustomSizeChartImageName(chart.custom_size_chart_image ? 'Current uploaded image' : '');
    // Map DB categories to UI labels
    const uiCategory = chart.category === 'bikinis' ? 'Bikini Tops / Bras' : chart.category;
    setSelectedCategory(uiCategory);
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
      // Ensure optional_measurements exists for UI toggles
      if (!parsedChartData.optional_measurements) {
        parsedChartData.optional_measurements = {};
      }
      parsedChartData.sizes = mergeChartSizesWithDefaults(uiCategory, chart.fit_type, parsedChartData.sizes);
      setCurrentSizeRecommendation(parsedChartData);
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

  const handleSave = async () => {
    try {
      console.log('Save triggered - complete validation state:', {
        chartName,
        hasChartName: !!chartName,
        selectedCategory,
        hasSelectedCategory: !!selectedCategory,
        selectedFitType,
        hasSelectedFitType: !!selectedFitType,
        currentSizeRecommendation: currentSizeRecommendation, 
        hasCurrentSizeRecommendation: !!currentSizeRecommendation,
        selectedProducts,
        selectedProductsLength: selectedProducts.length
      });
      
      if (!chartName || !selectedCategory || !selectedFitType || !currentSizeRecommendation || selectedProducts.length === 0) {
        console.log('Validation failed, missing required fields:', {
          chartName: !!chartName,
          selectedCategory: !!selectedCategory,
          selectedFitType: !!selectedFitType, 
          currentSizeRecommendation: !!currentSizeRecommendation,
          selectedProducts: selectedProducts.length > 0
        });
        
        setToastProps({
          content: 'Please fill in all required fields and select at least one product',
          error: true
        });
        setShowToast(true);
        return;
      }

      // Deep clone the current size recommendation to avoid reference issues
      const processedSizeRecommendation = JSON.parse(JSON.stringify(currentSizeRecommendation));

      const enabledSizeCount = Array.isArray(processedSizeRecommendation?.sizes)
        ? processedSizeRecommendation.sizes.filter((size) => size.enabled !== false).length
        : 0;

      if (enabledSizeCount === 0) {
        setToastProps({
          content: 'Please keep at least one size enabled.',
          error: true
        });
        setShowToast(true);
        return;
      }
      
      // Ensure all cup_size values are properly formatted as strings
      if (processedSizeRecommendation && processedSizeRecommendation.sizes) {
        processedSizeRecommendation.sizes = processedSizeRecommendation.sizes.map(size => {
          const newSize = { ...size };
          
          // Ensure cup_size is a properly formatted string
          if (newSize.cup_size !== undefined) {
            // If it's not already a string or it doesn't include a dash, format it
            if (typeof newSize.cup_size !== 'string' || !newSize.cup_size.includes('-')) {
              const cupSizes = ['A', 'B', 'C', 'D', 'DD', 'DDD', 'F', 'G', 'H+'];
              
              // Handle case where it might be an object or array
              let cupIndex = 0;
              if (Array.isArray(newSize.cup_size) && newSize.cup_size.length > 0) {
                cupIndex = Math.round(newSize.cup_size[0]);
              } else if (typeof newSize.cup_size === 'number') {
                cupIndex = Math.round(newSize.cup_size);
              } else if (typeof newSize.cup_size === 'string' && !isNaN(parseInt(newSize.cup_size))) {
                cupIndex = parseInt(newSize.cup_size);
              }
              
              // Ensure index is within bounds
              cupIndex = Math.max(0, Math.min(cupIndex, cupSizes.length - 2));
              const nextIndex = Math.min(cupIndex + 1, cupSizes.length - 1);
              
              // Format as "A-B" string
              newSize.cup_size = `${cupSizes[cupIndex]}-${cupSizes[nextIndex]}`;
              console.log(`Formatted cup_size from ${size.cup_size} to ${newSize.cup_size}`);
            }
          }
          
          return newSize;
        });
      }

      // Debug product images before saving
      console.log('=== PRODUCTS BEFORE SAVING ===');
      debugProductImages(selectedProducts);

      // *** CRITICAL FIX: Calculate scores for all sizes before saving (for tops) ***
      if ((selectedCategory === 'tops' || selectedCategory === 'Tops') && processedSizeRecommendation.sizes) {
        processedSizeRecommendation.sizes = processedSizeRecommendation.sizes.map(size => {
          const updatedSize = { ...size };
          // Calculate score if height and weight are present but score is missing
          if (updatedSize.height && updatedSize.weight && !updatedSize.score) {
            const scoreRange = calculateScoreRange(updatedSize.height, updatedSize.weight, selectedFitType);
            if (scoreRange) {
              updatedSize.score = scoreRange;
              console.log(`Calculated score for size ${updatedSize.size || updatedSize.name}: ${scoreRange}`);
            }
          }
          return updatedSize;
        });
      }

      const requestData = {
        shop: fullShopDomain,
        chart_name: chartName,
        // Map display category to DB-safe value
        category: selectedCategory === 'Bikini Tops / Bras' ? 'bikinis' : selectedCategory,
        fit_type: selectedFitType,
        custom_size_chart_image: customSizeChartImage || null,
        chart_data: processedSizeRecommendation, // Use the processed data
        products: selectedProducts.map(product => ({
          id: product.id,
          title: product.title,
          handle: product.handle,
          image: product.image
        }))
      };

      // Log the data being sent
      console.log('Sending data:', {
        ...requestData,
        custom_size_chart_image: requestData.custom_size_chart_image ? '[uploaded image]' : null
      });

      const url = editingRecommendationId 
        ? `/api/size-recommendations/${editingRecommendationId}?shop=${fullShopDomain}` 
        : '/api/size-recommendations';

      const method = editingRecommendationId ? 'PUT' : 'POST';

      console.log(`Making ${method} request to ${url}`);
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch (e) {
          console.error('Response was not JSON:', errorText);
          errorData = { error: errorText || 'Unknown error' };
        }
        throw new Error(errorData.error || `Failed to ${editingRecommendationId ? 'update' : 'create'} size recommendation`);
      }

      const responseData = await response.json();
      console.log('Save successful, response:', responseData);
      
      setToastProps({
        content: `Size recommendation ${editingRecommendationId ? 'updated' : 'created'} successfully`,
        error: false
      });
      setShowToast(true);
      setLimitBanner(false);
      handleModalClose();
      fetchSizeRecommendations();
    } catch (error) {
      console.error('Error saving size recommendation:', error);

      if (error.message.includes('Plan limit reached') || error.message.includes('locked on your current plan')) {
        await fetchSizeRecommendations();
        setLimitBanner(true);
      }

      setToastProps({
        content: `Error saving size recommendation: ${error.message}`,
        error: true
      });
      setShowToast(true);
    }
  };

  const handleDelete = async (chartId) => {
    try {
      const response = await fetch(`/api/size-recommendations/${chartId}?shop=${fullShopDomain}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete size recommendation');
      }

      setToastProps({
        content: 'Size recommendation deleted successfully',
        error: false
      });
      setShowToast(true);
      setLimitBanner(false);
      fetchSizeRecommendations();
    } catch (error) {
      console.error('Error deleting size recommendation:', error);
      setToastProps({
        content: `Error deleting size recommendation: ${error.message}`,
        error: true
      });
      setShowToast(true);
    }
  };

  const renderCategorySelection = () => {
    const categoryOptions = [
      {
        value: 'tops',
        title: 'Tops',
        subtitle: 'Height and weight',
      },
      {
        value: 'bottoms',
        title: 'Bottoms',
        subtitle: 'Waist and hips',
      },
      {
        value: 'dresses',
        title: 'Dresses',
        subtitle: 'Dress size',
      },
      {
        value: 'Bikini Tops / Bras',
        title: 'Bikini Tops / Bras',
        subtitle: 'Band size and cup size',
      },
      {
        value: 'onepieces',
        title: 'One Pieces',
        subtitle: 'Hips and cup size',
      },
    ];

    return (
      <div>
        <div style={{ marginBottom: '20px' }}>
          <Text variant="headingMd" as="h3">
            Choose a product category
          </Text>
          <Box paddingBlockStart="1">
            <Text variant="bodyMd" as="p" color="subdued">
              Start by picking the type of product you want to build a size recommendation for.
            </Text>
          </Box>
        </div>

        <div className="SizeBuddy-CategoryGrid">
          {categoryOptions.map((category) => (
            <button
              key={category.value}
              type="button"
              className="SizeBuddy-CategoryCard"
              onClick={() => handleCategorySelect(category.value)}
            >
              <div className="SizeBuddy-CategoryCard__Accent" />
              <Text variant="headingMd" as="h3">
                {category.title}
              </Text>
              <Text variant="bodySm" as="p" color="subdued">
                {category.subtitle}
              </Text>
            </button>
          ))}
        </div>
      </div>
    );
  };

  const renderFitTypeSelection = () => (
    <>
      <TextField
        label="Chart Name"
        value={chartName}
        onChange={setChartName}
        autoComplete="off"
        helpText="Give your size recommendation a descriptive name"
      />
      <Box paddingBlockStart="4">
        <Text variant="headingMd" as="h3">Select Fit Type</Text>
        <Box paddingBlockStart="2">
          <LegacyStack vertical spacing="3">
            <Button 
              fullWidth 
              onClick={() => handleFitTypeSelect('slim')}
              textAlign="left"
            >
              <LegacyStack vertical spacing="1">
                <Text variant="bodyMd" fontWeight="semibold">Small Fit</Text>
                <Text variant="bodySm" color="subdued">Recommends sizing up from standard (runs small)</Text>
              </LegacyStack>
            </Button>
            <Button 
              fullWidth 
              onClick={() => handleFitTypeSelect('regular')}
              textAlign="left"
            >
              <LegacyStack vertical spacing="1">
                <Text variant="bodyMd" fontWeight="semibold">Standard Fit</Text>
                <Text variant="bodySm" color="subdued">Recommends true to size</Text>
              </LegacyStack>
            </Button>
            <Button 
              fullWidth 
              onClick={() => handleFitTypeSelect('loose')}
              textAlign="left"
            >
              <LegacyStack vertical spacing="1">
                <Text variant="bodyMd" fontWeight="semibold">Large Fit</Text>
                <Text variant="bodySm" color="subdued">Recommends sizing down from standard (runs large)</Text>
              </LegacyStack>
            </Button>
          </LegacyStack>
        </Box>
      </Box>
    </>
  );

  const renderSizeRecommendation = () => {
    if (!currentSizeRecommendation) return null;

    const handleMeasurementChange = (sizeIndex, field, value) => {
      const updatedSizeRecommendation = {
        ...currentSizeRecommendation,
        sizes: currentSizeRecommendation.sizes.map((size, index) => {
          if (index === sizeIndex) {
            const updatedSize = { ...size };
            
            // Update the field with the new value
            updatedSize[field] = value;
            
            // For bikini tops, combine band size and cup size
            if (selectedCategory === 'Bikini Tops / Bras') {
              if (field === 'band_size' || field === 'cup_size') {
                const bandSize = field === 'band_size' ? value : size.band_size;
                const cupSize = field === 'cup_size' ? value : size.cup_size;
                if (bandSize && cupSize) {
                  // Format relative size using the ranges
                  const [bandStart] = bandSize.split('-');
                  const [cupStart] = cupSize.split('-');
                  updatedSize.relative_size = `${bandStart}${cupStart}`;
                }
              }
            }
            return updatedSize;
          }
          return size;
        })
      };
      console.log('Updating measurement:', { field, value, updatedSizeRecommendation });
      setCurrentSizeRecommendation(updatedSizeRecommendation);
    };

    const handleSizeEnabledToggle = (sizeIndex, enabled) => {
      const updatedSizeRecommendation = {
        ...currentSizeRecommendation,
        sizes: currentSizeRecommendation.sizes.map((size, index) => (
          index === sizeIndex ? { ...size, enabled } : size
        ))
      };
      setCurrentSizeRecommendation(updatedSizeRecommendation);
    };

    const renderMeasurementSlider = (sizeIndex, field, value, label, min, max, step = 1) => {
      const cupSizes = ['A', 'B', 'C', 'D', 'DD', 'DDD', 'F', 'G', 'H+'];
      const isCupSize = field === 'cup_size';
      
      // Add toggle switch for optional measurements
      const isOptionalMeasurement = (field === 'hip' && selectedCategory === 'bottoms') || 
                                  (field === 'band_size' && selectedCategory === 'Bikini Tops / Bras');
      
      const toggleId = `toggle-${field}-${sizeIndex}`;
      
      const parseValue = (val) => {
        if (!val) return isCupSize ? [0, 1] : [min, min + (max - min) / 4];
        
        if (isCupSize) {
          if (typeof val === 'string') {
            // Split on '-' and trim whitespace; keep '+' (e.g., 'H+') intact
            const parts = val.split('-').map(p => p.trim());
            if (parts.length === 2) {
              const startIdx = cupSizes.indexOf(parts[0]);
              const endIdx = cupSizes.indexOf(parts[1]);
              if (startIdx >= 0 && endIdx >= 0) {
                return [startIdx, endIdx];
              }
            }
            // If we can't parse the range, just use the first part
            const cupIndex = cupSizes.indexOf(parts[0]);
            return cupIndex >= 0 ? [cupIndex, Math.min(cupIndex + 1, cupSizes.length - 1)] : [0, 1];
          }
          return Array.isArray(val) ? val : [0, 1];
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
            
            return [Math.max(startValue, min), Math.max(endValue, min)];
          }
          
          if (field === 'weight') {
            const parts = val.split('-');
            const start = parseInt(parts[0].replace(/\s?lbs?/g, '').trim(), 10);
            
            if (parts.length > 1) {
              const end = parseInt(parts[1].replace(/\s?lbs?/g, '').trim(), 10);
              return [Math.max(start, min), Math.max(end, min)];
            }
            return [Math.max(start, min), Math.max(start + 15, min)];
          }
          
          const [start, end] = val.split('-').map(v => parseFloat(v));
          if (!isNaN(start) && !isNaN(end)) return [Math.max(start, min), Math.max(end, min)];
          
          const numVal = parseFloat(val);
          if (!isNaN(numVal)) return [Math.max(numVal, min), Math.max(numVal + 2, min)];
        }
        return [min, min + (max - min) / 4];
      };

      const value_parsed = parseValue(value);
      const isCupSizeArray = isCupSize && Array.isArray(value_parsed) && value_parsed.length === 2;
      const currentValue = isCupSizeArray ? value_parsed[0] : (isCupSize ? 0 : value_parsed[0]);
      const endValue = isCupSizeArray ? value_parsed[1] : (isCupSize ? cupSizes.length - 1 : value_parsed[1]);
      const isSingleCup = isCupSize && currentValue === endValue;

      const formatDisplayValue = (val) => {
        if (field === 'height') {
          const feet = Math.floor(val / 12);
          const inches = Math.round(val % 12);
          return `${feet}'${inches}"`;
        }
        if (field === 'cup_size') {
          const index = Math.min(Math.max(Math.round(val), 0), cupSizes.length - 1);
          return cupSizes[index];
        }
        return field === 'weight' ? `${val} lbs`
          : field === 'dress_size' ? val.toString()
          : `${val}"`;
      };

      const handleCupSizeClick = (e) => {
        const sliderRect = e.currentTarget.getBoundingClientRect();
        const clickPosition = e.clientX - sliderRect.left;
        const percentage = clickPosition / sliderRect.width;
        const newIndex = Math.min(
          Math.max(Math.round(percentage * (cupSizes.length - 1)), 0), 
          cupSizes.length - 1
        );
        
        const selectedCup = cupSizes[newIndex];
        const nextIndex = Math.min(newIndex + 1, cupSizes.length - 1);
        const nextCup = cupSizes[nextIndex];
        handleMeasurementChange(sizeIndex, field, `${selectedCup}-${nextCup}`);
      };

      const handleChange = (newValue) => {
        if (isCupSize) {
          const index = Math.min(Math.max(Math.round(newValue), 0), cupSizes.length - 1);
          const selectedCup = cupSizes[index];
          const nextIndex = Math.min(index + 1, cupSizes.length - 1);
          const nextCup = cupSizes[nextIndex];
          handleMeasurementChange(sizeIndex, field, `${selectedCup}-${nextCup}`);
        } else if (field === 'height') {
          // Convert start value to feet and inches
          const startFeet = Math.floor(newValue[0] / 12);
          const startInches = Math.round(newValue[0] % 12);
          
          // Convert end value to feet and inches
          const endFeet = Math.floor(newValue[1] / 12);
          const endInches = Math.round(newValue[1] % 12);
          
          // Format as feet'inches" - feet'inches"
          handleMeasurementChange(sizeIndex, field, `${startFeet}'${startInches}"-${endFeet}'${endInches}"`);
        } else {
          const start = Math.round(newValue[0]);
          const end = Math.round(newValue[1]);
          handleMeasurementChange(sizeIndex, field, `${start}-${end}`);
        }
      };

      return (
        <Box padding="2" background="bg-surface-secondary" borderRadius="2">
          <LegacyStack vertical spacing="2">
            <div style={{ opacity: isOptionalMeasurement && currentSizeRecommendation.optional_measurements?.[field] ? 0.5 : 1 }}>
              <div style={{ 
                display: 'flex', 
                justifyContent: 'center', 
                marginBottom: '8px' 
              }}>
                <div style={{ 
                  background: 'linear-gradient(145deg, #ffffff, #f5f5f5)',
                  padding: '8px 24px', 
                  borderRadius: '20px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                  fontSize: '16px',
                  fontWeight: '600',
                  color: '#2C3E50',
                  border: '1px solid rgba(255,255,255,0.8)',
                  minWidth: '140px',
                  textAlign: 'center'
                }}>
                  {isCupSize 
                    ? (isSingleCup 
                        ? `${formatDisplayValue(currentValue)}` 
                        : `${formatDisplayValue(currentValue)} - ${formatDisplayValue(endValue)}`)
                    : `${formatDisplayValue(Math.max(currentValue, min))} - ${formatDisplayValue(Math.max(endValue, min))}`}
                </div>
              </div>

              <Text variant="headingSm" as="h3" alignment="center">{label}</Text>

              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between',
                padding: '0 4px',
                marginBottom: '6px'
              }}>
                <div style={{
                  background: 'white',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                  border: '1px solid rgba(0,0,0,0.05)'
                }}>
                  <Text variant="bodySm">{formatDisplayValue(min)}</Text>
                </div>
                <div style={{
                  background: 'white',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                  border: '1px solid rgba(0,0,0,0.05)'
                }}>
                  <Text variant="bodySm">{formatDisplayValue(max)}</Text>
                </div>
              </div>

              <div style={{ 
                background: 'white',
                padding: '8px 6px',
                borderRadius: '14px',
                boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.05)',
                border: '1px solid rgba(0,0,0,0.05)'
              }}>
                {isCupSize ? (
                  <div style={{ width: '100%', position: 'relative' }}>
                    {isSingleCup ? (
                      <RangeSlider
                        label={label}
                        labelHidden
                        value={currentValue}
                        min={0}
                        max={cupSizes.length - 1}
                        step={1}
                        output={false}
                        onChange={(index) => {
                          const idx = Math.min(Math.max(Math.round(index), 0), cupSizes.length - 1);
                          const cup = cupSizes[idx];
                          const cupSizeRange = `${cup}-${cup}`;
                          handleMeasurementChange(sizeIndex, field, cupSizeRange);
                        }}
                      />
                    ) : (
                      <RangeSlider
                        label={label}
                        labelHidden
                        value={[currentValue, endValue]}
                        min={0}
                        max={cupSizes.length - 1}
                        step={1}
                        output={false}
                        onChange={(values) => {
                          if (!Array.isArray(values) || values.length !== 2) return;
                          const startIndex = Math.min(Math.max(Math.round(values[0]), 0), cupSizes.length - 1);
                          const endIndex = Math.min(Math.max(Math.round(values[1]), 0), cupSizes.length - 1);
                          const validEndIndex = Math.max(endIndex, startIndex);
                          const startCup = cupSizes[startIndex];
                          const endCup = cupSizes[validEndIndex];
                          const cupSizeRange = `${startCup}-${endCup}`;
                          handleMeasurementChange(sizeIndex, field, cupSizeRange);
                        }}
                        allowOverlap={true}
                      />
                    )}
                  </div>
                ) : (
                  <RangeSlider
                    label={label}
                    labelHidden
                    value={[Math.max(currentValue, min), Math.max(endValue, min)]}
                    min={min}
                    max={max}
                    step={field === 'weight' ? 5 : 1}
                    output={false}
                    onChange={handleChange}
                    allowOverlap={false}
                  />
                )}
              </div>
            </div>

            {/* Single cup size toggle (only for cup_size) */}
            {isCupSize && (
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                marginTop: '10px',
                padding: '8px',
                backgroundColor: '#f9fafb',
                borderRadius: '4px'
              }}>
                <Text as="span" variant="bodyMd">Use single cup size</Text>
                <div className="Polaris-Toggle">
                  <input
                    type="checkbox"
                    id={`single-${field}-${sizeIndex}`}
                    className="Polaris-Toggle__Input"
                    checked={isSingleCup}
                    onChange={(e) => {
                      const makeSingle = e.target.checked;
                      if (makeSingle) {
                        const cup = cupSizes[currentValue];
                        handleMeasurementChange(sizeIndex, field, `${cup}-${cup}`);
                      } else {
                        const cupStart = cupSizes[currentValue];
                        const cupEnd = cupSizes[Math.min(currentValue + 1, cupSizes.length - 1)];
                        handleMeasurementChange(sizeIndex, field, `${cupStart}-${cupEnd}`);
                      }
                    }}
                  />
                  <label className="Polaris-Toggle__Label" htmlFor={`single-${field}-${sizeIndex}`}>
                    <span className="Polaris-Toggle__Track">
                      <span className="Polaris-Toggle__Icon"></span>
                    </span>
                  </label>
                </div>
              </div>
            )}

            {isOptionalMeasurement && (
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                marginTop: '10px',
                padding: '8px',
                backgroundColor: '#f9fafb',
                borderRadius: '4px'
              }}>
                <Text as="span" variant="bodyMd">Make {label} Optional</Text>
                <div className="Polaris-Toggle">
                  <input
                    type="checkbox"
                    id={toggleId}
                    className="Polaris-Toggle__Input"
                    checked={currentSizeRecommendation.optional_measurements?.[field] ?? false}
                    onChange={(e) => {
                      const updatedSizeRecommendation = {
                        ...currentSizeRecommendation,
                        optional_measurements: {
                          ...currentSizeRecommendation.optional_measurements,
                          [field]: e.target.checked
                        }
                      };
                      setCurrentSizeRecommendation(updatedSizeRecommendation);
                    }}
                  />
                  <label className="Polaris-Toggle__Label" htmlFor={toggleId}>
                    <span className="Polaris-Toggle__Track">
                      <span className="Polaris-Toggle__Icon"></span>
                    </span>
                  </label>
                </div>
              </div>
            )}
          </LegacyStack>
        </Box>
      );
    };

    const rows = currentSizeRecommendation.sizes.map((size, sizeIndex) => {
      let measurementRows = [];
      const enabled = size.enabled !== false;
      
      if (selectedCategory === 'tops') {
        measurementRows = [
          [
            <Box key={`height-${sizeIndex}`} width="50%" paddingInlineEnd="2">
              {renderMeasurementSlider(sizeIndex, 'height', size.height, 'Height', 60, 84)}
            </Box>,
            <Box key={`weight-${sizeIndex}`} width="50%" paddingInlineStart="2">
              {renderMeasurementSlider(sizeIndex, 'weight', size.weight, 'Weight (lbs)', 90, 300, 5)}
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
            <Box key={`dress-size-${sizeIndex}`} width="100%">
              {renderMeasurementSlider(sizeIndex, 'dress_size', size.dress_size, 'Dress Size', 0, 22, 2)}
            </Box>
          ]
        ];
      } else if (selectedCategory === 'Bikini Tops / Bras') {
        measurementRows = [
          [
            <Box key={`band-size-${sizeIndex}`} width="50%" paddingInlineEnd="2">
              {renderMeasurementSlider(sizeIndex, 'band_size', size.band_size, 'Band Size (in)', 28, 50)}
            </Box>,
            <Box key={`cup-size-${sizeIndex}`} width="50%" paddingInlineStart="2">
              {renderMeasurementSlider(sizeIndex, 'cup_size', size.cup_size, 'Cup Size', 0, 8, 1)}
            </Box>
          ]
        ];
      } else if (selectedCategory === 'onepieces') {
        measurementRows = [
          [
            <Box key={`hip-${sizeIndex}`} width="50%" paddingInlineEnd="2">
              {renderMeasurementSlider(sizeIndex, 'hip', size.hip, 'Hip (in)', 32, 56)}
            </Box>,
            <Box key={`cup-size-${sizeIndex}`} width="50%" paddingInlineStart="2">
              {renderMeasurementSlider(sizeIndex, 'cup_size', size.cup_size, 'Cup Size', 0, 8, 1)}
            </Box>
          ]
        ];
      }
      
      return {
        size: size.size || size.name,
        enabled,
        measurements: measurementRows
      };
    });

    // Don't use DataTable, instead create a custom layout
    return (
      <div style={{ width: '100%' }}>
        <TextField
          label="Chart Name"
          value={chartName}
          onChange={setChartName}
          autoComplete="off"
        />
        <Box paddingBlockStart="4">
          <LegacyCard>
            <LegacyCard.Section>
              <LegacyStack vertical spacing="3">
                <div>
                  <Text variant="headingMd" as="h3">Custom Size Chart Image</Text>
                  <Box paddingBlockStart="1">
                    <Text variant="bodyMd" as="p" color="subdued">
                      Optional. Upload an image to show in the storefront modal instead of the default size chart table. If you leave this empty, nothing changes and the default table will still be shown.
                    </Text>
                  </Box>
                </div>

                <input
                  ref={customChartImageInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={handleCustomSizeChartImageUpload}
                  style={{ display: 'none' }}
                />

                <LegacyStack spacing="3">
                  <Button onClick={() => customChartImageInputRef.current?.click()}>
                    {customSizeChartImage ? 'Replace Image' : 'Upload Image'}
                  </Button>
                  {customSizeChartImage && (
                    <Button destructive onClick={resetCustomSizeChartImage}>
                      Remove Image
                    </Button>
                  )}
                </LegacyStack>

                {customSizeChartImage ? (
                  <div style={{
                    border: '1px solid #dfe3e8',
                    borderRadius: '12px',
                    padding: '12px',
                    background: '#ffffff'
                  }}>
                    <img
                      src={customSizeChartImage}
                      alt="Custom size chart preview"
                      style={{
                        display: 'block',
                        width: '100%',
                        maxWidth: '100%',
                        height: 'auto',
                        borderRadius: '8px'
                      }}
                    />
                    <Box paddingBlockStart="2">
                      <Text variant="bodySm" as="p" color="subdued">
                        {customSizeChartImageName || 'Custom image uploaded'}
                      </Text>
                    </Box>
                  </div>
                ) : (
                  <Box
                    padding="4"
                    background="bg-surface-secondary"
                    borderRadius="2"
                  >
                    <Text variant="bodyMd" as="p" color="subdued">
                      No custom image uploaded. The default size chart table will be shown to customers.
                    </Text>
                  </Box>
                )}
              </LegacyStack>
            </LegacyCard.Section>
          </LegacyCard>
        </Box>
        <Box padding="4" style={{ overflowX: 'visible', width: '100%' }}>
          <div style={{ width: '100%', margin: '0 auto' }}>
            <LegacyCard>
              <Box paddingBlockStart="4" paddingInlineStart="0" paddingInlineEnd="0">
                <Text variant="bodyMd" as="p" color="subdued">
                  Drag the sliders to adjust measurements for each size:
                </Text>
                <Box paddingBlockStart="4">
                  {/* Custom layout instead of DataTable */}
                  {rows.map((sizeData, sizeIndex) => {
                    const includeToggleId = `include-size-${sizeIndex}`;

                    return (
                      <div key={`size-section-${sizeIndex}`} style={{
                        border: sizeData.enabled ? '2px solid #5c6ac4' : '1px solid #d8dee4',
                        borderRadius: '12px',
                        padding: '12px',
                        marginBottom: '16px',
                        boxShadow: '0px 1px 6px rgba(0, 0, 0, 0.05)',
                        background: sizeData.enabled ? '#ffffff' : '#f6f6f7',
                        opacity: sizeData.enabled ? 1 : 0.8
                      }}>
                        <Box padding="2" background="bg-surface" borderRadius="2"
                             style={{ marginBottom: '10px', borderBottom: '1px solid #e1e3e5' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
                            <Text variant="headingMd" as="h3" fontWeight="bold">
                              {sizeData.size}
                            </Text>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <Text as="span" variant="bodySm" color="subdued">
                                Include size
                              </Text>
                              <div className="Polaris-Toggle">
                                <input
                                  type="checkbox"
                                  id={includeToggleId}
                                  className="Polaris-Toggle__Input"
                                  checked={sizeData.enabled}
                                  onChange={(event) => handleSizeEnabledToggle(sizeIndex, event.target.checked)}
                                />
                                <label className="Polaris-Toggle__Label" htmlFor={includeToggleId}>
                                  <span className="Polaris-Toggle__Track">
                                    <span className="Polaris-Toggle__Icon"></span>
                                  </span>
                                </label>
                              </div>
                            </div>
                          </div>
                        </Box>

                        {sizeData.enabled ? (
                          <div style={{ marginBottom: '4px', width: '100%' }}>
                            {sizeData.measurements.map((measurementRow, rowIndex) => (
                              <div key={`measurement-row-${sizeIndex}-${rowIndex}`}
                                   style={{ width: '100%', marginBottom: '10px', display: 'flex' }}>
                                {measurementRow}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <Box
                            padding="4"
                            background="bg-surface-secondary"
                            borderRadius="2"
                          >
                            <Text variant="bodyMd" as="p" color="subdued">
                              This size will be hidden from shoppers and excluded from recommendations until you turn it back on.
                            </Text>
                          </Box>
                        )}
                      </div>
                    );
                  })}
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
                  <Button onClick={() => setIsResourcePickerOpen(true)}>
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
          <p>No products selected. Please select products to associate with this size recommendation.</p>
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
    console.log('Rendering modal content, current state:', {
      step,
      selectedCategory,
      selectedFitType,
      chartName,
      isModalOpen
    });
    return (
      <div style={{ 
        width: '100%', 
        maxWidth: '100%', 
        margin: '0 auto', 
        overflowX: 'visible',
        boxSizing: 'border-box',
        padding: '0'
      }}>
        {step === 'category' && (
          <>
            {console.log('Rendering category selection grid')}
            {renderCategorySelection()}
          </>
        )}
        {step === 'details' && (
          <>
            {console.log('Rendering fit type selection')}
            {renderFitTypeSelection()}
          </>
        )}
        {step === 'chart' && (
          <>
            {console.log('Rendering size recommendation chart')}
            {renderSizeRecommendation()}
          </>
        )}
        {step === 'products' && (
          <>
            {console.log('Rendering selected products')}
            {renderSelectedProducts()}
          </>
        )}
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
        title="Create Size Recommendation"
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
                  onClick={() => {
                    console.log('Save button clicked, validation state:', {
                      chartName,
                      selectedCategory,
                      selectedFitType,
                      hasCurrentSizeRecommendation: !!currentSizeRecommendation,
                      selectedProductsCount: selectedProducts.length,
                      disabled: !chartName || selectedProducts.length === 0
                    });
                    handleSave();
                  }}
                  disabled={!chartName || selectedProducts.length === 0}
                >
                  {editingRecommendationId ? 'Update' : 'Save'} Size Recommendation
                </Button>
              )}
            </div>
          </div>
        }
      >
        <Modal.Section>
          <div style={{ width: '100%', maxWidth: '900px', margin: '0 auto' }}>
            {console.log('Modal is open:', isModalOpen)}
            {modalContent()}
          </div>
        </Modal.Section>
      </Modal>

      <ResourcePicker
        resourceType="Product"
        open={isResourcePickerOpen}
        onCancel={() => setIsResourcePickerOpen(false)}
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
          <Box paddingBlockEnd="4">
            <LegacyCard roundedAbove="sm">
              <LegacyCard.Section>
                <Text as="h2" variant="headingLg">
                  Welcome to Size Buddy
                </Text>
                <Box paddingBlockStart="3">
                  <Text as="p" variant="bodyMd">
                    Help your customers find their perfect size with our smart size recommendation system. Get started by creating size recommendations for your products.
                  </Text>
                </Box>
              </LegacyCard.Section>
            </LegacyCard>
          </Box>
          <LegacyCard>
            <Box padding="4">
              {(lockedRecommendations.length > 0 || limitBanner) && (
                <Box paddingBlockEnd="4">
                  <Banner
                    status={lockedRecommendations.length > 0 ? 'warning' : 'critical'}
                    title={lockedRecommendations.length > 0
                      ? `${lockedRecommendations.length} size recommendation${lockedRecommendations.length === 1 ? '' : 's'} locked on your current plan`
                      : 'Plan limit reached'}
                    action={{
                      content: 'Upgrade plan',
                      onAction: navigateToPlans
                    }}
                  >
                    <p>
                      {lockedRecommendations.length > 0
                        ? 'Locked size recommendations stay unavailable on your current plan and will automatically unlock if you upgrade again.'
                        : 'Your current plan has reached its active size recommendation limit. Upgrade to add or unlock more size recommendations.'}
                    </p>
                  </Banner>
                </Box>
              )}

              {sizeRecommendations.length === 0 ? (
                <EmptyState
                  heading="Create your first size recommendation"
                  action={{
                    content: 'Create Size Recommendation',
                    onAction: handleModalOpen
                  }}
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <p>Start by creating a size recommendation for your products.</p>
                </EmptyState>
              ) : (
                <>
                  <Box paddingBlockEnd="4">
                    <LegacyStack distribution="equalSpacing" alignment="center">
                      <Text variant="headingMd" as="h3">Your Size Recommendations</Text>
                      <Button primary onClick={handleModalOpen}>
                        Create Size Recommendation
                      </Button>
                    </LegacyStack>
                  </Box>
                  <ResourceList
                    items={sizeRecommendations}
                    renderItem={(item) => {
                      const itemLocked = isRecommendationLocked(item);
                      const categoryLabel = item.category === 'bikinis'
                        ? 'Bikini Tops / Bras'
                        : item.category === 'onepieces'
                          ? 'One Pieces'
                          : item.category;

                      return (
                        <ResourceItem id={item.id}>
                          <div style={{
                            opacity: itemLocked ? 0.58 : 1,
                            filter: itemLocked ? 'grayscale(0.2)' : 'none',
                            transition: 'opacity 120ms ease'
                          }}>
                            <LegacyStack distribution="equalSpacing" alignment="center">
                              <LegacyStack vertical>
                                <Text variant="bodyMd" as="h3" fontWeight="bold">
                                  {item.name}
                                </Text>
                                <LegacyStack>
                                  <Badge status="info">{categoryLabel}</Badge>
                                  <Badge status="success">
                                    {item.fit_type === 'slim' ? 'Small Fit' : item.fit_type === 'regular' ? 'Standard Fit' : item.fit_type === 'loose' ? 'Large Fit' : item.fit_type + ' Fit'}
                                  </Badge>
                                  {itemLocked && <Badge status="attention">Locked</Badge>}
                                </LegacyStack>
                                {itemLocked && (
                                  <Text variant="bodySm" as="p" color="subdued">
                                    Locked on your current plan. Upgrade to edit or use this size recommendation again.
                                  </Text>
                                )}
                              </LegacyStack>
                              <ButtonGroup>
                                {itemLocked && (
                                  <Button onClick={navigateToPlans}>Upgrade to unlock</Button>
                                )}
                                <Button onClick={() => handleEdit(item)} disabled={itemLocked}>Edit</Button>
                                <Button destructive onClick={() => handleDelete(item.id)}>Delete</Button>
                              </ButtonGroup>
                            </LegacyStack>
                          </div>
                        </ResourceItem>
                      );
                    }}
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
                About Size Recommendations
              </Text>
              <Box paddingBlockStart="3">
                <Text as="p" variant="bodyMd">
                  Size recommendations help your customers find their perfect fit. Each recommendation is automatically generated based on the category
                  and fit type you select.
                </Text>
              </Box>
            </LegacyCard.Section>
            <LegacyCard.Section>
              <Text variant="headingMd" as="h3">
                Setup Instructions
              </Text>
              <Box paddingBlockStart="3">
                <LegacyStack vertical spacing="3">
                  <Text as="p" variant="bodyMd" fontWeight="semibold">
                    Step 1: Add the Size Buddy widget to your theme
                  </Text>
                  <Text as="p" variant="bodyMd">
                    • Go to <strong>Online Store → Themes → Customize</strong>
                  </Text>
                  <Text as="p" variant="bodyMd">
                    • Open a product page template
                  </Text>
                  <Text as="p" variant="bodyMd">
                    • Click <strong>Add block</strong> → <strong>Apps</strong> → <strong>Size Buddy</strong>
                  </Text>
                  <Text as="p" variant="bodyMd">
                    • Position the block where you want the "Find My Size" button to appear
                  </Text>
                  <Text as="p" variant="bodyMd">
                    • Click <strong>Save</strong>
                  </Text>
                </LegacyStack>
              </Box>
            </LegacyCard.Section>
            <LegacyCard.Section>
              <Text variant="headingMd" as="h3">
                How to create size recommendations
              </Text>
              <Box paddingBlockStart="3">
                <LegacyStack vertical spacing="3">
                  <Text as="p" variant="bodyMd">
                    1. Choose a category (Tops, Bottoms, Dresses, Bikini Tops / Bras, or One Pieces)
                  </Text>
                  <Text as="p" variant="bodyMd">
                    2. Name your size recommendation
                  </Text>
                  <Text as="p" variant="bodyMd">
                    3. Select the fit type (Small Fit, Standard Fit, or Large Fit)
                  </Text>
                  <Text as="p" variant="bodyMd">
                    4. Review and customize the measurements
                  </Text>
                  <Text as="p" variant="bodyMd">
                    5. Select the products to apply this size chart to
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
        .SizeBuddy-CategoryGrid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 16px;
        }
        .SizeBuddy-CategoryCard {
          appearance: none;
          border: 1px solid #d8dee4;
          border-radius: 18px;
          background: linear-gradient(180deg, #ffffff 0%, #f6f8fb 100%);
          padding: 18px 18px 16px;
          min-height: 138px;
          text-align: left;
          display: flex;
          flex-direction: column;
          justify-content: flex-start;
          gap: 10px;
          cursor: pointer;
          box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
          transition: transform 140ms ease, box-shadow 140ms ease, border-color 140ms ease;
        }
        .SizeBuddy-CategoryCard:hover {
          transform: translateY(-2px);
          border-color: #008060;
          box-shadow: 0 14px 28px rgba(0, 128, 96, 0.12);
        }
        .SizeBuddy-CategoryCard:focus-visible {
          outline: 3px solid rgba(0, 128, 96, 0.22);
          outline-offset: 2px;
          border-color: #008060;
        }
        .SizeBuddy-CategoryCard__Accent {
          width: 42px;
          height: 6px;
          border-radius: 999px;
          background: linear-gradient(90deg, #008060 0%, #33a07d 100%);
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