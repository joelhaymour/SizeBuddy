// Size Buddy Widget JavaScript - Version 4.0 (Updated Modal Version)
document.addEventListener('DOMContentLoaded', function() {
  console.log("Size Buddy v4.0 FIXED VERSION LOADED - DEBUG CHECK");
  
  // Get the widget container
  const widget = document.getElementById('size-buddy-widget');
  
  if (!widget) {
    console.error('Size Buddy: Widget container not found!');
    return;
  }
  
  console.log('Size Buddy v4.0: Widget found!', widget);
  
  // Get data attributes
  const productId = widget.getAttribute('data-product-id');
  const shopDomain = widget.getAttribute('data-shop-domain');
  const widgetPosition = widget.getAttribute('data-position');
  const widgetStyle = widget.getAttribute('data-style');
  
  console.log('Size Buddy: Widget attributes:', { 
    productId, 
    shopDomain,
    widgetPosition,
    widgetStyle
  });
  
  // IMPORTANT: Force replace any existing content with our button and modal
  // This ensures the widget displays correctly regardless of initial HTML
  widget.innerHTML = `
    <button id="size-buddy-toggle-btn" class="size-buddy-toggle-btn">Size Buddy</button>
    <div id="size-buddy-modal" class="size-buddy-modal">
      <div class="size-buddy-modal-content">
        <span class="size-buddy-close">&times;</span>
        <div class="size-buddy-content"></div>
      </div>
    </div>
  `;
  
  // Get the content container
  const contentContainer = widget.querySelector('.size-buddy-content');
  const toggleButton = document.getElementById('size-buddy-toggle-btn');
  const modal = document.getElementById('size-buddy-modal');
  const closeButton = widget.querySelector('.size-buddy-close');
  
  if (!contentContainer) {
    console.error('Size Buddy: Content container not found!');
    return;
  }

  // Add event listeners for the button and modal
  toggleButton.addEventListener('click', function() {
    modal.style.display = 'block';
    if (!contentContainer.innerHTML.trim()) {
      // If content is empty, load size recommendations
      loadSizeRecommendations();
    }
  });

  closeButton.addEventListener('click', function() {
    modal.style.display = 'none';
  });

  // Close the modal when clicking outside of it
  window.addEventListener('click', function(event) {
    if (event.target === modal) {
      modal.style.display = 'none';
    }
  });
  
  // Function to load size recommendations
  async function loadSizeRecommendations() {
    try {
      // Show loading state
      contentContainer.innerHTML = '<div class="size-buddy-loading">Loading size recommendations...</div>';
      
      console.log('Size Buddy Widget initialized with:', { productId, shopDomain });
      
      // Add a timestamp to prevent caching
      const timestamp = Date.now();
      
      // IMPORTANT: Start with Shopify app proxy - this avoids CORS issues
      let data = null;
      let fetchSuccess = false;
      
      try {
        console.log('Fetching data from Shopify app proxy...');
        const proxyUrl = `https://${shopDomain}/apps/size-buddy/api/size-charts?product_id=${productId}&shop=${shopDomain}&_=${timestamp}`;
        console.log('Proxy URL:', proxyUrl);
        
        const proxyResponse = await fetch(proxyUrl);
        
        if (proxyResponse.ok) {
          data = await proxyResponse.json();
          console.log('Successfully fetched from app proxy:', data);
          fetchSuccess = true;
        } else {
          console.error(`Failed to load size chart data from proxy: ${proxyResponse.status}`);
        }
      } catch (proxyError) {
        console.error('Error fetching from Shopify app proxy:', proxyError);
      }
      
      // If Shopify proxy failed, try direct backend URL (only for testing)
      if (!fetchSuccess) {
        try {
          console.log('Proxy fetch failed, attempting direct backend URL...');
          // Try host fallbacks
          const possibleUrls = [
            (window.SIZE_BUDDY_HOST || ''),
            'http://localhost:3000'
          ].filter(Boolean);
          
          for (const backendUrl of possibleUrls) {
            try {
              console.log(`Trying backend URL: ${backendUrl}`);
              const apiUrl = `${backendUrl}/direct-charts?product_id=${productId}&shop=${shopDomain}&_=${timestamp}`;
              
              const response = await fetch(apiUrl);
              
              if (response.ok) {
                data = await response.json();
                fetchSuccess = true;
                console.log('Successfully fetched from direct backend URL:', data);
                break;
              }
            } catch (urlError) {
              console.log(`Failed with ${backendUrl}:`, urlError);
            }
          }
          
          if (!fetchSuccess) {
            console.error('All direct URL attempts failed');
          }
        } catch (directError) {
          console.error('Error during direct backend fetch attempts:', directError);
        }
      }
      
      // If all fetch attempts failed, show error
      if (!fetchSuccess || !data) {
        console.error('All fetch attempts failed');
        contentContainer.innerHTML = '<div class="size-buddy-error">Unable to load size chart data. Please try again later.</div>';
        return;
      }
      
      // Validate the data
      if (!data.found) {
        console.log('No size chart found for this product');
        contentContainer.innerHTML = '<div class="size-buddy-error">No size chart found for this product.</div>';
        return;
      }
      
      if (!data.chart || !data.chart.sizes || !Array.isArray(data.chart.sizes) || data.chart.sizes.length === 0) {
        console.log('Invalid chart data received');
        contentContainer.innerHTML = '<div class="size-buddy-error">Invalid size chart data received.</div>';
        return;
      }
      
      console.log('Valid chart found:', data.chart);
      console.log('Chart sizes:', data.chart.sizes);
      
      // Extract and log the measurement types for debugging
      const firstSize = data.chart.sizes[0];
      const measurementTypes = Object.keys(firstSize).filter(key => key !== 'size' && key !== 'name');
      console.log('Measurement types in chart:', measurementTypes);
      
      // Render the form with the retrieved chart data
      renderSizeRecommendationForm(data.chart);
    } catch (error) {
      console.error('Size Buddy Error:', error);
      contentContainer.innerHTML = '<div class="size-buddy-error">An error occurred while loading the size chart. Please try again later.</div>';
    }
  }
  
  // Function to parse height string into inches
  function parseHeightValue(heightStr) {
    if (!heightStr || typeof heightStr !== 'string') {
      console.error('Invalid height value:', heightStr);
      return null; // Return null instead of default value
    }

    const match = heightStr.match(/(\d+)'(\d+)"/);
    if (match) {
      const feet = parseInt(match[1]);
      const inches = parseInt(match[2]);
      if (!isNaN(feet) && !isNaN(inches)) {
        return feet * 12 + inches;
      }
    }

    // Try parsing as just inches
    const numericValue = parseFloat(heightStr);
    if (!isNaN(numericValue)) {
      return numericValue;
    }

    console.error('Could not parse height value:', heightStr);
    return null; // Return null instead of default value
  }

  // Function to get slider tick values based on measurement type
  function getSliderTickValues(key, chart) {
    console.log('Getting tick values for:', key, 'Chart:', chart);
    
    // Initialize variables
    let minValue = Infinity;
    let maxValue = -Infinity;
    let tickValues = [];
    
    // Calculate from size chart
    chart.sizes.forEach(size => {
      if (size[key]) {
        if (size[key].includes('-')) {
          const [min, max] = size[key].split('-').map(v => {
            if (key === 'height') {
              const parsed = parseHeightValue(v.trim());
              console.log(`Parsed height value ${v.trim()} to ${parsed} inches`);
              return parsed;
            }
            return parseFloat(v.trim());
          }).filter(Boolean); // Filter out null values
          
          if (min !== null && max !== null) {
            minValue = Math.min(minValue, min);
            maxValue = Math.max(maxValue, max);
            tickValues.push(min, max);
            console.log(`Added height range ${min}-${max} inches to tick values`);
          }
        } else {
          const value = key === 'height' ? parseHeightValue(size[key]) : parseFloat(size[key]);
          if (value !== null) {
            minValue = Math.min(minValue, value);
            maxValue = Math.max(maxValue, value);
            tickValues.push(value);
            if (key === 'height') {
              console.log(`Added single height value ${value} inches to tick values`);
            }
          }
        }
      }
    });
    
    // Remove duplicates and sort
    tickValues = [...new Set(tickValues)].sort((a, b) => a - b);
    
    if (key === 'height') {
      console.log('Final height values:', {
        minValue,
        maxValue,
        tickValues
      });
    }
    
    return {
      min: minValue === Infinity ? null : minValue,
      max: maxValue === -Infinity ? null : maxValue,
      tickValues: tickValues.length > 0 ? tickValues : null
    };
  }

  // Function to format height value
  function formatHeightValue(inches) {
    const feet = Math.floor(inches / 12);
    const remainingInches = Math.round(inches % 12);
    return `${feet}'${remainingInches}"`;
  }

  // Function to render the size recommendation form dynamically based on the chart
  function renderSizeRecommendationForm(chart) {
    console.log('Rendering form with chart:', chart);
    
    // Get height values from the chart
    const heightData = getSliderTickValues('height', chart);
    console.log('Height data:', heightData);
    
    if (!heightData.min || !heightData.max || !heightData.tickValues) {
      console.error('Invalid height data:', heightData);
      return;
    }
    
    // Generate the form HTML
    let formHtml = `
      <div class="size-buddy-form">
        <h2>Size Buddy</h2>
        <p>Enter your measurements below to get your personalized size recommendation.</p>
        
        <div class="size-buddy-input-group">
          <label for="size-buddy-height">Height (in)</label>
          <div class="size-buddy-slider-container">
            <input type="range" 
                   class="size-buddy-slider" 
                   min="${heightData.min}" 
                   max="${heightData.max}" 
                   value="${heightData.min}" 
                   step="1"
                   data-measurement="height"
                   data-tick-values="${JSON.stringify(heightData.tickValues)}"
            >
            <div class="size-buddy-tick-marks">
              ${heightData.tickValues.map((v, i) => `
                <span style="left: ${(i / (heightData.tickValues.length - 1)) * 100}%">
                  ${formatHeightValue(v)}
                </span>
              `).join('')}
            </div>
          </div>
          <input type="text" 
                 id="size-buddy-height" 
                 class="size-buddy-input" 
                 value="${formatHeightValue(heightData.min)}"
                 data-min="${heightData.min}"
                 data-max="${heightData.max}"
          >
          <span class="size-buddy-value">${formatHeightValue(heightData.min)}</span>
        </div>
        
        <button id="size-buddy-calculate-btn" class="size-buddy-button">
          Get Size Recommendation
        </button>
        <div id="size-buddy-result-container"></div>
      </div>
    `;
    
    // Add size chart table
    formHtml += renderSizeChart(chart);
    
    // Set the form HTML
    contentContainer.innerHTML = formHtml;
    
    // Add event listeners for sliders
    const sliders = document.querySelectorAll('.size-buddy-slider');
    sliders.forEach(slider => {
      const container = slider.closest('.size-buddy-input-group');
      const input = container.querySelector('.size-buddy-input');
      const valueDisplay = container.querySelector('.size-buddy-value');
      const measurement = slider.getAttribute('data-measurement');
      
      slider.addEventListener('input', function(e) {
        const value = parseFloat(e.target.value);
        
        if (measurement === 'height') {
          // Get the tick values array
          const tickValues = JSON.parse(this.getAttribute('data-tick-values'));
          const initialValue = parseFloat(this.getAttribute('data-initial-value'));
          
          console.log('Height slider input:', {
            value,
            tickValues,
            initialValue
          });
          
          // If this is the first interaction and the value is at the minimum,
          // ensure we're using the initial value from the size chart
          if (value === parseFloat(this.min) && !this.hasInteracted) {
            this.value = initialValue;
            const heightStr = formatHeightValue(initialValue);
            input.value = heightStr;
            valueDisplay.textContent = heightStr;
            this.hasInteracted = true;
            return;
          }
          
          // Find the closest tick value
          const closestValue = tickValues.reduce((prev, curr) => {
            return Math.abs(curr - value) < Math.abs(prev - value) ? curr : prev;
          });
          
          // Update the slider to snap to the closest tick value
          this.value = closestValue;
          
          const heightStr = formatHeightValue(closestValue);
          input.value = heightStr;
          valueDisplay.textContent = heightStr;
        } else {
          input.value = value;
          valueDisplay.textContent = value;
        }
      });
      
      // Trigger the input event once to ensure proper initialization
      if (measurement === 'height') {
        const event = new Event('input');
        slider.dispatchEvent(event);
      }
    });
    
    // Add calculate button event listener
    const calculateButton = document.getElementById('size-buddy-calculate-btn');
    if (calculateButton) {
      calculateButton.addEventListener('click', function() {
        calculateSizeRecommendation(chart, measurementKeys);
      });
    }
  }
  
  // Function to format height values
  function formatHeightRange(value) {
    if (!value) return '-';
    
    // If it's already in feet'inches" format with a range, return as is
    if (typeof value === 'string' && value.includes("'") && value.includes('-')) {
      return value;
    }
    
    // If it's a range in inches format (e.g., "60-72")
    if (typeof value === 'string' && value.includes('-')) {
      const [min, max] = value.split('-').map(v => formatHeightValue(v.trim()));
      return `${min}-${max}`;
    }
    
    // Single value
    return formatHeightValue(value);
  }

  // Function to render the size chart
  function renderSizeChart(chart) {
    try {
      if (!chart.sizes || !Array.isArray(chart.sizes) || chart.sizes.length === 0) {
        return '<div class="size-buddy-error">No size chart data available</div>';
      }
      
      const firstSize = chart.sizes[0];
      
      // Get all measurement keys excluding size
      const measurementKeys = Object.keys(firstSize).filter(key => 
        key !== 'name' && key !== 'size'
      );
      
      if (measurementKeys.length === 0) {
        return '<div class="size-buddy-error">No measurement data in size chart</div>';
      }
      
      // Format the measurement labels
      const measurementLabels = measurementKeys.map(key => {
        return key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      });
      
      // Start building the HTML
      let tableHtml = '<div class="size-buddy-size-chart">';
      tableHtml += '<h4>Size Chart</h4>';
      tableHtml += '<table class="size-buddy-table">';
      
      // Create table header
      tableHtml += '<thead><tr>';
      tableHtml += '<th>Size</th>';
      
      // Add a column for each measurement
      measurementKeys.forEach((key, index) => {
        tableHtml += `<th>${measurementLabels[index]}</th>`;
      });
      
      tableHtml += '</tr></thead>';
      
      // Create table body
      tableHtml += '<tbody>';
      
      // Add a row for each size
      chart.sizes.forEach(size => {
        tableHtml += '<tr>';
        tableHtml += `<td><strong>${size.size}</strong></td>`;
        
        // Add a cell for each measurement
        measurementKeys.forEach(key => {
          // Format height values specially
          const value = key === 'height' ? formatHeightRange(size[key]) : (size[key] || '-');
          tableHtml += `<td>${value}</td>`;
        });
        
        tableHtml += '</tr>';
      });
      
      tableHtml += '</tbody></table></div>';
      
      return tableHtml;
    } catch (error) {
      console.error('Error rendering size chart:', error);
      return '<div class="size-buddy-error">Error rendering size chart</div>';
    }
  }
  
  // Function to calculate the size recommendation based on user input
  function calculateSizeRecommendation(chart, measurementKeys) {
    try {
      const CUP_SIZES = ['A','B','C','D','DD','DDD','F','G','H+'];
      const cupIndex = (val) => {
        if (typeof val !== 'string') return null;
        const upper = val.trim().toUpperCase();
        const idx = CUP_SIZES.indexOf(upper);
        return idx >= 0 ? idx : null;
      };
      const cupRange = (rangeStr) => {
        if (typeof rangeStr !== 'string' || !rangeStr.includes('-')) return null;
        const [minS, maxS] = rangeStr.split('-').map(s => s.trim().toUpperCase());
        const minI = cupIndex(minS);
        const maxI = cupIndex(maxS);
        if (minI === null || maxI === null) return null;
        return [Math.min(minI,maxI), Math.max(minI,maxI)];
      };
      // Get the result container
      const resultContainer = document.getElementById('size-buddy-result-container');
      
      if (!resultContainer) {
        console.error('Result container not found');
        return;
      }
      
      // Collect user measurements
      const userMeasurements = {};
      let missingFields = false;
      
      // Check for each measurement field in the form
      measurementKeys.forEach(key => {
        // Get both the slider and input elements
        const containerGroup = document.querySelector(`.size-buddy-input-group[data-measurement="${key}"]`);
        
        if (!containerGroup) {
          console.error(`Input group for ${key} not found`);
          missingFields = true;
          return;
        }
        
        const slider = containerGroup.querySelector('.size-buddy-slider');
        const inputField = containerGroup.querySelector('.size-buddy-input');
        
        if (!slider || !inputField) {
          console.error(`Slider or input for ${key} not found`);
          missingFields = true;
          return;
        }
        
        let value;
        
        // Get the current value from the slider (most accurate)
        if (key === 'cup_size' || key === 'dress_size') {
          // For non-numeric values, use the input's raw text
          value = inputField.value.trim();
          if (!value) {
            missingFields = true;
            return;
          }
        } else if (key === 'height') {
          // For height, get the exact value we stored (in inches)
          value = parseFloat(slider.value);
          if (isNaN(value) || value <= 0) {
            missingFields = true;
            return;
          }
        } else {
          // For other numeric inputs, use the slider's value
          value = parseFloat(slider.value);
          if (isNaN(value) || value <= 0) {
            missingFields = true;
            return;
          }
        }
        
        userMeasurements[key] = value;
      });
      
      if (missingFields) {
        resultContainer.innerHTML = '<div class="size-buddy-error">Please fill in all required measurements</div>';
        return;
      }
      
      console.log('User measurements:', userMeasurements);
      
      // *** CRITICAL FIX: Direct exact range matching first ***
      // Check if any size has an exact range match for all measurements
      let exactMatchSizes = [];
      let exactMatchFound = false;
      
      // For each size, check if all measurements fall within its ranges
      chart.sizes.forEach(size => {
        let allMeasurementsMatch = true;
        let missingMeasurements = false;
        
        // Check each user measurement against this size's ranges
        for (const key in userMeasurements) {
          const userValue = userMeasurements[key];
          const sizeValue = size[key];
          
          // Skip if this size doesn't have this measurement
          if (!sizeValue) {
            missingMeasurements = true;
            continue;
          }
          
          // Check for range values (supports cup_size range like "C-D")
          if (typeof sizeValue === 'string' && sizeValue.includes('-')) {
            if (key === 'cup_size') {
              const cr = cupRange(sizeValue);
              const u = cupIndex(userValue);
              if (cr && u !== null) {
                const [minI, maxI] = cr;
                if (u < minI || u > maxI) allMeasurementsMatch = false;
                else console.log(`EXACT CUP RANGE MATCH: ${userValue} in ${sizeValue} for size ${size.size || size.name}`);
              }
            } else {
              const rangeParts = sizeValue.split('-');
              if (rangeParts.length === 2) {
                const min = parseFloat(rangeParts[0]);
                const max = parseFloat(rangeParts[1]);
                if (!isNaN(min) && !isNaN(max)) {
                  if (!(userValue >= min && userValue <= max)) allMeasurementsMatch = false;
                  else console.log(`EXACT RANGE MATCH: ${userValue} is within ${key} range ${min}-${max} for size ${size.size || size.name}`);
                }
              }
            }
          } else {
            // For non-range values, exact match (handle cup_size string)
            if (key === 'cup_size') {
              const u = (typeof userValue === 'string') ? userValue.trim().toUpperCase() : '';
              const s = (typeof sizeValue === 'string') ? sizeValue.trim().toUpperCase() : '';
              if (u !== s) allMeasurementsMatch = false;
            } else if (sizeValue !== userValue) {
              allMeasurementsMatch = false;
            }
          }
        }
        
        // If all measurements match and we have no missing measurements, this is an exact match
        if (allMeasurementsMatch && !missingMeasurements) {
          exactMatchSizes.push(size);
          exactMatchFound = true;
        }
      });
      
      // If we found exact matches, use the smallest one (usually the best fit)
      if (exactMatchFound && exactMatchSizes.length > 0) {
        console.log('DIRECT EXACT MATCH FOUND! Using exact match size.');
        
        // If there's just one exact match, use it immediately
        if (exactMatchSizes.length === 1) {
          const bestSize = exactMatchSizes[0].size || exactMatchSizes[0].name;
          
          // Format the result HTML with the recommended size
          let resultHtml = `
            <div class="size-buddy-result">
              <h3>Your Recommended Size: ${bestSize}</h3>
              <p>Based on your measurements, we recommend size ${bestSize}.</p>
              <p><small>Perfect match: Your measurements are exactly within this size range.</small></p>
            </div>
          `;
          
          resultContainer.innerHTML = resultHtml;
          
          // Log the recommendation for analytics
          try {
            logSizeRecommendation(chart.id, bestSize, userMeasurements);
          } catch (error) {
            console.error('Error logging recommendation:', error);
          }
          
          return; // Exit early since we found an exact match
        }
        
        // If multiple exact matches, prefer the one where measurement is more central in the range
        // This handles edge cases like 30" which is at the upper boundary of XS (28-30) range
        const scoredMatches = exactMatchSizes.map(size => {
          let centralityScore = 0;
          let measurementCount = 0;
          
          // Calculate how central the measurements are within their ranges
          for (const key in userMeasurements) {
            const userValue = userMeasurements[key];
            const sizeValue = size[key];
            
            if (!sizeValue) continue;
            
            if (typeof sizeValue === 'string' && sizeValue.includes('-')) {
              const [min, max] = sizeValue.split('-').map(v => parseFloat(v));
              if (!isNaN(min) && !isNaN(max)) {
                const rangeWidth = max - min;
                // Calculate how far the value is from the center of the range (0 = center, 1 = boundary)
                const rangeCenter = (min + max) / 2;
                const distanceFromCenter = Math.abs(userValue - rangeCenter) / (rangeWidth / 2);
                // Convert to a score where 1 = center and 0 = boundary
                const positionScore = 1 - distanceFromCenter;
                centralityScore += positionScore;
                measurementCount++;
                
                // Log the centrality calculation
                console.log(`Size ${size.size}: ${key}=${userValue} in range ${min}-${max}, center=${rangeCenter}, distanceFromCenter=${distanceFromCenter.toFixed(2)}, positionScore=${positionScore.toFixed(2)}`);
              }
            }
          }
          
          // Calculate average centrality score
          const avgCentrality = measurementCount > 0 ? centralityScore / measurementCount : 0;
          
          return {
            size: size.size || size.name,
            score: avgCentrality
          };
        });
        
        // Find the size with the highest centrality score
        scoredMatches.sort((a, b) => b.score - a.score);
        const bestSize = scoredMatches[0].size;
        
        console.log('Multiple exact matches found. Choosing based on centrality:', scoredMatches);
        
        // Format the result HTML with the recommended size
        let resultHtml = `
          <div class="size-buddy-result">
            <h3>Your Recommended Size: ${bestSize}</h3>
            <p>Based on your measurements, we recommend size ${bestSize}.</p>
            <p><small>Perfect match: Your measurements are exactly within this size range.</small></p>
          </div>
        `;
        
        // If there's more than one exact match, suggest the next one as alternative
        if (scoredMatches.length > 1) {
          const altSize = scoredMatches[1].size;
          resultHtml += `<p>Alternative size: ${altSize}</p>`;
        }
        
        resultHtml += `</div>`;
        
        resultContainer.innerHTML = resultHtml;
        
        // Log the recommendation for analytics
        try {
          logSizeRecommendation(chart.id, bestSize, userMeasurements);
        } catch (error) {
          console.error('Error logging recommendation:', error);
        }
        
        return; // Exit early since we found exact matches
      }
      
      // Special-case: if only cup_size is present (band optional), prefer the tightest range containing the cup
      if (Array.isArray(measurementKeys) && measurementKeys.length === 1 && measurementKeys[0] === 'cup_size') {
        const CUP_SIZES = ['A','B','C','D','DD','DDD','F','G','H+'];
        const toIndex = (val) => {
          if (typeof val !== 'string') return null;
          const idx = CUP_SIZES.indexOf(val.trim().toUpperCase());
          return idx >= 0 ? idx : null;
        };
        const parseRange = (str) => {
          if (typeof str !== 'string' || !str.includes('-')) return null;
          const [a,b] = str.split('-').map(s => s.trim().toUpperCase());
          const ai = toIndex(a), bi = toIndex(b);
          if (ai === null || bi === null) return null;
          return [Math.min(ai,bi), Math.max(ai,bi)];
        };
        const u = toIndex(userMeasurements.cup_size);
        if (u !== null) {
          const order = ['XS','S','M','L','XL','XXL'];
          const candidates = [];
          chart.sizes.forEach(size => {
            const r = parseRange(size.cup_size);
            if (r) {
              const [minI, maxI] = r;
              if (u >= minI && u <= maxI) {
                candidates.push({
                  size: size.size || size.name,
                  width: maxI - minI,
                  centerDist: Math.abs(u - ((minI + maxI) / 2))
                });
              }
            }
          });
          if (candidates.length > 0) {
            candidates.sort((a, b) => {
              if (a.width !== b.width) return a.width - b.width; // narrowest first
              if (a.centerDist !== b.centerDist) return a.centerDist - b.centerDist; // closest to center
              return order.indexOf(b.size) - order.indexOf(a.size); // prefer larger size
            });
            const bestSize = candidates[0].size;
            // Animated result block (same as other categories)
            let resultHtml = `
              <div class="size-buddy-result-container" style="margin:25px auto;padding:25px;background-color:#f1f9f1;border-radius:10px;text-align:center;max-width:400px;box-shadow:0 3px 10px rgba(0,0,0,0.08);border-left:4px solid #4caf50;opacity:0;transform:translateY(20px);">
                <div class="size-buddy-title" style="font-size:18px;color:#333;margin-bottom:15px;opacity:0;transform:translateY(10px);">Your Recommended Size</div>
                <div class="size-buddy-size" style="font-size:42px;font-weight:700;color:#4caf50;margin:20px 0;opacity:0;transform:scale(0.9);">${bestSize}</div>
                <p class="size-buddy-message" style="color:#666;margin:15px 0 0;opacity:0;transform:translateY(10px);">Based on your measurements, we recommend size ${bestSize}.</p>
              </div>`;
            resultContainer.innerHTML = resultHtml;
            // Animation styles
            const styleEl = document.createElement('style');
            styleEl.textContent = `@keyframes containerFadeIn{0%{opacity:0;transform:translateY(20px);}100%{opacity:1;transform:translateY(0);}}@keyframes titleFadeIn{0%{opacity:0;transform:translateY(10px);}100%{opacity:1;transform:translateY(0);}}@keyframes sizePop{0%{opacity:0;transform:scale(0.9);}70%{opacity:1;transform:scale(1.1);}100%{opacity:1;transform:scale(1);}}@keyframes messageFadeIn{0%{opacity:0;transform:translateY(10px);}100%{opacity:1;transform:translateY(0);}}.size-buddy-result-container{animation:containerFadeIn .6s ease-out forwards}.size-buddy-title{animation:titleFadeIn .5s ease-out forwards .3s}.size-buddy-size{animation:sizePop .7s cubic-bezier(0.175,0.885,0.32,1.275) forwards .5s}.size-buddy-message{animation:messageFadeIn .5s ease-out forwards .7s}`;
            document.head.appendChild(styleEl);
            // Highlight and log
            try { logSizeRecommendation(chart.id, bestSize, userMeasurements); } catch {}
            return;
          }
        }
      }

      // If no direct exact matches, proceed with the regular algorithm but with priority for boundary matches
      // Check if we have any measurements that are exact boundaries of ranges
      let boundaryMatches = [];
      
      chart.sizes.forEach(size => {
        const sizeName = size.size || size.name;
        
        // Check each user measurement for boundary matches
        for (const key in userMeasurements) {
          const userValue = userMeasurements[key];
          const sizeValue = size[key];
          
          // Skip if this size doesn't have this measurement
          if (!sizeValue) continue;
          
          // Check for range values
          if (typeof sizeValue === 'string' && sizeValue.includes('-')) {
            if (key === 'cup_size') {
              const cr = cupRange(sizeValue);
              const u = cupIndex(userValue);
              if (cr && u !== null) {
                const [minI, maxI] = cr;
                if (u === minI || u === maxI) {
                  boundaryMatches.push({ size: sizeName, key, value: userValue, boundary: u === minI ? 'min' : 'max', range: sizeValue });
                }
              }
            } else {
              const [min, max] = sizeValue.split('-').map(v => parseFloat(v));
              if (!isNaN(min) && !isNaN(max)) {
                if (userValue === min || userValue === max) {
                  boundaryMatches.push({ size: sizeName, key, value: userValue, boundary: userValue === min ? 'min' : 'max', range: `${min}-${max}` });
                }
              }
            }
          }
        }
      });
      
      // If we have boundary matches, prioritize them
      if (boundaryMatches.length > 0) {
        console.log('Found boundary matches:', boundaryMatches);
        
        // Group by size
        const sizeGroups = {};
        boundaryMatches.forEach(match => {
          sizeGroups[match.size] = sizeGroups[match.size] || [];
          sizeGroups[match.size].push(match);
        });
        
        // For upper boundaries, prefer the smaller size
        // For lower boundaries, prefer the larger size
        // For a 30" waist which is the upper boundary of XS range 28-30, prefer XS over S
        let bestSize = null;
        let bestScore = -1;
        
        Object.keys(sizeGroups).forEach(sizeName => {
          const matches = sizeGroups[sizeName];
          let score = matches.length; // Base score is number of boundary matches
          
          // Add extra points for upper boundary matches (they should go to the smaller size)
          const upperBoundaryMatches = matches.filter(m => m.boundary === 'max');
          score += upperBoundaryMatches.length * 2; // Double points for upper boundary
          
          if (score > bestScore) {
            bestScore = score;
            bestSize = sizeName;
          }
        });
        
        if (bestSize) {
          console.log(`Selected ${bestSize} based on boundary matches with score ${bestScore}`);
          
          // Format the result HTML with the recommended size
          let resultHtml = `
            <div class="size-buddy-result">
              <h3>Your Recommended Size: ${bestSize}</h3>
              <p>Based on your measurements, we recommend size ${bestSize}.</p>
              <p><small>Your measurements are at the boundary of this size range.</small></p>
            </div>
          `;
          
          resultContainer.innerHTML = resultHtml;
          
          // Log the recommendation for analytics
          try {
            logSizeRecommendation(chart.id, bestSize, userMeasurements);
          } catch (error) {
            console.error('Error logging recommendation:', error);
          }
          
          return; // Exit early since we found boundary matches
        }
      }
      
      // First, check for partial range matches
      let rangeMatches = {};
      let hasRangeMatch = false;
      
      chart.sizes.forEach(size => {
        const sizeName = size.size || size.name;
        rangeMatches[sizeName] = 0;
        
        // Check each user measurement against this size's ranges
        for (const key in userMeasurements) {
          const userValue = userMeasurements[key];
          const sizeValue = size[key];
          
          // Skip if this size doesn't have this measurement
          if (!sizeValue) continue;
          
          // Check for range values
          if (typeof sizeValue === 'string' && sizeValue.includes('-')) {
            if (key === 'cup_size') {
              const cr = cupRange(sizeValue);
              const u = cupIndex(userValue);
              if (cr && u !== null) {
                const [minI, maxI] = cr;
                if (u >= minI && u <= maxI) {
                  rangeMatches[sizeName]++; hasRangeMatch = true;
                }
              }
            } else {
              const rangeParts = sizeValue.split('-');
              if (rangeParts.length === 2) {
                const min = parseFloat(rangeParts[0]);
                const max = parseFloat(rangeParts[1]);
                if (!isNaN(min) && !isNaN(max)) {
                  if (userValue >= min && userValue <= max) { rangeMatches[sizeName]++; hasRangeMatch = true; }
                }
              }
            }
          }
        }
      });
      
      // Initialize variables for the best match
      let bestSize = null;
      let bestScore = -Infinity;
      let scoreDetails = [];
      
      // Check if this is a tops category chart with score ranges and we have height and weight
      const isTopsCategory = chart.category && chart.category.toLowerCase() === 'tops';
      const hasScoreRanges = chart.sizes.some(size => size.score && typeof size.score === 'string');
      const hasHeightAndWeight = userMeasurements.height && userMeasurements.weight;
      
      // Only use score-based sizing for tops category
      if (isTopsCategory && hasScoreRanges && hasHeightAndWeight) {
        // New score-based approach - combine height and weight
        const combinedScore = userMeasurements.height + userMeasurements.weight;
        console.log(`Calculated combined score for top: ${combinedScore} (height ${userMeasurements.height} in + weight ${userMeasurements.weight} lbs)`);
        
        // Find the size that matches the combined score
        chart.sizes.forEach(size => {
          console.log(`Evaluating size ${size.size}:`, size);
          
          if (size.score && typeof size.score === 'string' && size.score.includes('-')) {
            const [minScore, maxScore] = size.score.split('-').map(v => parseFloat(v.trim()));
            
            if (!isNaN(minScore) && !isNaN(maxScore)) {
              let matchScore = 0;
              let details = '';
              
              if (combinedScore >= minScore && combinedScore <= maxScore) {
                // Perfect match - score is within the range
                matchScore = 1.0;
                details = `${combinedScore} is within range ${minScore}-${maxScore}. Perfect match!`;
              } else {
                // Calculate how far outside the range
                const rangeWidth = maxScore - minScore;
                const distanceFromRange = combinedScore < minScore 
                  ? minScore - combinedScore 
                  : combinedScore - maxScore;
                
                // Get a score between 0-1 based on distance (the closer, the higher)
                // Using 50% of range width as the tolerance
                const tolerance = rangeWidth * 0.5;
                matchScore = Math.max(0, 1 - (distanceFromRange / tolerance));
                details = `${combinedScore} is outside range ${minScore}-${maxScore}. Score: ${matchScore.toFixed(2)}`;
              }
              
              console.log(`Size ${size.size} score: ${matchScore.toFixed(2)}`);
              
              if (matchScore > bestScore) {
                bestScore = matchScore;
                bestSize = size.size;
                scoreDetails = [details];
              }
            }
          } else {
            console.log(`Size ${size.size} has no valid score range defined`);
          }
        });
      } else {
        // Regular size calculation for other products
        chart.sizes.forEach(size => {
          const sizeName = size.size || size.name;
          let sizeScore = 0;
          let measurementCount = 0;
          
          for (const key in userMeasurements) {
            const userValue = userMeasurements[key];
            const sizeValue = size[key];
            
            if (!sizeValue) continue;
            
            let matchScore = 0;
            
            if (typeof sizeValue === 'string' && sizeValue.includes('-')) {
              if (key === 'cup_size') {
                const cr = cupRange(sizeValue);
                const u = cupIndex(userValue);
                if (cr && u !== null) {
                  const [minI, maxI] = cr;
                  if (u >= minI && u <= maxI) matchScore = 1.0;
                  else {
                    const rangeWidth = maxI - minI || 1;
                    const distance = u < minI ? minI - u : u - maxI;
                    const tolerance = Math.max(1, Math.round(rangeWidth * 0.5));
                    matchScore = Math.max(0, 1 - (distance / tolerance));
                  }
                }
              } else {
                const [min, max] = sizeValue.split('-').map(v => parseFloat(v.trim()));
                if (!isNaN(min) && !isNaN(max)) {
                  if (userValue >= min && userValue <= max) matchScore = 1.0;
                  else {
                    const rangeWidth = max - min;
                    const distanceFromRange = userValue < min ? min - userValue : userValue - max;
                    const tolerance = rangeWidth * 0.3;
                    matchScore = Math.max(0, 1 - (distanceFromRange / tolerance));
                  }
                }
              }
            } else {
              if (key === 'cup_size') {
                // exact string compare for single cup values
                matchScore = (String(sizeValue).trim().toUpperCase() === String(userValue).trim().toUpperCase()) ? 1.0 : 0.0;
              } else {
                const numValue = parseFloat(sizeValue);
                if (!isNaN(numValue)) {
                  const diff = Math.abs(userValue - numValue);
                  const tolerance = userValue * 0.1;
                  matchScore = Math.max(0, 1 - (diff / tolerance));
                }
              }
            }
            
            sizeScore += matchScore;
            measurementCount++;
          }
          
          if (measurementCount > 0) {
            const normalizedScore = sizeScore / measurementCount;
            console.log(`Size ${sizeName} score: ${normalizedScore.toFixed(2)}`);
            
            if (normalizedScore > bestScore) {
              bestScore = normalizedScore;
              bestSize = sizeName;
            }
          }
        });
      }
      
      // Display the result
      if (bestSize) {
        console.log(`Selected ${bestSize} with score ${bestScore.toFixed(2)}`);
        
        let resultHtml = `
          <div class="size-buddy-result">
            <h3>Your Recommended Size: ${bestSize}</h3>
            <p>Based on your measurements, we recommend size ${bestSize}.</p>
          </div>
        `;
        
        resultContainer.innerHTML = resultHtml;
        
        // Log the recommendation for analytics
        try {
          logSizeRecommendation(chart.id, bestSize, userMeasurements);
        } catch (error) {
          console.error('Error logging recommendation:', error);
        }
      } else {
        resultContainer.innerHTML = '<div style="color:#ff5252;padding:15px;background:#fff8f8;border-radius:8px;text-align:center;margin:15px auto;max-width:400px;box-shadow:0 2px 4px rgba(0,0,0,0.05);">Unable to determine size recommendation. Please check your measurements.</div>';
      }
    } catch (error) {
      console.error('Error in calculateSize:', error);
      resultContainer.innerHTML = '<div style="color:#ff5252;padding:15px;background:#fff8f8;border-radius:8px;text-align:center;margin:15px auto;max-width:400px;box-shadow:0 2px 4px rgba(0,0,0,0.05);">Error calculating size recommendation. Please try again.</div>';
    }
  }
  
  // Helper function to calculate measurement score
  function calculateMeasurementScore(userValue, min, max) {
    if (userValue >= min && userValue <= max) {
      return 1.0; // Perfect match
    } else {
      const rangeWidth = max - min;
      const distanceFromRange = userValue < min ? min - userValue : userValue - max;
      const tolerance = rangeWidth * 0.3;
      return Math.max(0, 1 - (distanceFromRange / tolerance));
    }
  }
  
  // Function to log size recommendations for analytics
  async function logSizeRecommendation(chartId, recommendedSize, measurements) {
    try {
      const backendUrl = `https://${shopDomain}/apps/size-buddy/api/analytics`;
      console.log(`Trying to log recommendation to ${backendUrl}`);
      
      const response = await fetch(backendUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chart_id: chartId,
          recommended_size: recommendedSize,
          measurements: measurements,
          product_id: productId,
          shop: shopDomain
        })
      });
      
      if (response.ok) {
        console.log('Successfully logged size recommendation');
      } else {
        console.error('Failed to log recommendation:', response.status);
      }
    } catch (error) {
      console.log(`Failed to log to ${backendUrl}:`, error);
    }
  }
});