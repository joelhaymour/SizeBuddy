// Size Buddy Widget JS v4.0 (Fixed)
(function() {
  // Wait for DOM ready
  function initWidget() {
    console.log("Size Buddy Widget v4.0 - Fixed Version Loading");
    
    // Get the widget container (support multiple selectors: legacy id, custom element, or class)
    const widget = document.querySelector('#size-buddy-widget, size-buddy-block, .size-buddy-block');
    if (!widget) {
      console.error('Widget container not found');
      return;
    }
    
    // Get data attributes
    const productId = widget.getAttribute('data-product-id');
    const shopDomain = widget.getAttribute('data-shop-domain');
    const buttonColor = widget.getAttribute('data-button-color');
    const buttonTextColor = widget.getAttribute('data-button-text-color');
    
    console.log('Size Buddy: Widget attributes found:', { 
      productId, 
      shopDomain
    });
    
    // Create the button element with modern design
    const button = document.createElement('button');
    button.id = 'size-buddy-toggle-btn';
    button.textContent = 'Find My Size';  // Changed from 'Find Your Perfect Size' to 'Find My Size'
    button.style.backgroundColor = buttonColor || '#4A90E2';
    // Determine text color: theme setting or contrast fallback
    const autoText = (() => {
      if (!buttonColor) return '#FFFFFF';
      try {
        const hex = buttonColor.replace('#','');
        const r = parseInt(hex.substring(0,2), 16);
        const g = parseInt(hex.substring(2,4), 16);
        const b = parseInt(hex.substring(4,6), 16);
        const yiq = (r*299 + g*587 + b*114) / 1000;
        return yiq >= 128 ? '#000000' : '#FFFFFF';
      } catch { return '#FFFFFF'; }
    })();
    button.style.color = buttonTextColor || autoText;
    button.style.padding = '12px 20px';
    button.style.border = 'none';
    button.style.borderRadius = '6px';
    button.style.cursor = 'pointer';
    button.style.margin = '15px 0';
    button.style.fontWeight = '600';
    button.style.fontSize = '14px';
    button.style.letterSpacing = '0.5px';
    button.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
    button.style.transition = 'all 0.3s ease';
    
    // Add hover effects via mouseover/mouseout
    button.addEventListener('mouseover', function() {
      this.style.backgroundColor = buttonColor || '#3A7BC8';
      this.style.transform = 'translateY(-1px)';
      this.style.boxShadow = '0 4px 8px rgba(0,0,0,0.15)';
    });
    
    button.addEventListener('mouseout', function() {
      this.style.backgroundColor = buttonColor || '#4A90E2';
      this.style.transform = 'translateY(0)';
      this.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
    });
    
    // Create modern modal element
    const modal = document.createElement('div');
    modal.id = 'size-buddy-modal';
    modal.style.display = 'none';
    modal.style.position = 'fixed';
    modal.style.zIndex = '99999';
    modal.style.left = '0';
    modal.style.top = '0';
    modal.style.width = '100%';
    modal.style.height = '100%';
    modal.style.overflow = 'auto';
    modal.style.backgroundColor = 'rgba(0,0,0,0.6)';
    modal.style.backdropFilter = 'blur(3px)';
    modal.style.transition = 'opacity 0.3s ease';
    
    const modalContent = document.createElement('div');
    modalContent.style.backgroundColor = 'white';
    modalContent.style.margin = '5% auto';
    modalContent.style.padding = '30px';
    modalContent.style.border = 'none';
    modalContent.style.width = '90%';
    modalContent.style.maxWidth = '600px';
    modalContent.style.borderRadius = '10px';
    modalContent.style.position = 'relative';
    modalContent.style.boxShadow = '0 10px 30px rgba(0,0,0,0.2)';
    modalContent.style.transition = 'transform 0.3s ease';
    modalContent.style.transform = 'translateY(20px)';
    modalContent.style.opacity = '0';
    
    // Add animation when modal opens
    modal.addEventListener('click', function(e) {
      if (e.target === modal) {
        closeModal();
      }
    });

    function showModal() {
      modal.style.display = 'block';
      setTimeout(() => {
        modalContent.style.transform = 'translateY(0)';
        modalContent.style.opacity = '1';
      }, 10);
    }
    
    function closeModal() {
      modalContent.style.transform = 'translateY(20px)';
      modalContent.style.opacity = '0';
      setTimeout(() => {
        modal.style.display = 'none';
      }, 300);
    }
    
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '&times;';
    closeBtn.style.position = 'absolute';
    closeBtn.style.right = '15px';
    closeBtn.style.top = '15px';
    closeBtn.style.backgroundColor = 'transparent';
    closeBtn.style.border = 'none';
    closeBtn.style.color = '#888';
    closeBtn.style.fontSize = '28px';
    closeBtn.style.fontWeight = 'bold';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.padding = '0';
    closeBtn.style.lineHeight = '1';
    closeBtn.style.transition = 'color 0.3s ease';
    
    closeBtn.addEventListener('mouseover', function() {
      this.style.color = '#333';
    });
    
    closeBtn.addEventListener('mouseout', function() {
      this.style.color = '#888';
    });
    
    const contentDiv = document.createElement('div');
    contentDiv.id = 'size-buddy-content';
    contentDiv.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
    
    // Add result div
    const resultDiv = document.createElement('div');
    resultDiv.id = 'size-buddy-result';
    contentDiv.appendChild(resultDiv);

    // Add measurement score calculation function
    function calculateMeasurementScore(value, min, max) {
      // Convert string ranges to numbers if needed
      const minVal = typeof min === 'string' ? parseFloat(min) : min;
      const maxVal = typeof max === 'string' ? parseFloat(max) : max;
      const val = typeof value === 'string' ? parseFloat(value) : value;
      
      if (isNaN(minVal) || isNaN(maxVal) || isNaN(val)) {
        console.error('Invalid measurement values:', { value, min, max });
        return 0;
      }
      
      // Perfect match if within range
      if (val >= minVal && val <= maxVal) {
        return 1;
      }
      
      // Calculate distance from range as a percentage
      const range = maxVal - minVal;
      const midpoint = (minVal + maxVal) / 2;
      const distance = Math.abs(val - midpoint);
      
      // Score decreases linearly with distance from range
      const score = Math.max(0, 1 - (distance / range));
      
      return score;
    }
    
    // Add slider styles
    const styleEl = document.createElement('style');
    styleEl.textContent = `
      .size-slider-container {
        margin-bottom: 25px !important;
      }
      
      .slider-label {
        display: flex !important;
        justify-content: space-between !important;
        align-items: center !important;
        margin-bottom: 8px !important;
      }
      
      .slider-label span {
        font-weight: 500 !important;
        color: #333 !important;
        font-size: 15px !important;
      }
      
      .slider-value {
        color: #4A90E2 !important;
        font-weight: 600 !important;
        background-color: #f1f8fe !important;
        padding: 4px 8px !important;
        border-radius: 4px !important;
        min-width: 40px !important;
        text-align: center !important;
      }
      
      .slider-container {
        position: relative !important;
        height: 40px !important;
        width: 100% !important;
      }
      
      .slider-track {
        position: absolute !important;
        top: 50% !important;
        left: 0 !important;
        right: 0 !important;
        transform: translateY(-50%) !important;
        width: 100% !important;
        height: 6px !important;
        background-color: #e0e0e0 !important;
        border-radius: 3px !important;
        z-index: 0 !important;
      }
      
      .slider-filled {
        position: absolute !important;
        top: 50% !important;
        left: 0 !important;
        transform: translateY(-50%) !important;
        height: 6px !important;
        background-color: #4A90E2 !important;
        border-radius: 3px !important;
        z-index: 1 !important;
      }
      
      .slider-handle {
        position: absolute !important;
        top: 50% !important;
        transform: translate(-50%, -50%) !important;
        width: 22px !important;
        height: 22px !important;
        background-color: white !important;
        border: 2px solid #4A90E2 !important;
        border-radius: 50% !important;
        cursor: pointer !important;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1) !important;
        z-index: 2 !important;
        display: block !important;
      }
      
      .slider-handle:hover {
        transform: translate(-50%, -50%) scale(1.1) !important;
        box-shadow: 0 3px 8px rgba(0,0,0,0.2) !important;
      }
      
      .slider-ticks {
        position: absolute !important;
        top: 50% !important;
        left: 0 !important;
        right: 0 !important;
        transform: translateY(-50%) !important;
        width: 100% !important;
        height: 6px !important;
        display: flex !important;
        justify-content: space-between !important;
        pointer-events: none !important;
        z-index: 0 !important;
      }
      
      .slider-tick {
        width: 2px;
        height: 10px;
        background-color: #ccc;
        border-radius: 1px;
      }
      
      .slider-labels {
        display: flex !important;
        justify-content: space-between !important;
        margin-top: 5px !important;
        font-size: 12px !important;
        color: #666 !important;
      }
    `;
    document.head.appendChild(styleEl);
    
    // Initial content - will be replaced with actual size form
    contentDiv.innerHTML = '<div style="text-align:center;padding:20px;color:#666;"><svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#4A90E2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg><p style="margin-top:10px;">Loading size recommendations...</p></div>';
    
    // Append elements
    modalContent.appendChild(closeBtn);
    modalContent.appendChild(contentDiv);
    modal.appendChild(modalContent);
    
    // Clear widget and append our elements (only clear if it's not the whole document/body)
    try { widget.innerHTML = ''; } catch (_) {}
    widget.appendChild(button);
    document.body.appendChild(modal);
    
    // Direct click handler for button
    button.addEventListener('click', function() {
      console.log('Button clicked - showing modal directly');
      showModal();
      // Always reset content and re-fetch when reopening
      const container = document.getElementById('size-buddy-content');
      if (container) {
        container.innerHTML = '<div style="text-align:center;padding:20px;color:#666;">Loading size recommendations...</div>';
      }
      
      // Load size data directly
      fetchSizeData(productId, shopDomain, contentDiv);
    });
    
    // Close button handler
    closeBtn.addEventListener('click', function() {
      closeModal();
    });
    
    // Function to fetch size data and render form
    async function fetchSizeData(productId, shopDomain, contentDiv) {
      try {
        // Add timestamp to prevent caching
        const timestamp = Date.now();
        // Preferred: use app proxy (works in production, signed by Shopify)
        const proxyUrl = 'https://' + shopDomain + '/apps/size-buddy/size-charts?product_id=' + productId + '&_=' + timestamp;
        // Fallback (public, read-only): server public endpoint
        const directUrl = (window.SIZE_BUDDY_HOST || 'https://sizebuddy.onrender.com') + '/public/size-charts?product_id=' + productId + '&shop=' + shopDomain + '&_=' + timestamp;
        
        console.log('Fetching size data from:', proxyUrl);
        
        let response = await fetch(proxyUrl);
        if (!response.ok) {
          console.warn('Proxy fetch failed with', response.status, '– falling back to direct backend');
          response = await fetch(directUrl);
        }
        
        if (!response.ok) {
          throw new Error('Failed to fetch size data: ' + response.status);
        }
        
        const data = await response.json();
        
        if (!data.found) {
          contentDiv.innerHTML = '<div style="color:#ff5252;padding:20px;background:#fff8f8;border-radius:8px;text-align:center;margin-top:15px;box-shadow:0 2px 4px rgba(0,0,0,0.05);">No size chart found for this product.</div>';
          return;
        }
        
        const chart = data.chart;
        
        // Log widget view for analytics (only once when widget is displayed)
        if (!window.sizeBuddyViewLogged) window.sizeBuddyViewLogged = {};
        if (!window.sizeBuddyViewLogged[productId]) {
          try {
            const backendUrl = (window.SIZE_BUDDY_HOST || 'https://sizebuddy.onrender.com');
            await fetch(`${backendUrl}/api/log-widget-view`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                shop: shopDomain,
                product_id: productId,
                chart_id: chart.id
              })
            });
            window.sizeBuddyViewLogged[productId] = true;
            console.log('Widget view logged for analytics');
          } catch (error) {
            console.error('Error logging widget view:', error);
            // Don't stop execution if logging fails
          }
        }
        
        // Initialize product-specific recommendation logging tracker
        if (!window.sizeBuddyRecommendationLogged) window.sizeBuddyRecommendationLogged = {};
        
        // Extract measurement fields and determine min/max values for each
        const measurements = [];
        if (chart.sizes && chart.sizes.length > 0) {
          const firstSize = chart.sizes[0];
          Object.keys(firstSize).forEach(key => {
            // Skip the relative_size field and score field
            if (key !== 'name' && key !== 'size' && key !== 'relative_size' && key !== 'score' && key !== 'optional_measurements') {
              // Check if this is a cup size measurement
              const isCupSize = key.toLowerCase().includes('cup');
              
              if (isCupSize) {
                // Get unique cup sizes from all sizes
                const cupSizes = ['A', 'B', 'C', 'D', 'DD', 'DDD', 'F', 'G', 'H+'];
                
                measurements.push({
                  id: key,
                  name: key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' '),
                  isCupSize: true,
                  values: cupSizes
                });
              } else {
                // Handle numeric measurements
                let minValue = Infinity;
                let maxValue = -Infinity;
                
                chart.sizes.forEach(size => {
                  const value = size[key];
                  if (value) {
                    if (typeof value === 'string' && value.includes('-')) {
                      const [min, max] = value.split('-').map(v => parseFloat(v.trim()));
                      if (!isNaN(min) && !isNaN(max)) {
                        minValue = Math.min(minValue, min);
                        maxValue = Math.max(maxValue, max);
                      }
                    } else {
                      const numValue = parseFloat(value);
                      if (!isNaN(numValue)) {
                        minValue = Math.min(minValue, numValue);
                        maxValue = Math.max(maxValue, numValue);
                      }
                    }
                  }
                });
                
                // Skip this measurement if it's optional and disabled (server uses optional_measurements true to mark optional)
                const isOptionalAndDisabled = chart.optional_measurements && 
                                            typeof chart.optional_measurements === 'object' &&
                                            chart.optional_measurements[key] === true;
                
                console.log('Checking optional measurement:', key, {
                  isOptionalAndDisabled,
                  optional_measurements: chart.optional_measurements,
                  key,
                  value: chart.optional_measurements ? chart.optional_measurements[key] : undefined,
                  chart_data: chart
                });

                if (isOptionalAndDisabled) {
                  console.log('Skipping optional measurement:', key);
                  return; // Skip this measurement
                }
                
                if (!isOptionalAndDisabled) {
                  const range = maxValue - minValue;
                  const padding = Math.max(1, Math.round(range * 0.1));
                  minValue = Math.max(0, minValue - padding);
                  maxValue = maxValue + padding;
                  minValue = Math.floor(minValue);
                  maxValue = Math.ceil(maxValue);
                  
                  // Set appropriate ranges for dress measurements
                  if (chart.category === 'dresses') {
                    switch(key) {
                      case 'bust':
                        minValue = 30;
                        maxValue = 50;
                        break;
                      case 'waist':
                        minValue = 24;
                        maxValue = 44;
                        break;
                      case 'hip':
                        minValue = 34;
                        maxValue = 54;
                        break;
                    }
                  }
                  
                  measurements.push({
                    id: key,
                    name: key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' '),
                    unit: key === 'weight' ? 'lbs' : 'in',
                    min: minValue,
                    max: maxValue,
                    defaultValue: Math.round((minValue + maxValue) / 2)
                  });
                }
              }
            }
          });
        }
        
        // Render size recommendation form with modern design
        let formHtml = '<div style="margin-bottom:30px;">';
        formHtml += '<h2 style="font-size:24px;margin-bottom:15px;color:#333;text-align:center;font-weight:600;">Size Buddy</h2>';
        formHtml += '<p style="margin-bottom:25px;color:#666;text-align:center;font-size:15px;">Enter your measurements below to get your personalized size recommendation.</p>';
        
        // Create form inputs
        formHtml += '<div style="max-width:400px;margin:0 auto;">';
        measurements.forEach((measurement, index) => {
          if (measurement.id === 'height') {
            // Get height values from the size chart
            const heightValues = [];
            chart.sizes.forEach(size => {
              if (size.height) {
                if (size.height.includes('-')) {
                  const [min, max] = size.height.split('-').map(h => {
                    const match = h.trim().match(/(\d+)'(\d+)"/);
                    if (match) {
                      return parseInt(match[1]) * 12 + parseInt(match[2]);
                    }
                    return null;
                  }).filter(Boolean);
                  
                  if (min !== undefined) heightValues.push(min);
                  if (max !== undefined) heightValues.push(max);
                } else {
                  const match = size.height.match(/(\d+)'(\d+)"/);
                  if (match) {
                    const inches = parseInt(match[1]) * 12 + parseInt(match[2]);
                    heightValues.push(inches);
                  }
                }
              }
            });
            
            // Sort and remove duplicates
            const uniqueHeights = [...new Set(heightValues)].sort((a, b) => a - b);
            
            if (uniqueHeights.length === 0) {
              console.error('No valid height values found in size chart');
              return;
            }
            
            const min = uniqueHeights[0];
            const max = uniqueHeights[uniqueHeights.length - 1];
            
            // Generate 5 evenly spaced values
            const numValues = 5;
            const stepSize = (max - min) / (numValues - 1);
            const displayHeights = [];
            
            for (let i = 0; i < numValues; i++) {
              const inches = Math.round(min + (stepSize * i));
              displayHeights.push(inches);
            }
            
            // Create labels for height values
            const labelsHtml = displayHeights.map(inches => {
              const feet = Math.floor(inches / 12);
              const remainingInches = inches % 12;
              return `<span style="color:#666;font-size:12px;">${feet}'${remainingInches}"</span>`;
            }).join('');
            
            // Calculate initial position - start in the middle
            const initialValue = Math.round((min + max) / 2);
            const initialPercent = 50; // Start in middle position
            
            formHtml += `
              <div class="size-slider-container" data-measurement="height" style="margin-bottom:25px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                  <span style="font-weight:500;color:#333;font-size:15px;">Height (in)</span>
                  <div class="slider-value" id="size-buddy-value-height" data-value="${initialValue}" style="color:#4A90E2;font-weight:600;background-color:#f1f8fe;padding:4px 8px;border-radius:4px;min-width:40px;text-align:center;">
                    ${formatHeightValue(initialValue)}
                  </div>
                </div>
                <div class="slider-container" 
                     data-min="${min}" 
                     data-max="${max}"
                     data-height-values='${JSON.stringify(displayHeights)}'
                     style="position:relative;height:40px;width:100%;touch-action:none;overflow:visible;">
                  <div class="slider-track"></div>
                  <div class="slider-filled" style="width:${initialPercent}%"></div>
                  <div class="slider-handle" style="left:${initialPercent}%"></div>
                  <div class="slider-ticks">
                    ${displayHeights.map(() => '<div class="tick"></div>').join('')}
                  </div>
                </div>
                <div class="slider-labels" style="display:flex;justify-content:space-between;margin-top:5px;">
                  ${labelsHtml}
                </div>
              </div>
            `;
          } else if (measurement.isCupSize) {
            // Create a discrete slider for cup sizes instead of buttons
            const cupSizes = measurement.values;
            const initialValue = 0; // Default to first cup size (A)
            const maxValue = cupSizes.length - 1;
            
            // Create labels for cup sizes
            let labelsHtml = '';
            cupSizes.forEach((size, i) => {
              labelsHtml += '<span style="color:#666;font-size:12px;">' + size + '</span>';
            });
            
            formHtml += '<div class="size-slider-container cup-size-slider" data-measurement="' + measurement.id + '" style="margin-bottom:25px;">' +
              '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
                '<span style="font-weight:500;color:#333;font-size:15px;">' + measurement.name + '</span>' +
                '<div class="slider-value" id="size-buddy-value-' + measurement.id + '" style="color:#4A90E2;font-weight:600;background-color:#f1f8fe;padding:4px 8px;border-radius:4px;min-width:40px;text-align:center;">' + cupSizes[initialValue] + '</div>' +
              '</div>' +
              '<div class="slider-container cup-size-container" data-min="0" data-max="' + maxValue + '" data-sizes="' + cupSizes.join(',') + '" style="position:relative;height:40px;width:100%;touch-action:none;overflow:visible;">' +
                '<div class="slider-track" style="position:absolute;top:50%;left:0;right:0;transform:translateY(-50%);width:100%;height:6px;background-color:#e0e0e0;border-radius:3px;z-index:1;"></div>' +
                '<div class="slider-filled" style="position:absolute;top:50%;left:0;transform:translateY(-50%);height:6px;width:0%;background-color:#4A90E2;border-radius:3px;z-index:2;"></div>' +
                '<div class="slider-handle" style="position:absolute;top:50%;left:0%;transform:translate(-50%, -50%);width:22px;height:22px;background-color:white;border:2px solid #4A90E2;border-radius:50%;cursor:pointer;box-shadow:0 2px 4px rgba(0,0,0,0.1);z-index:3;display:block;"></div>';
            
            // Add ticks for each cup size
            formHtml += '<div class="slider-ticks" style="position:absolute;top:50%;left:0;right:0;transform:translateY(-50%);width:100%;height:6px;display:flex;justify-content:space-between;pointer-events:none;z-index:1;">';
            for (let i = 0; i <= maxValue; i++) {
              formHtml += '<div style="width:4px;height:10px;background-color:#ccc;border-radius:2px;"></div>';
            }
            formHtml += '</div></div>' +
              '<div class="slider-labels" style="display:flex;justify-content:space-between;margin-top:5px;">' + labelsHtml + '</div>' +
            '</div>';
          } else {
            // Create numeric slider
            const numTicks = 5;
            const ticksHtml = Array(numTicks).fill('').map(() => '<div style="width:2px;height:10px;background-color:#ccc;border-radius:1px;"></div>').join('');
            const stepSize = (measurement.max - measurement.min) / (numTicks - 1);
            
            // Create labels with proper formatting
            let labelsHtml = '';
            for (let i = 0; i < numTicks; i++) {
              const value = Math.round(measurement.min + (stepSize * i));
              
              let displayValue = value;
              if (measurement.id === 'height') {
                // Format height as feet and inches
                const feet = Math.floor(value / 12);
                const inches = value % 12;
                displayValue = feet + "'" + inches + '"';
              }
              
              labelsHtml += '<span style="color:#666;font-size:12px;">' + displayValue + '</span>';
            }
            
            // Format the default value
            let displayDefaultValue = measurement.defaultValue;
            if (measurement.id === 'height') {
              // Convert the default value to feet and inches
              const feet = Math.floor(measurement.defaultValue / 12);
              const inches = measurement.defaultValue % 12;
              displayDefaultValue = feet + "'" + inches + '"';
            }
            
            const initialPercent = ((measurement.defaultValue - measurement.min) / (measurement.max - measurement.min)) * 100;
            
            formHtml += '<div class="size-slider-container" data-measurement="' + measurement.id + '" style="margin-bottom:25px;">' +
              '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
                '<span style="font-weight:500;color:#333;font-size:15px;">' + measurement.name + (measurement.unit ? ' (' + measurement.unit + ')' : '') + '</span>' +
                '<div class="slider-value" id="size-buddy-value-' + measurement.id + '" data-value="' + measurement.defaultValue + '" style="color:#4A90E2;font-weight:600;background-color:#f1f8fe;padding:4px 8px;border-radius:4px;min-width:40px;text-align:center;">' + displayDefaultValue + '</div>' +
              '</div>' +
              '<div class="slider-container" data-min="' + measurement.min + '" data-max="' + measurement.max + '" style="position:relative;height:40px;width:100%;touch-action:none;overflow:visible;">' +
                '<div class="slider-track" style="position:absolute;top:50%;left:0;right:0;transform:translateY(-50%);width:100%;height:6px;background-color:#e0e0e0;border-radius:3px;z-index:1;"></div>' +
                '<div class="slider-filled" style="position:absolute;top:50%;left:0;transform:translateY(-50%);height:6px;width:' + initialPercent + '%;background-color:#4A90E2;border-radius:3px;z-index:2;"></div>' +
                '<div class="slider-handle" style="position:absolute;top:50%;left:' + initialPercent + '%;transform:translate(-50%, -50%);width:22px;height:22px;background-color:white;border:2px solid #4A90E2;border-radius:50%;cursor:pointer;box-shadow:0 2px 4px rgba(0,0,0,0.1);z-index:3;display:block;"></div>' +
                '<div class="slider-ticks" style="position:absolute;top:50%;left:0;right:0;transform:translateY(-50%);width:100%;height:6px;display:flex;justify-content:space-between;pointer-events:none;z-index:1;">' + ticksHtml + '</div>' +
              '</div>' +
              '<div class="slider-labels" style="display:flex;justify-content:space-between;margin-top:5px;">' + labelsHtml + '</div>' +
            '</div>';
          }
        });
        
        // Add button
        formHtml += '<div class="size-buddy-form-group" style="margin-top:30px;">' +
                   '<button id="size-buddy-get-recommendation" ' +
                   'class="size-buddy-button" ' +
                   'style="width:100%;padding:15px;background-color:#4A90E2;color:white;border:none;border-radius:8px;font-size:16px;font-weight:500;cursor:pointer;transition:background-color 0.2s;">' +
                   'Find My Size' +
                   '</button>' +
                   '</div>';
        formHtml += '<div id="size-buddy-result" style="margin-top:20px;"></div>';
        formHtml += '</div>';
        
        // Add size chart with modern styling
        formHtml += '<div style="margin-top:30px;">' +
          '<h3 style="text-align:center;color:#333;margin-bottom:20px;">Size Chart</h3>' +
          '<div style="overflow-x:auto;">' +
          '<table style="width:100%;border-collapse:collapse;background:white;box-shadow:0 1px 3px rgba(0,0,0,0.1);border-radius:8px;">' +
          '<thead><tr>' +
          '<th style="border:1px solid #f0f0f0;padding:12px;background-color:#f8f9fa;text-align:center;font-weight:600;color:#333;">Size</th>';

        // Add measurement headers
        measurements.forEach(m => {
          formHtml += '<th style="border:1px solid #f0f0f0;padding:12px;background-color:#f8f9fa;text-align:center;font-weight:600;color:#333;">' + m.name + '</th>';
        });

        formHtml += '</tr></thead><tbody>';

        // Add size rows
        chart.sizes.forEach((size, idx) => {
          const sizeName = size.size || size.name;
          formHtml += '<tr id="size-chart-row-' + sizeName + '" style="' + (idx % 2 === 0 ? 'background-color:#ffffff;' : 'background-color:#fafafa;') + '">' +
            '<td style="border:1px solid #f0f0f0;padding:12px;text-align:center;font-weight:600;color:#333;">' + sizeName + '</td>';

          measurements.forEach(m => {
            formHtml += '<td style="border:1px solid #f0f0f0;padding:12px;text-align:center;color:#666;">' + (size[m.id] || '-') + '</td>';
          });

          formHtml += '</tr>';
        });

        formHtml += '</tbody></table></div></div>';
        
        // Set the content
        contentDiv.innerHTML = formHtml;
        
        // Initialize sliders after content is set
        document.querySelectorAll('.slider-container').forEach(slider => {
          const isCupSize = slider.classList.contains('cup-size-container');
          const track = slider.querySelector('.slider-track');
          const filled = slider.querySelector('.slider-filled');
          const handle = slider.querySelector('.slider-handle');
          const container = slider.closest('.size-slider-container');
          const valueDisplay = container.querySelector('.slider-value');
          
          const minValue = parseFloat(slider.getAttribute('data-min'));
          const maxValue = parseFloat(slider.getAttribute('data-max'));
          
          let isDragging = false;
          
          // Function to update slider position and value
          function updateSlider(clientX) {
            const rect = slider.getBoundingClientRect();
            const offsetX = clientX - rect.left;
            let percent = Math.max(0, Math.min(100, (offsetX / rect.width) * 100));
            
            const measurementId = container.getAttribute('data-measurement');
            const range = maxValue - minValue;
            let value, formattedValue;
            
            if (measurementId === 'height') {
                try {
                    // Calculate the target height in inches
                    const targetValue = minValue + (percent / 100) * range;
                    // Round to nearest inch
                    value = Math.round(targetValue);
                    // Ensure value stays within bounds
                    value = Math.max(minValue, Math.min(maxValue, value));
                    
                    // Recalculate percent based on the selected value
                    percent = ((value - minValue) / range) * 100;
                    formattedValue = formatHeightValue(value);
                    
                    console.log('Height slider updated:', {
                        targetValue,
                        selectedValue: value,
                        formattedValue
                    });
                } catch (error) {
                    console.error('Error processing height value:', error);
                    return;
                }
            } else if (isCupSize) {
                // For cup sizes, get the array of cup sizes from the slider's data attribute
                const cupSizes = slider.getAttribute('data-sizes').split(',');
                // Calculate which cup size index we're at based on the percent
                const cupIndex = Math.min(Math.max(Math.round((cupSizes.length - 1) * (percent / 100)), 0), cupSizes.length - 1);
                // Get the actual cup size letter
                value = cupIndex;
                formattedValue = cupSizes[cupIndex];
                // Recalculate percent to snap to the nearest cup size position
                percent = (cupIndex / (cupSizes.length - 1)) * 100;
            } else {
                // For other measurements like weight, band size, etc.
                const measurementId = container.getAttribute('data-measurement');
                if (measurementId === 'weight') {
                  // Round min and max to nearest 5 for weight
                  const roundedMin = Math.round(minValue / 5) * 5;
                  const roundedMax = Math.round(maxValue / 5) * 5;
                  const range = roundedMax - roundedMin;
                  const stepSize = 5;
                  const numSteps = Math.ceil(range / stepSize);
                  const percentPerStep = 100 / numSteps;
                  const stepIndex = Math.round(percent / percentPerStep);
                  
                  percent = stepIndex * percentPerStep;
                  value = roundedMin + (stepIndex * stepSize);
                  value = Math.min(Math.max(value, roundedMin), roundedMax);
                  formattedValue = value.toString();
                } else {
                  // For waist and hip measurements
                  const stepSize = (measurementId === 'waist' || measurementId === 'hip') ? 1 : (range <= 20 ? 1 : 2);
                  const numSteps = Math.ceil(range / stepSize);
                  const percentPerStep = 100 / numSteps;
                  const stepIndex = Math.round(percent / percentPerStep);
                  
                  percent = stepIndex * percentPerStep;
                  value = Math.round(minValue + (stepIndex * stepSize));
                  formattedValue = value.toString();
                }
            }
            
            // Update the slider UI
            filled.style.width = percent + '%';
            handle.style.left = percent + '%';
            valueDisplay.textContent = formattedValue;
            valueDisplay.setAttribute('data-value', value);
          }
          
          // Initialize the cup size slider to show first value
          if (isCupSize) {
            updateSlider(slider.getBoundingClientRect().left);
          }
          
          // Mouse events
          handle.addEventListener('mousedown', (e) => {
            isDragging = true;
            handle.style.transform = 'translate(-50%, -50%) scale(1.1)';
            handle.style.boxShadow = '0 3px 8px rgba(0,0,0,0.2)';
            e.preventDefault();
          });
          
          document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            updateSlider(e.clientX);
          });
          
          document.addEventListener('mouseup', () => {
            if (!isDragging) return;
            isDragging = false;
            handle.style.transform = 'translate(-50%, -50%)';
            handle.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
          });
          
          // Touch events
          handle.addEventListener('touchstart', (e) => {
            isDragging = true;
            handle.style.transform = 'translate(-50%, -50%) scale(1.1)';
            handle.style.boxShadow = '0 3px 8px rgba(0,0,0,0.2)';
            e.preventDefault();
          });
          
          document.addEventListener('touchmove', (e) => {
            if (!isDragging) return;
            updateSlider(e.touches[0].clientX);
            e.preventDefault();
          });
          
          document.addEventListener('touchend', () => {
            if (!isDragging) return;
            isDragging = false;
            handle.style.transform = 'translate(-50%, -50%)';
            handle.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
          });
          
          // Click on track
          track.addEventListener('click', (e) => {
            updateSlider(e.clientX);
          });
          
          // Label clicks for cup sizes
          if (isCupSize) {
            const cupSizes = slider.getAttribute('data-sizes').split(',');
            const labels = container.querySelectorAll('.slider-labels span');
            
            labels.forEach((label, index) => {
              label.addEventListener('click', () => {
                // Calculate the position for this index
                const percent = (index / (cupSizes.length - 1)) * 100;
                // Update the slider to this position
                filled.style.width = percent + '%';
                handle.style.left = percent + '%';
                valueDisplay.textContent = cupSizes[index];
              });
            });
          }
        });
        
        // Add event listeners for cup size options
        document.querySelectorAll('.cup-size-option').forEach(button => {
          button.addEventListener('click', function() {
            const container = this.closest('.size-input-container');
            const valueDisplay = container.querySelector('.cup-size-value');
            const allOptions = container.querySelectorAll('.cup-size-option');
            
            // Reset all options
            allOptions.forEach(opt => {
              opt.style.borderColor = '#e0e0e0';
              opt.style.backgroundColor = 'white';
              opt.style.color = '#333';
            });
            
            // Highlight selected option
            this.style.borderColor = '#4A90E2';
            this.style.backgroundColor = '#f1f8fe';
            this.style.color = '#4A90E2';
            
            // Update value display
            valueDisplay.textContent = this.dataset.value;
          });
          
          // Add hover effects
          button.addEventListener('mouseover', function() {
            if (this.style.borderColor !== 'rgb(74, 144, 226)') { // Not selected
              this.style.borderColor = '#ccc';
              this.style.transform = 'translateY(-1px)';
            }
          });
          
          button.addEventListener('mouseout', function() {
            if (this.style.borderColor !== 'rgb(74, 144, 226)') { // Not selected
              this.style.borderColor = '#e0e0e0';
              this.style.transform = 'translateY(0)';
            }
          });
        });
        
        // Add event listener for calculate button (attach per render)
        const calcBtn = document.getElementById('size-buddy-get-recommendation');
        if (calcBtn) {
          calcBtn.replaceWith(calcBtn.cloneNode(true));
          const freshBtn = document.getElementById('size-buddy-get-recommendation');
          freshBtn.addEventListener('click', function() {
            calculateSize(chart, measurements);
          });
        }
        
      } catch (error) {
        console.error('Error in fetchSizeData:', error);
        contentDiv.innerHTML = '<p style="color: red;">Error loading size data. Please try again later.</p>';
      }
    }
    
    // Function to calculate size recommendation
    function calculateSize(chart, measurements) {
      try {
        const resultDiv = document.getElementById('size-buddy-result');
        if (!resultDiv) {
          console.error('Result div not found');
          return;
        }
        const userMeasurements = {};
        
        // Collect measurement values
        measurements.forEach(m => {
          if (m.isCupSize) {
            const container = document.querySelector('.size-slider-container[data-measurement="' + m.id + '"]');
            if (!container) return;
            
            const valueDisplay = container.querySelector('.slider-value');
            if (!valueDisplay || !valueDisplay.textContent) return;
            
            userMeasurements[m.id] = valueDisplay.textContent;
          } else {
            const container = document.querySelector('.size-slider-container[data-measurement="' + m.id + '"]');
            if (!container) return;
            
            const valueDisplay = container.querySelector('.slider-value');
            if (!valueDisplay) return;
            
            if (m.id === 'height') {
              // For height, use the stored numeric value rather than the displayed text
              const value = parseFloat(valueDisplay.getAttribute('data-value'));
              if (!isNaN(value) && value > 0) {
                userMeasurements[m.id] = value;
              }
            } else {
              // For other numeric measurements like weight
              const value = parseFloat(valueDisplay.textContent);
              if (!isNaN(value) && value > 0) {
                userMeasurements[m.id] = value;
              }
            }
          }
        });
        
        if (Object.keys(userMeasurements).length === 0) {
          resultDiv.innerHTML = '<div style="color:#ff5252;padding:15px;background:#fff8f8;border-radius:8px;text-align:center;margin:15px auto;max-width:400px;box-shadow:0 2px 4px rgba(0,0,0,0.05);">Please adjust the measurements</div>';
          return;
        }
        
        console.log('User measurements:', userMeasurements);
        
        let bestSize = null;
        let bestScore = -Infinity;
        let scoreDetails = [];

        // Check if this is a tops category chart and we have height and weight
        const isTopsCategory = chart.category && chart.category.toLowerCase() === 'tops';
        const isBottomsCategory = chart.category && chart.category.toLowerCase() === 'bottoms';
        const hasHeightAndWeight = userMeasurements.height && userMeasurements.weight;
        const hasWaistAndHip = userMeasurements.waist && userMeasurements.hip;
        
        // Tops sizing: rule-guided scoring that avoids undersizing near top-of-range
        if (isTopsCategory && hasHeightAndWeight) {
          const heightInches = parseFloat(userMeasurements.height);
          const weightLbs = parseFloat(userMeasurements.weight);

          const order = ['XS','S','M','L','XL','XXL'];
          const candidates = [];

          chart.sizes.forEach(size => {
            let hScore = 0;
            let wScore = 0;
            let hMin = NaN, hMax = NaN, wMin = NaN, wMax = NaN;

            // Height score from range like 5'7"-6'6"
            if (size.height && typeof size.height === 'string' && size.height.includes('-')) {
              const [hMinStr, hMaxStr] = size.height.split('-').map(s => s.trim());
              hMin = parseHeightValue(hMinStr);
              hMax = parseHeightValue(hMaxStr);
              if (!isNaN(hMin) && !isNaN(hMax)) {
                const half = ((hMax - hMin) || 1) / 2;
                const center = (hMin + hMax) / 2;
                const base = Math.max(0, 1 - (Math.abs(heightInches - center) / half));
                const inside = heightInches >= hMin && heightInches <= hMax;
                hScore = inside ? (0.6 + 0.4 * base) : base * 0.5; // keep decent score inside, small if outside
              }
            }

            // Weight score from numeric range like 166-210
            if (size.weight && typeof size.weight === 'string' && size.weight.includes('-')) {
              [wMin, wMax] = size.weight.split('-').map(v => parseFloat(v.trim()));
              if (!isNaN(wMin) && !isNaN(wMax)) {
                const half = ((wMax - wMin) || 1) / 2;
                const center = (wMin + wMax) / 2;
                const base = Math.max(0, 1 - (Math.abs(weightLbs - center) / half));
                const inside = weightLbs >= wMin && weightLbs <= wMax;
                wScore = inside ? (0.6 + 0.4 * base) : base * 0.5;
              }
            }

            const nearUpperWeight = !isNaN(wMin) && !isNaN(wMax) && weightLbs >= (wMin + 0.8 * (wMax - wMin));
            const nearUpperHeight = !isNaN(hMin) && !isNaN(hMax) && heightInches >= (hMin + 0.8 * (hMax - hMin));

            const matchScore = Math.min(1, (0.55 * hScore) + (0.45 * wScore) + (nearUpperWeight ? 0.08 : 0) + (nearUpperHeight ? 0.03 : 0));
            candidates.push({
              name: size.size || size.name,
              score: matchScore,
              wMin, wMax, hMin, hMax,
              nearUpperWeight
            });
          });

          // Choose the best, but prefer sizing up when scores are close and weight is at the top of range
          if (candidates.length) {
            candidates.sort((a,b) => b.score - a.score || order.indexOf(a.name) - order.indexOf(b.name));
            const topScore = candidates[0].score;
            const close = candidates.filter(c => c.score >= topScore - 0.02);
            const withUpper = close.filter(c => c.nearUpperWeight);
            const pickFrom = withUpper.length ? withUpper : close;
            // among close ones, prefer larger size
            pickFrom.sort((a,b) => order.indexOf(a.name) - order.indexOf(b.name));
            const chosen = pickFrom[pickFrom.length - 1];
            bestSize = chosen.name;
            bestScore = chosen.score;
          }
        } else if (isBottomsCategory && hasWaistAndHip) {
          // Rule-based bottoms logic:
          // 1) Pick sizes that fit waist within ±1" tolerance
          // 2) Among them, choose the smallest size whose hip max accommodates the user's hip;
          //    if none do, size up until hips fit.
          const order = ['XS','S','M','L','XL','XXL'];
          const waistTol = 1; // inches
          const hipTol = 0;   // require hips to be within range; adjust if you want forgiveness

          const sizes = chart.sizes
            .map(s => ({
              name: s.size || s.name,
              w: (s.waist || '').split('-').map(v => parseFloat(v.trim())),
              h: (s.hip || '').split('-').map(v => parseFloat(v.trim()))
            }))
            .filter(s => s.w.length === 2 && s.h.length === 2 && !s.w.some(isNaN) && !s.h.some(isNaN))
            .sort((a,b) => order.indexOf(a.name) - order.indexOf(b.name));

          const waist = userMeasurements.waist;
          const hip = userMeasurements.hip;

          // Filter by waist tolerance
          const waistFit = sizes.filter(s => waist >= (s.w[0] - waistTol) && waist <= (s.w[1] + waistTol));
          let chosen = null;

          if (waistFit.length > 0) {
            // Start from the smallest size that fits waist
            let idx = 0;
            // Tighten selection by choosing the one with waist center closest to user's waist
            waistFit.sort((a,b) => {
              const ac = (a.w[0]+a.w[1])/2, bc = (b.w[0]+b.w[1])/2;
              return Math.abs(ac - waist) - Math.abs(bc - waist) || (order.indexOf(a.name)-order.indexOf(b.name));
            });
            // Try candidate; if hips too large, size up stepwise
            let candidate = waistFit[idx];
            let cIndex = sizes.findIndex(s => s.name === candidate.name);
            while (cIndex < sizes.length) {
              const s = sizes[cIndex];
              const hipFits = hip >= (s.h[0] - hipTol) && hip <= (s.h[1] + hipTol);
              if (hipFits) { chosen = s; break; }
              // Size up if hips exceed current hip max; otherwise keep current (prioritize waist)
              if (hip > (s.h[1] + hipTol)) { cIndex++; } else { chosen = s; break; }
            }
          }

          if (chosen) {
            bestSize = chosen.name;
            bestScore = 1;
          }
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
              
              // Cup-size aware scoring (supports ranges like "C-D")
              if (key === 'cup_size') {
                const CUP_SIZES = ['A','B','C','D','DD','DDD','F','G','H+'];
                const toIndex = (val) => {
                  if (typeof val !== 'string') return null;
                  const idx = CUP_SIZES.indexOf(val.trim().toUpperCase());
                  return idx >= 0 ? idx : null;
                };
                const parseCupRange = (rangeStr) => {
                  if (typeof rangeStr !== 'string' || !rangeStr.includes('-')) return null;
                  const [minS, maxS] = rangeStr.split('-').map(s => s.trim().toUpperCase());
                  const minI = toIndex(minS);
                  const maxI = toIndex(maxS);
                  if (minI === null || maxI === null) return null;
                  return [Math.min(minI, maxI), Math.max(minI, maxI)];
                };
                const u = toIndex(String(userValue));
              if (typeof sizeValue === 'string' && sizeValue.includes('-')) {
                  const cr = parseCupRange(sizeValue);
                  if (cr && u !== null) {
                    const [minI, maxI] = cr;
                    if (u >= minI && u <= maxI) {
                      matchScore = 1.0;
                    } else {
                      const rangeWidth = Math.max(1, maxI - minI);
                      const distance = u < minI ? (minI - u) : (u - maxI);
                      const tolerance = Math.max(1, Math.round(rangeWidth * 0.5));
                      matchScore = Math.max(0, 1 - (distance / tolerance));
                    }
                  }
                } else {
                  // Single cup letter compare
                  matchScore = (String(sizeValue).trim().toUpperCase() === String(userValue).trim().toUpperCase()) ? 1.0 : 0.0;
                }
              } else if (typeof sizeValue === 'string' && sizeValue.includes('-')) {
                const [min, max] = sizeValue.split('-').map(v => parseFloat(v.trim()));
                if (!isNaN(min) && !isNaN(max)) {
                  if (userValue >= min && userValue <= max) {
                    matchScore = 1.0;
                  } else {
                    const rangeWidth = max - min;
                    const distanceFromRange = userValue < min ? min - userValue : userValue - max;
                    const tolerance = rangeWidth * 0.3;
                    matchScore = Math.max(0, 1 - (distanceFromRange / tolerance));
                  }
                }
              } else {
                const numValue = parseFloat(sizeValue);
                if (!isNaN(numValue)) {
                  const diff = Math.abs(userValue - numValue);
                  const tolerance = userValue * 0.1;
                  matchScore = Math.max(0, 1 - (diff / tolerance));
                }
              }
              
              // For dresses, weight measurements more evenly
              if (chart.category === 'dresses') {
                // All measurements (bust, waist, hip) are equally important
                matchScore *= 1;
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
        
        // Cup-only special-case: choose the tightest containing range, then smallest size
        if (measurements.length === 1 && measurements[0].isCupSize && userMeasurements.cup_size) {
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
                  candidates.push({ size: size.size || size.name, width: maxI - minI, centerDist: Math.abs(u - ((minI + maxI) / 2)) });
                }
              }
            });
            if (candidates.length > 0) {
              candidates.sort((a, b) => {
                if (a.width !== b.width) return a.width - b.width;
                if (a.centerDist !== b.centerDist) return a.centerDist - b.centerDist;
                return order.indexOf(b.size) - order.indexOf(a.size); // prefer larger size
              });
              const bestSize = candidates[0].size;
              resultDiv.innerHTML = '<div class="size-buddy-result-container" style="margin:25px auto;padding:25px;background-color:#f1f9f1;border-radius:10px;text-align:center;max-width:400px;box-shadow:0 3px 10px rgba(0,0,0,0.08);border-left:4px solid #4caf50;opacity:0;transform:translateY(20px);">\n  <div class="size-buddy-title" style="font-size:18px;color:#333;margin-bottom:15px;opacity:0;transform:translateY(10px);">Your Recommended Size</div>\n  <div class="size-buddy-size" style="font-size:42px;font-weight:700;color:#4caf50;margin:20px 0;opacity:0;transform:scale(0.9);">' + bestSize + '</div>\n  <p class="size-buddy-message" style="color:#666;margin:15px 0 0;opacity:0;transform:translateY(10px);">Based on your measurements, we recommend size ' + bestSize + '.</p>\n</div>';
              const styleEl = document.createElement('style');
              styleEl.textContent = '@keyframes containerFadeIn{0%{opacity:0;transform:translateY(20px);}100%{opacity:1;transform:translateY(0);}}@keyframes titleFadeIn{0%{opacity:0;transform:translateY(10px);}100%{opacity:1;transform:translateY(0);}}@keyframes sizePop{0%{opacity:0;transform:scale(0.9);}70%{opacity:1;transform:scale(1.1);}100%{opacity:1;transform:scale(1);}}@keyframes messageFadeIn{0%{opacity:0;transform:translateY(10px);}100%{opacity:1;transform:translateY(0);}}.size-buddy-result-container{animation:containerFadeIn .6s ease-out forwards}.size-buddy-title{animation:titleFadeIn .5s ease-out forwards .3s}.size-buddy-size{animation:sizePop .7s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards .5s}.size-buddy-message{animation:messageFadeIn .5s ease-out forwards .7s}';
              document.head.appendChild(styleEl);
              try { logSizeRecommendation(chart.id, bestSize, userMeasurements, shopDomain, productId); } catch {}
              return;
            }
          }
        }
        
        // Improved logic for Bikini Tops / Bras
        if (chart.category && chart.category === 'Bikini Tops / Bras' && userMeasurements.band_size && userMeasurements.cup_size) {
          let bestScore = -Infinity;
          let bestSizes = [];
          chart.sizes.forEach(size => {
            let bandInRange = false;
            let cupInRange = false;
            // Parse band size range
            if (size.band_size && typeof size.band_size === 'string' && size.band_size.includes('-')) {
              const [bandMin, bandMax] = size.band_size.split('-').map(v => parseInt(v.replace('+', '').trim(), 10));
              const userBand = parseInt(userMeasurements.band_size);
              if (!isNaN(bandMin) && !isNaN(bandMax) && !isNaN(userBand)) {
                bandInRange = userBand >= bandMin && userBand <= bandMax;
              }
            }
            // Parse cup size range
            if (size.cup_size && typeof size.cup_size === 'string' && size.cup_size.includes('-')) {
              const cupOrder = ['A','B','C','D','DD','DDD','F','G','H+'];
              const [cupMin, cupMax] = size.cup_size.split('-').map(v => v.trim());
              const userCup = userMeasurements.cup_size.trim().toUpperCase();
              const minIdx = cupOrder.indexOf(cupMin.toUpperCase());
              const maxIdx = cupOrder.indexOf(cupMax.toUpperCase());
              const userIdx = cupOrder.indexOf(userCup);
              if (minIdx !== -1 && maxIdx !== -1 && userIdx !== -1) {
                cupInRange = userIdx >= minIdx && userIdx <= maxIdx;
              }
            }
            let score = 0;
            if (bandInRange && cupInRange) score = 1.0;
            else if (cupInRange) score = 0.7;
            else if (bandInRange) score = 0.3;
            else score = 0;
            if (score > bestScore) {
              bestScore = score;
              bestSizes = [size.size || size.name];
            } else if (score === bestScore) {
              bestSizes.push(size.size || size.name);
            }
            console.log(`Size ${size.size} score: ${score.toFixed(2)}`);
          });
          if (bestSizes.length > 0) {
            // Pick the largest size if multiple
            bestSizes.sort((a, b) => {
              const order = ['XS','S','M','L','XL','XXL'];
              return order.indexOf(a) - order.indexOf(b);
            });
            bestSize = bestSizes[bestSizes.length - 1];
            bestScore = bestScore;
            console.log(`Selected ${bestSize} with score ${bestScore.toFixed(2)}`);
            // Show result and highlight as before
            resultDiv.innerHTML = 
              '<div class="size-buddy-result-container" style="margin:25px auto;padding:25px;background-color:#f1f9f1;border-radius:10px;text-align:center;max-width:400px;box-shadow:0 3px 10px rgba(0,0,0,0.08);border-left:4px solid #4caf50;opacity:0;transform:translateY(20px);">' +
                '<div class="size-buddy-title" style="font-size:18px;color:#333;margin-bottom:15px;opacity:0;transform:translateY(10px);">Your Recommended Size</div>' +
                '<div class="size-buddy-size" style="font-size:42px;font-weight:700;color:#4caf50;margin:20px 0;opacity:0;transform:scale(0.9);">' + bestSize + '</div>' +
                '<p class="size-buddy-message" style="color:#666;margin:15px 0 0;opacity:0;transform:translateY(10px);">Based on your measurements, we recommend size ' + bestSize + '.</p>' +
              '</div>';
            highlightSizeInChart(bestSize);
          }
        }
        
        if (bestSize) {
          console.log(`Selected ${bestSize} with score ${bestScore.toFixed(2)}`);
          
          // Create animation container with enhanced styling and animations
          resultDiv.innerHTML = 
            '<div class="size-buddy-result-container" style="margin:25px auto;padding:25px;background-color:#f1f9f1;border-radius:10px;text-align:center;max-width:400px;box-shadow:0 3px 10px rgba(0,0,0,0.08);border-left:4px solid #4caf50;opacity:0;transform:translateY(20px);">' +
              '<div class="size-buddy-title" style="font-size:18px;color:#333;margin-bottom:15px;opacity:0;transform:translateY(10px);">Your Recommended Size</div>' +
              '<div class="size-buddy-size" style="font-size:42px;font-weight:700;color:#4caf50;margin:20px 0;opacity:0;transform:scale(0.9);">' + bestSize + '</div>' +
              '<p class="size-buddy-message" style="color:#666;margin:15px 0 0;opacity:0;transform:translateY(10px);">Based on your measurements, we recommend size ' + bestSize + '.</p>' +
            '</div>';
            
            // Add enhanced animation styles
            const styleEl = document.createElement('style');
            styleEl.textContent = `
              @keyframes containerFadeIn {
                0% { opacity: 0; transform: translateY(20px); }
                100% { opacity: 1; transform: translateY(0); }
              }
              
              @keyframes titleFadeIn {
                0% { opacity: 0; transform: translateY(10px); }
                100% { opacity: 1; transform: translateY(0); }
              }
              
              @keyframes sizePop {
                0% { opacity: 0; transform: scale(0.9); }
                70% { opacity: 1; transform: scale(1.1); }
                100% { opacity: 1; transform: scale(1); }
              }
              
              @keyframes messageFadeIn {
                0% { opacity: 0; transform: translateY(10px); }
                100% { opacity: 1; transform: translateY(0); }
              }
              
              .size-buddy-result-container {
                animation: containerFadeIn 0.6s ease-out forwards;
              }
              
              .size-buddy-title {
                animation: titleFadeIn 0.5s ease-out forwards 0.3s;
              }
              
              .size-buddy-size {
                animation: sizePop 0.7s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards 0.5s;
              }
              
              .size-buddy-message {
                animation: messageFadeIn 0.5s ease-out forwards 0.7s;
              }
            `;
            document.head.appendChild(styleEl);
            
            // Highlight the recommended size in the chart
            highlightSizeInChart(bestSize);
            
            // --- ALWAYS log recommendation for all product types ---
            if (!window.sizeBuddyRecommendationLogged[productId]) {
              window.sizeBuddyRecommendationLogged[productId] = true;
              console.log('About to log recommendation:', { chartId: chart.id, bestSize, userMeasurements, shopDomain, productId });
              logSizeRecommendation(chart.id, bestSize, userMeasurements, shopDomain, productId);
            }
            return;
        } else {
          resultDiv.innerHTML = '<div style="color:#ff5252;padding:15px;background:#fff8f8;border-radius:8px;text-align:center;margin:15px auto;max-width:400px;box-shadow:0 2px 4px rgba(0,0,0,0.05);">Unable to determine a size recommendation</div>';
        }
        
      } catch (error) {
        console.error('Error calculating size:', error);
        resultDiv.innerHTML = '<div style="color:#ff5252;padding:15px;background:#fff8f8;border-radius:8px;text-align:center;margin:15px auto;max-width:400px;box-shadow:0 2px 4px rgba(0,0,0,0.05);">Error calculating recommendation</div>';
      }
    }
    
    // Function to highlight a size in the chart
    function highlightSizeInChart(sizeName) {
      try {
        // Reset all rows
        const allRows = document.querySelectorAll('[id^="size-chart-row-"]');
        allRows.forEach(row => {
          row.style.backgroundColor = row.rowIndex % 2 === 0 ? '#ffffff' : '#fafafa';
          row.style.fontWeight = 'normal';
        });
        
        // Highlight the recommended size row
        const rowToHighlight = document.getElementById(`size-chart-row-${sizeName}`);
        if (rowToHighlight) {
          rowToHighlight.style.backgroundColor = '#e8f5e9';
          rowToHighlight.style.fontWeight = 'bold';
          
          // Scroll to the row if it's out of view
          rowToHighlight.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      } catch (error) {
        console.error('Error highlighting size in chart:', error);
      }
    }

    function parseHeightValue(heightStr) {
      if (!heightStr || typeof heightStr !== 'string') {
        console.error('Invalid height value:', heightStr);
        return null;
      }

      const match = heightStr.match(/(\d+)'(\d+)"/);
      if (match) {
        const feet = parseInt(match[1]);
        const inches = parseInt(match[2]);
        if (!isNaN(feet) && !isNaN(inches)) {
          const totalInches = feet * 12 + inches;
          console.log(`Parsed height ${heightStr} to ${totalInches} inches`);
          return totalInches;
        }
      }

      console.error('Could not parse height value:', heightStr);
      return null;
    }

    function formatHeightValue(inches) {
      const feet = Math.floor(inches / 12);
      const remainingInches = Math.round(inches % 12);
      return `${feet}'${remainingInches}"`;
    }

    function getHeightValues(chart) {
      const heightValues = new Set();
      let minHeight = Infinity;
      let maxHeight = -Infinity;
      
      // First pass: find absolute min and max from the size chart
      chart.sizes.forEach(size => {
        if (size.height) {
          if (size.height.includes('-')) {
            const [min, max] = size.height.split('-').map(h => {
              const parsed = parseHeightValue(h.trim());
              return parsed;
            }).filter(Boolean);
            
            if (min !== undefined) {
              minHeight = Math.min(minHeight, min);
            }
            if (max !== undefined) {
              maxHeight = Math.max(maxHeight, max);
            }
          } else {
            const parsed = parseHeightValue(size.height);
            if (parsed !== null) {
              minHeight = Math.min(minHeight, parsed);
              maxHeight = Math.max(maxHeight, parsed);
            }
          }
        }
      });
      
      // Ensure we have valid min/max values
      if (minHeight === Infinity || maxHeight === -Infinity) {
        console.error('No valid height values found');
        return [];
      }
      
      // Create array of 5 evenly spaced heights
      const heightArray = [];
      const numSteps = 5;
      const stepSize = (maxHeight - minHeight) / (numSteps - 1);
      
      for (let i = 0; i < numSteps; i++) {
        const inches = Math.round(minHeight + (stepSize * i));
        heightArray.push(inches);
      }
      
      console.log('Generated height values:', {
        min: formatHeightValue(minHeight),
        max: formatHeightValue(maxHeight),
        steps: heightArray.map(v => formatHeightValue(v))
      });
      
      return heightArray;
    }

    async function loadSizeRecommendations() {
      try {
        console.log('Loading size recommendations for:', { productId, shopDomain });
        
        // Try app proxy first
        const proxyUrl = `https://${shopDomain}/apps/size-buddy/api/size-charts?product_id=${productId}&shop=${shopDomain}&_=${Date.now()}`;
        const response = await fetch(proxyUrl);
        
        if (!response.ok) {
          throw new Error(`Failed to load size chart data: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (!data.found || !data.chart || !data.chart.sizes || !data.chart.sizes.length) {
          throw new Error('No valid size chart found');
        }
        
        console.log('Size chart data loaded:', data.chart);
        
        // Get height values from the chart
        const heightValues = getHeightValues(data.chart);
        if (!heightValues.length) {
          throw new Error('No valid height values found in size chart');
        }
        
        // Create the height slider
        const min = heightValues[0]; // This will be 5'3" from your size chart
        const max = heightValues[heightValues.length - 1];
        console.log('Height slider range:', formatHeightValue(min), 'to', formatHeightValue(max));
        
        // Create labels for each height value
        const labelsHtml = heightValues
          .filter((_, index) => index === 0 || index === heightValues.length - 1 || heightValues.length <= 8 || index % Math.floor(heightValues.length / 8) === 0)
          .map(value => `<span style="color:#666;font-size:12px;">${formatHeightValue(value)}</span>`)
          .join('');
        
        // Calculate initial position - start in the middle
        const initialValue = Math.round((min + max) / 2);
        const initialPercent = 50; // Start in middle position
        
        const sliderHtml = `
          <div class="size-slider-container" data-measurement="height" style="margin-bottom:25px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
              <span style="font-weight:500;color:#333;font-size:15px;">Height</span>
              <div class="slider-value" id="size-buddy-value-height" data-value="${initialValue}" style="color:#4A90E2;font-weight:600;background-color:#f1f8fe;padding:4px 8px;border-radius:4px;min-width:40px;text-align:center;">
                ${formatHeightValue(initialValue)}
              </div>
            </div>
            <div class="slider-container" 
                 data-min="${min}" 
                 data-max="${max}"
                 data-height-values='${JSON.stringify(heightValues)}'
                 style="position:relative;height:40px;width:100%;touch-action:none;overflow:visible;">
              <div class="slider-track"></div>
              <div class="slider-filled" style="width:${initialPercent}%"></div>
              <div class="slider-handle" style="left:${initialPercent}%"></div>
              <div class="slider-ticks">
                ${heightValues.map(() => '<div class="tick"></div>').join('')}
              </div>
            </div>
            <div class="slider-labels" style="display:flex;justify-content:space-between;margin-top:5px;">
              ${labelsHtml}
            </div>
          </div>
        `;
        
        // Add the slider to the form
        document.getElementById('size-buddy-content').innerHTML = sliderHtml;
        
        // Initialize the slider
        const container = document.querySelector('.size-slider-container');
        const slider = container.querySelector('.slider-container');
        const handle = slider.querySelector('.slider-handle');
        const filled = slider.querySelector('.slider-filled');
        const valueDisplay = container.querySelector('.slider-value');
        
        let isDragging = false;
        
        function updateSlider(clientX) {
          const rect = slider.getBoundingClientRect();
          const offsetX = clientX - rect.left;
          let percent = Math.max(0, Math.min(100, (offsetX / rect.width) * 100));
          
          const measurementId = container.getAttribute('data-measurement');
          const minValue = parseFloat(slider.getAttribute('data-min'));
          const maxValue = parseFloat(slider.getAttribute('data-max'));
          const range = maxValue - minValue;
          let value, formattedValue;
          
          if (measurementId === 'height') {
            try {
              // Calculate the target height in inches
              const targetValue = minValue + (percent / 100) * range;
              // Round to nearest inch
              value = Math.round(targetValue);
              // Ensure value stays within bounds
              value = Math.max(minValue, Math.min(maxValue, value));
              
              // Recalculate percent based on the selected value
              percent = ((value - minValue) / range) * 100;
              formattedValue = formatHeightValue(value);
              
              console.log('Height slider updated:', {
                targetValue,
                selectedValue: value,
                formattedValue
              });
            } catch (error) {
              console.error('Error processing height value:', error);
              return;
            }
          } else {
            // For other measurements like weight, band size, etc.
            const stepSize = range <= 20 ? 1 : 2;
            const numSteps = Math.ceil(range / stepSize);
            const percentPerStep = 100 / numSteps;
            const stepIndex = Math.round(percent / percentPerStep);
            
            percent = stepIndex * percentPerStep;
            value = Math.round(minValue + (stepIndex * stepSize));
            formattedValue = value.toString();
          }
          
          // Update the slider UI
          filled.style.width = percent + '%';
          handle.style.left = percent + '%';
          valueDisplay.textContent = formattedValue;
          valueDisplay.setAttribute('data-value', value);
        }
        
        handle.addEventListener('mousedown', () => {
          isDragging = true;
        });
        
        document.addEventListener('mousemove', (e) => {
          if (isDragging) {
            updateSlider(e.clientX);
          }
        });
        
        document.addEventListener('mouseup', () => {
          isDragging = false;
        });
        
        slider.addEventListener('click', (e) => {
          updateSlider(e.clientX);
        });
        
      } catch (error) {
        console.error('Error loading size recommendations:', error);
        document.getElementById('size-buddy-content').innerHTML = 
          '<div class="error">Failed to load size recommendations. Please try again later.</div>';
      }
    }
  }
  
  // Function to log size recommendations for analytics
  async function logSizeRecommendation(chartId, recommendedSize, measurements, shopDomain, productId) {
    try {
      console.log('logSizeRecommendation called with:', { chartId, recommendedSize, measurements, shopDomain, productId });
      // Use direct backend URL first
      const backendUrls = [
        (window.SIZE_BUDDY_HOST || 'https://sizebuddy.onrender.com')
      ];
      let logSuccess = false;
      for (const backendUrl of backendUrls) {
        try {
          console.log(`Trying to log recommendation to ${backendUrl}`);
          const response = await fetch(`${backendUrl}/api/log-recommendation`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              shop: shopDomain,
              product_id: productId,
              chart_id: chartId,
              recommended_size: recommendedSize,
              measurements: measurements
            })
          });
          if (response.ok) {
            console.log('Successfully logged recommendation to direct backend');
            logSuccess = true;
            break;
          } else {
            console.error('Failed to log recommendation to direct backend:', response.status, await response.text());
          }
        } catch (error) {
          console.log(`Failed to log to ${backendUrl}:`, error);
        }
      }
      // If direct backend failed, try app proxy
      if (!logSuccess) {
        console.log('Falling back to app proxy for logging');
        try {
          const response = await fetch(`https://${shopDomain}/apps/size-buddy/api/proxy/log-recommendation`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              shop: shopDomain,
              product_id: productId,
              chart_id: chartId,
              recommended_size: recommendedSize,
              measurements: measurements
            })
          });
          if (response.ok) {
            console.log('Successfully logged recommendation to app proxy');
          } else {
            console.error('Failed to log recommendation to app proxy:', response.status, await response.text());
          }
        } catch (error) {
          console.error('Error logging recommendation to app proxy:', error);
        }
      }
    } catch (error) {
      console.error('Error logging recommendation:', error);
      // Don't stop execution if logging fails
    }
  }
  
  // Run immediately if DOM is ready, otherwise wait
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWidget);
  } else {
    initWidget();
  }
})(); 